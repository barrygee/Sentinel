import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'

/** A stand-in for one Monaco editor instance, recording what the component does to it. */
function makeFakeEditor(initialText: string) {
  let text = initialText
  let contentListener: ((change: { isFlush: boolean }) => void) | null = null
  const formatAction = { run: vi.fn().mockResolvedValue(undefined) }
  const foldSectionsAction = { run: vi.fn().mockResolvedValue(undefined) }
  const actions: Record<string, typeof formatAction> = {
    'editor.action.formatDocument': formatAction,
    'editor.foldLevel2': foldSectionsAction,
  }
  const model = { dispose: vi.fn() }
  return {
    getValue: vi.fn(() => text),
    setValue: vi.fn((next: string) => {
      text = next
      contentListener?.({ isFlush: true })
    }),
    onDidChangeModelContent: vi.fn((listener: (change: { isFlush: boolean }) => void) => {
      contentListener = listener
    }),
    getAction: vi.fn((id: string): typeof formatAction | null => actions[id] ?? null),
    getModel: vi.fn(() => model),
    dispose: vi.fn(),
    formatAction,
    foldSectionsAction,
    model,
    /** What the user typing does: new text, then a non-flush change event. */
    typeText(next: string) {
      text = next
      contentListener?.({ isFlush: false })
    },
  }
}

type FakeEditor = ReturnType<typeof makeFakeEditor>

const monacoState: { editor: FakeEditor | null; createOptions: Record<string, unknown> | null } = {
  editor: null,
  createOptions: null,
}
const fakeMonaco = {
  editor: {
    ShowLightbulbIconMode: { Off: 'off' },
    defineTheme: vi.fn(),
    create: vi.fn((_host: HTMLElement, options: Record<string, unknown>) => {
      monacoState.createOptions = options
      monacoState.editor = makeFakeEditor(String(options.value))
      return monacoState.editor
    }),
  },
}
const loadMonaco = vi.fn(() => Promise.resolve(fakeMonaco))

vi.mock('@sentinel/shell-api/settings/codeEditor/loadMonaco', () => ({
  loadMonaco: () => loadMonaco(),
}))

const { default: JsonCodeEditor } = await import('./JsonCodeEditor.vue')

function mountEditor(modelValue = '{\n  "a": 1\n}') {
  return mount(JsonCodeEditor, {
    props: { modelValue, accessibleName: 'Editable test JSON' },
    attachTo: document.body,
  })
}

