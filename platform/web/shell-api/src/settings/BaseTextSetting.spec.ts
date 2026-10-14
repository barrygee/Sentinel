import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseTextSetting from './BaseTextSetting.vue'

vi.mock('../services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '../services/settingsApi'

/** Builds a fake store: a boxed string plus read/mirror/hydrate callbacks. */
function makeFakeStore(initialValue: string) {
  let storeValue = initialValue
  const hydrateFromDb = vi.fn(async () => {})
  const readFromStore = vi.fn(() => storeValue)
  const mirrorToStore = vi.fn((nextValue: string) => {
    storeValue = nextValue
  })
  return {
    hydrateFromDb,
    readFromStore,
    mirrorToStore,
    getValue: () => storeValue,
    setValue: (nextValue: string) => {
      storeValue = nextValue
    },
  }
}

/** Refuses anything with a space, so tests can drive the invalid state. */
const noSpaces = (text: string) => (text.includes(' ') ? 'No spaces allowed' : null)

function mountSetting(
  store: ReturnType<typeof makeFakeStore>,
  extraProps: Record<string, unknown> = {},
) {
  return mount(BaseTextSetting, {
    props: {
      accessibleName: 'Example text setting',
      namespace: 'sdr',
      settingKey: 'exampleText',
      hydrateFromDb: store.hydrateFromDb,
      readFromStore: store.readFromStore,
      mirrorToStore: store.mirrorToStore,
      ...extraProps,
    },
    attachTo: document.body,
  })
}

describe('BaseTextSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
    document.body.innerHTML = ''
  })

  it('renders the store value as a valid, named text input with no message', async () => {
    const wrapper = mountSetting(makeFakeStore('noaa'))
    await flushPromises()

    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('noaa')
    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('aria-label')).toBe('Example text setting')
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(input.attributes('aria-describedby')).toBeUndefined()
    expect(input.classes()).not.toContain('text-setting-input--invalid')
    expect(wrapper.get('[role="alert"]').text()).toBe('')
  })

  it('shows the placeholder and maxlength it is given', async () => {
    const wrapper = mountSetting(makeFakeStore(''), {
      placeholder: 'Recordings root',
      maxLength: 12,
    })
    await flushPromises()

    expect(wrapper.get('input').attributes('placeholder')).toBe('Recordings root')
    expect(wrapper.get('input').attributes('maxlength')).toBe('12')
  })

  it('omits maxlength and shows an empty placeholder by default', async () => {
    const wrapper = mountSetting(makeFakeStore(''))
    await flushPromises()

    expect(wrapper.get('input').attributes('maxlength')).toBeUndefined()
    expect(wrapper.get('input').attributes('placeholder')).toBe('')
  })

  it('hydrates from the DB on mount and shows the hydrated value', async () => {
    const store = makeFakeStore('')
    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue('from-db')
    })
    const wrapper = mountSetting(store)
    await flushPromises()

    expect(store.hydrateFromDb).toHaveBeenCalledTimes(1)
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('from-db')
  })

  it('re-syncs the shown text when the config file changes the value', async () => {
    const store = makeFakeStore('before')
    const wrapper = mountSetting(store)
    await flushPromises()
    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue('after')
    })

    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('after')
  })

  it('mirrors a valid edit into the store at once and stages the DB write for APPLY', async () => {
    const store = makeFakeStore('')
    const wrapper = mountSetting(store, { validate: noSpaces })
    await flushPromises()

    await wrapper.get('input').setValue('satellites')

    expect(store.getValue()).toBe('satellites')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    expect(settingsApi.put).not.toHaveBeenCalled()
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'exampleText', 'satellites')
  })

  it('accepts anything when no validate is given', async () => {
    const store = makeFakeStore('')
    const wrapper = mountSetting(store)
    await flushPromises()

    await wrapper.get('input').setValue('with spaces ../ anything')

    expect(wrapper.emitted('stage')).toHaveLength(1)
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('false')
  })

  it('marks an invalid edit, announces why, and stages nothing', async () => {
    const store = makeFakeStore('ok')
    const wrapper = mountSetting(store, { validate: noSpaces })
    await flushPromises()

    await wrapper.get('input').setValue('not ok')

    const input = wrapper.get('input')
    const message = wrapper.get('[role="alert"]')
    expect(input.classes()).toContain('text-setting-input--invalid')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(message.text()).toBe('No spaces allowed')
    // The message is the input's description, so a screen reader reads it with the field.
    expect(input.attributes('aria-describedby')).toBe(message.attributes('id'))
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(store.getValue()).toBe('ok')
  })

  it('clears the message and stages once the text is valid again', async () => {
    const store = makeFakeStore('')
    const wrapper = mountSetting(store, { validate: noSpaces })
    await flushPromises()

    await wrapper.get('input').setValue('a b')
    await wrapper.get('input').setValue('ab')

    expect(wrapper.get('[role="alert"]').text()).toBe('')
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.emitted('stage')).toHaveLength(1)
    expect(store.getValue()).toBe('ab')
  })

  it('gives each instance in the app its own message id', async () => {
    const store = makeFakeStore('')
    const settingProps = {
      accessibleName: 'Example text setting',
      namespace: 'sdr',
      settingKey: 'exampleText',
      hydrateFromDb: store.hydrateFromDb,
      readFromStore: store.readFromStore,
      mirrorToStore: store.mirrorToStore,
    }
    const TwoSettings = defineComponent({
      render: () => [h(BaseTextSetting, settingProps), h(BaseTextSetting, settingProps)],
    })
    const wrapper = mount(TwoSettings)
    await flushPromises()

    const ids = wrapper.findAll('[role="alert"]').map((message) => message.attributes('id'))
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('emits commit on Enter', async () => {
    const wrapper = mountSetting(makeFakeStore(''))
    await flushPromises()

    await wrapper.get('input').trigger('keydown.enter')

    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('forwards the disabled prop to the input', async () => {
    const wrapper = mountSetting(makeFakeStore(''), { disabled: true })
    await flushPromises()

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })

  it('has no accessibility violations, valid or invalid', async () => {
    const wrapper = mountSetting(makeFakeStore(''), { validate: noSpaces })
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()

    await wrapper.get('input').setValue('a b')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
