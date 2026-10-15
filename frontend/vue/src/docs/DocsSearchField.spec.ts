import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsSearchField from './DocsSearchField.vue'

// Mounted fields listen on the document; unmount each so tests cannot hear one another.
enableAutoUnmount(afterEach)

function mountField(props: { modelValue?: string; shortcut?: boolean; landmark?: boolean } = {}) {
  const parentKeydown = vi.fn()
  const wrapper = mount(DocsSearchField, {
    props: { modelValue: '', ...props },
    attachTo: document.body,
  })
  document.body.addEventListener('keydown', parentKeydown)
  return { wrapper, parentKeydown, input: wrapper.get('input') }
}

/** The values the field has committed to its parent so far. */
function committed(wrapper: ReturnType<typeof mountField>['wrapper']): string[] {
  return (wrapper.emitted('update:modelValue') ?? []).map((args) => args[0] as string)
}

describe('DocsSearchField', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  describe('structure', () => {
    it('is a search input named "Search the docs" with an uppercase hint', () => {
      const { input } = mountField()
      expect(input.attributes('aria-label')).toBe('Search the docs')
      expect(input.attributes('placeholder')).toBe('SEARCH DOCS')
      expect(input.attributes('type')).toBe('search')
    })

    it("is the page's search landmark by default", () => {
      const { wrapper } = mountField()
      expect(wrapper.find('[role="search"]').exists()).toBe(true)
    })

    it('can drop the landmark for a second field on the page', () => {
      const { wrapper } = mountField({ landmark: false })
      expect(wrapper.find('[role="search"]').exists()).toBe(false)
    })

    it('shows the committed query', () => {
      const { input } = mountField({ modelValue: 'radio' })
      expect((input.element as HTMLInputElement).value).toBe('radio')
    })
  })

  describe('typing', () => {
    it('commits only after typing pauses for 150 ms', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('sdr')
      vi.advanceTimersByTime(149)
      expect(committed(wrapper)).toEqual([])
      vi.advanceTimersByTime(1)
      expect(committed(wrapper)).toEqual(['sdr'])
    })

    it('commits only the last text when typing continues', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('s')
      vi.advanceTimersByTime(100)
      await input.setValue('sd')
      vi.advanceTimersByTime(100)
      await input.setValue('sdr')
      vi.advanceTimersByTime(150)
      expect(committed(wrapper)).toEqual(['sdr'])
    })

    it('does not commit text that equals what is already committed', async () => {
      const { wrapper, input } = mountField({ modelValue: 'sdr' })
      await input.setValue('sdrx')
      await input.setValue('sdr')
      vi.advanceTimersByTime(500)
      expect(committed(wrapper)).toEqual([])
    })

    it('shows an external change (Back to an earlier search) in the box', async () => {
      const { wrapper, input } = mountField({ modelValue: 'first' })
      await wrapper.setProps({ modelValue: 'second' })
      expect((input.element as HTMLInputElement).value).toBe('second')
    })

    it('does not fight the reader: a committed echo of the typed text changes nothing', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('sdr')
      vi.advanceTimersByTime(150)
      await wrapper.setProps({ modelValue: 'sdr' })
      expect((input.element as HTMLInputElement).value).toBe('sdr')
      vi.advanceTimersByTime(500)
      expect(committed(wrapper)).toEqual(['sdr'])
    })

    it('stops a pending commit when removed', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('sdr')
      wrapper.unmount()
      vi.advanceTimersByTime(500)
      expect(committed(wrapper)).toEqual([])
    })
  })

  describe('Enter', () => {
    it('commits at once', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('sdr')
      await input.trigger('keydown', { key: 'Enter' })
      expect(committed(wrapper)).toEqual(['sdr'])
      // The pending debounce was cancelled, not run a second time.
      vi.advanceTimersByTime(500)
      expect(committed(wrapper)).toEqual(['sdr'])
    })

    it('searches again even for text that was only pre-filled (the not-found guess)', async () => {
      const { wrapper, input } = mountField({ modelValue: 'recording' })
      await input.trigger('keydown', { key: 'Enter' })
      expect(committed(wrapper)).toEqual(['recording'])
    })
  })

  describe('ArrowDown', () => {
    it('hands focus to the results and commits what was typed first', async () => {
      const { wrapper, input } = mountField()
      await input.setValue('sdr')
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        cancelable: true,
        bubbles: true,
      })
      input.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(committed(wrapper)).toEqual(['sdr'])
      expect(wrapper.emitted('focus-results')).toHaveLength(1)
    })

    it('does not commit again when nothing changed, but still moves to the results', async () => {
      const { wrapper, input } = mountField({ modelValue: 'sdr' })
      await input.trigger('keydown', { key: 'ArrowDown' })
      expect(committed(wrapper)).toEqual([])
      expect(wrapper.emitted('focus-results')).toHaveLength(1)
    })
  })

  describe('Escape', () => {
    it('clears the text, commits the empty query at once and keeps the key from closing Docs', async () => {
      const { wrapper, input, parentKeydown } = mountField({ modelValue: 'sdr' })
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
      input.element.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      expect(event.defaultPrevented).toBe(true)
      expect((input.element as HTMLInputElement).value).toBe('')
      expect(committed(wrapper)).toEqual([''])
      expect(parentKeydown).not.toHaveBeenCalled()
    })

    it('with nothing to clear does nothing, but still keeps the key from closing Docs', async () => {
      const { wrapper, input, parentKeydown } = mountField()
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
      input.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(committed(wrapper)).toEqual([])
      expect(parentKeydown).not.toHaveBeenCalled()
    })

    it('ignores other keys', async () => {
      const { wrapper, input } = mountField({ modelValue: 'sdr' })
      await input.trigger('keydown', { key: 'a' })
      expect(committed(wrapper)).toEqual([])
      expect(wrapper.emitted('focus-results')).toBeUndefined()
    })
  })

  describe('clear button', () => {
    it('clears and commits the empty query at once', async () => {
      const { wrapper, input } = mountField({ modelValue: 'sdr' })
      await wrapper.get('button').trigger('click')
      expect((input.element as HTMLInputElement).value).toBe('')
      expect(committed(wrapper)).toEqual([''])
      expect(document.activeElement).toBe(input.element)
    })

    it('is named "Clear search"', () => {
      const { wrapper } = mountField({ modelValue: 'sdr' })
      expect(wrapper.get('button').attributes('aria-label')).toBe('Clear search')
    })
  })

  describe('the / shortcut', () => {
    function pressSlash(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
        ...init,
      })
      target.dispatchEvent(event)
      return event
    }

    it('focuses the field from anywhere on the page', () => {
      const { input } = mountField()
      const event = pressSlash(document.body)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(input.element)
    })

    it.each(['input', 'textarea', 'select'])(
      'does not steal the key while typing in a %s',
      (tag) => {
        const { input } = mountField()
        const other = document.createElement(tag)
        document.body.appendChild(other)
        other.focus()
        const event = pressSlash(other)
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).not.toBe(input.element)
      },
    )

    it('does not steal the key from a contenteditable region', () => {
      const { input } = mountField()
      const editable = document.createElement('div')
      editable.setAttribute('contenteditable', 'true')
      document.body.appendChild(editable)
      const event = pressSlash(editable)
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).not.toBe(input.element)
    })

    it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
      'leaves browser shortcuts alone (%o)',
      (modifier) => {
        const { input } = mountField()
        const event = pressSlash(document.body, modifier)
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).not.toBe(input.element)
      },
    )

    it('ignores other keys', () => {
      const { input } = mountField()
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).not.toBe(input.element)
    })

    it('does nothing when the field opts out (a second field on the page)', () => {
      const { input } = mountField({ shortcut: false })
      const event = pressSlash(document.body)
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).not.toBe(input.element)
    })

    it('stops listening when the field is removed', () => {
      const { wrapper } = mountField()
      wrapper.unmount()
      const event = pressSlash(document.body)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('exposed controls', () => {
    it('moves focus into the field', () => {
      const { wrapper, input } = mountField()
      ;(wrapper.vm as unknown as { focus: () => void }).focus()
      expect(document.activeElement).toBe(input.element)
    })

    it('selects the text in the field', () => {
      const { wrapper, input } = mountField({ modelValue: 'guess' })
      ;(wrapper.vm as unknown as { select: () => void }).select()
      const element = input.element as HTMLInputElement
      expect([element.selectionStart, element.selectionEnd]).toEqual([0, 5])
    })
  })

  it('has no accessibility violations', async () => {
    vi.useRealTimers() // axe schedules with timers
    const { wrapper } = mountField({ modelValue: 'sdr' })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