describe('JsonCodeEditor', () => {
  beforeEach(() => {
    monacoState.editor = null
    monacoState.createOptions = null
    fakeMonaco.editor.create.mockClear()
    fakeMonaco.editor.defineTheme.mockClear()
    loadMonaco.mockImplementation(() => Promise.resolve(fakeMonaco))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('says it is loading until Monaco arrives, then shows the hint instead', async () => {
    let resolveLoad: (api: typeof fakeMonaco) => void = () => {}
    loadMonaco.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)))
    const wrapper = mountEditor()
    expect(wrapper.get('[role="status"]').text()).toBe('Loading editor…')
    expect(wrapper.find('.json-code-editor__host--ready').exists()).toBe(false)
    resolveLoad(fakeMonaco)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('.json-code-editor__host--ready').exists()).toBe(true)
    expect(wrapper.get('.json-code-editor__hint').text()).toContain('Ctrl+M')
    wrapper.unmount()
  })

  it('creates a JSON editor with the text, the accessible name and the Sentinel theme', async () => {
    const wrapper = mountEditor('{"a":1}')
    await flushPromises()
    expect(fakeMonaco.editor.defineTheme).toHaveBeenCalledWith('sentinel', expect.any(Object))
    expect(monacoState.createOptions).toMatchObject({
      value: '{"a":1}',
      language: 'json',
      theme: 'sentinel',
      ariaLabel: 'Editable test JSON',
      tabSize: 2,
      insertSpaces: true,
      minimap: { enabled: false },
      bracketPairColorization: { enabled: false },
      quickSuggestions: false,
      codeLens: false,
      lightbulb: { enabled: 'off' },
    })
    wrapper.unmount()
  })

  it("sizes the code from the app's --settings-text-value, falling back to 13px", async () => {
    const first = mountEditor()
    await flushPromises()
    expect(monacoState.createOptions?.fontSize).toBe(13)
    first.unmount()

    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = realGetComputedStyle(element)
      return new Proxy(style, {
        get(target, property) {
          if (property === 'getPropertyValue')
            return (name: string) =>
              name === '--settings-text-value' ? '15px' : target.getPropertyValue(name)
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    })
    const second = mountEditor()
    await flushPromises()
    expect(monacoState.createOptions?.fontSize).toBe(15)
    second.unmount()
  })

  it("emits the user's edits but not the text the parent sets", async () => {
    const wrapper = mountEditor('{}')
    await flushPromises()
    monacoState.editor!.typeText('{"b":2}')
    expect(wrapper.emitted('update:modelValue')).toEqual([['{"b":2}']])
    await wrapper.setProps({ modelValue: '{"c":3}' })
    expect(monacoState.editor!.setValue).toHaveBeenCalledWith('{"c":3}')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    wrapper.unmount()
  })

  it('leaves the editor alone when the parent echoes back the text it already shows', async () => {
    const wrapper = mountEditor('{}')
    await flushPromises()
    monacoState.editor!.typeText('{"b":2}')
    await wrapper.setProps({ modelValue: '{"b":2}' })
    expect(monacoState.editor!.setValue).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores text from the parent that arrives before the editor exists', async () => {
    let resolveLoad: (api: typeof fakeMonaco) => void = () => {}
    loadMonaco.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)))
    const wrapper = mountEditor('{}')
    await wrapper.setProps({ modelValue: '{"early":true}' })
    resolveLoad(fakeMonaco)
    await flushPromises()
    // The editor is created from the latest text instead.
    expect(monacoState.createOptions?.value).toBe('{"early":true}')
    wrapper.unmount()
  })

  it('opens folded to its top-level sections', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    expect(monacoState.editor!.foldSectionsAction.run).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('folds again when the parent sets new text, but not on an echo of the same text', async () => {
    const wrapper = mountEditor('{}')
    await flushPromises()
    await wrapper.setProps({ modelValue: '{"c":3}' })
    expect(monacoState.editor!.foldSectionsAction.run).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ modelValue: '{"c":3}' })
    monacoState.editor!.typeText('{"d":4}')
    expect(monacoState.editor!.foldSectionsAction.run).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('still opens when Monaco has no fold action', async () => {
    fakeMonaco.editor.create.mockImplementationOnce(
      (_host: HTMLElement, options: Record<string, unknown>) => {
        monacoState.createOptions = options
        monacoState.editor = makeFakeEditor(String(options.value))
        monacoState.editor.getAction.mockReturnValue(null)
        return monacoState.editor
      },
    )
    const wrapper = mountEditor()
    await flushPromises()
    expect(wrapper.find('.json-code-editor__host--ready').exists()).toBe(true)
    wrapper.unmount()
  })

  it('formats the document through format(), and does nothing before the editor loads', async () => {
    let resolveLoad: (api: typeof fakeMonaco) => void = () => {}
    loadMonaco.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)))
    const wrapper = mountEditor()
    const exposed = wrapper.vm as unknown as { format: () => Promise<void> }
    await expect(exposed.format()).resolves.toBeUndefined()
    resolveLoad(fakeMonaco)
    await flushPromises()
    await exposed.format()
    expect(monacoState.editor!.formatAction.run).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('tolerates a missing format action', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    monacoState.editor!.getAction.mockReturnValue(null)
    const exposed = wrapper.vm as unknown as { format: () => Promise<void> }
    await expect(exposed.format()).resolves.toBeUndefined()
    wrapper.unmount()
  })

  it('says so when Monaco fails to load', async () => {
    loadMonaco.mockImplementation(() => Promise.reject(new Error('offline')))
    const wrapper = mountEditor()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain("The editor couldn't load")
    expect(fakeMonaco.editor.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('disposes the editor and its model when it goes away', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    const editor = monacoState.editor!
    wrapper.unmount()
    expect(editor.model.dispose).toHaveBeenCalled()
    expect(editor.dispose).toHaveBeenCalled()
  })

  it('never builds an editor when it is removed while Monaco is still loading', async () => {
    let resolveLoad: (api: typeof fakeMonaco) => void = () => {}
    loadMonaco.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)))
    const wrapper = mountEditor()
    wrapper.unmount()
    resolveLoad(fakeMonaco)
    await flushPromises()
    expect(fakeMonaco.editor.create).not.toHaveBeenCalled()
  })

  it('keeps Escape inside the editor, so it never closes the panel around it', async () => {
    const outside = vi.fn()
    document.body.addEventListener('keydown', outside)
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('.json-code-editor__host').trigger('keydown', { key: 'Escape' })
    expect(outside).not.toHaveBeenCalled()
    await wrapper.get('.json-code-editor__host').trigger('keydown', { key: 'a' })
    expect(outside).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('keydown', outside)
    wrapper.unmount()
  })

  // `region` is off as in every component spec: a component alone has no page landmarks.
  const AXE_OPTIONS = { rules: { region: { enabled: false } } }

  it('has no accessibility violations while loading, ready or failed', async () => {
    let resolveLoad: (api: typeof fakeMonaco) => void = () => {}
    loadMonaco.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)))
    const loading = mountEditor()
    expect(await axe(loading.html(), AXE_OPTIONS)).toHaveNoViolations()
    resolveLoad(fakeMonaco)
    await flushPromises()
    expect(await axe(loading.html(), AXE_OPTIONS)).toHaveNoViolations()
    loading.unmount()

    loadMonaco.mockImplementation(() => Promise.reject(new Error('offline')))
    const failed = mountEditor()
    await flushPromises()
    expect(await axe(failed.html(), AXE_OPTIONS)).toHaveNoViolations()
    failed.unmount()
  })
})
