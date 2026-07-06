import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseNumberSetting from './BaseNumberSetting.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Builds a fake store: a boxed number plus read/mirror/hydrate callbacks. */
function makeFakeStore(initialValue: number) {
  let storeValue = initialValue
  const hydrateFromDb = vi.fn(async () => {
    // no-op by default; tests override with mockImplementation as needed
  })
  const readFromStore = vi.fn(() => storeValue)
  const mirrorToStore = vi.fn((nextValue: number) => {
    storeValue = nextValue
  })
  return {
    hydrateFromDb,
    readFromStore,
    mirrorToStore,
    getValue: () => storeValue,
    setValue: (nextValue: number) => {
      storeValue = nextValue
    },
  }
}

describe('BaseNumberSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the initial store value and unit suffix as valid', async () => {
    const store = makeFakeStore(10)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 'NM',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('10')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(wrapper.text()).toContain('NM')
  })

  it('calls hydrateFromDb on mount and re-reads the store', async () => {
    const store = makeFakeStore(0)
    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue(12)
    })
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    expect(store.hydrateFromDb).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('12')
  })

  it('re-syncs from the DB when sentinel:config-uploaded fires by default', async () => {
    const store = makeFakeStore(0)
    mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue(7)
    })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(store.readFromStore()).toBe(7)
  })

  it('does not wire the config-uploaded listener when syncOnConfigUpload is false', async () => {
    const store = makeFakeStore(0)
    const addSpy = vi.spyOn(document, 'addEventListener')
    mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        syncOnConfigUpload: false,
      },
    })
    await flushPromises()
    expect(addSpy).not.toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
    addSpy.mockRestore()
  })

  it('mirrors a valid value into the store immediately and stages the default DB write', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('5')
    expect(store.getValue()).toBe(5)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    expect(settingsApi.put).not.toHaveBeenCalled()
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'exampleSetting', 5)
  })

  it('defers the store mirror and DB write to the staged writer when deferMirror is set', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        deferMirror: true,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('5')
    // Local text reflects the typed value, but the store must NOT change yet.
    expect(store.getValue()).toBe(0)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(store.getValue()).toBe(5)
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'exampleSetting', 5)
  })

  it('uses a custom buildStagedWriter instead of the default settingsApi.put call', async () => {
    const store = makeFakeStore(0)
    const customWriter = vi.fn().mockResolvedValue(undefined)
    const buildStagedWriter = vi.fn(() => customWriter)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        buildStagedWriter,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('9')
    const staged = wrapper.emitted('stage')
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(customWriter).toHaveBeenCalledTimes(1)
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('strips non-digit characters when allowDecimal is unset (default integers-only)', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('5a.9')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('59')
    expect(store.getValue()).toBe(59)
  })

  it('allows a decimal point and fractional digits when allowDecimal is set', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 'NM',
        namespace: 'air',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        allowDecimal: true,
        minValue: 0,
        minExclusive: true,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('2.5')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2.5')
    expect(store.getValue()).toBe(2.5)
  })

  it('marks a malformed decimal (multiple decimal points) invalid and does not stage', async () => {
    const store = makeFakeStore(10)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 'NM',
        namespace: 'air',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        allowDecimal: true,
        minExclusive: true,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('1.2.3')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('treats an empty value as invalid and does not stage', async () => {
    const store = makeFakeStore(10)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('snaps a cleared field to "0" when a re-sync hydrates the value to exactly zero', async () => {
    // Regression guard: Number('') === 0, so a naive "already matches" check
    // would treat a blank field as already representing a hydrated 0 and
    // leave it blank instead of snapping to "0" like the original controls.
    const store = makeFakeStore(5)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')

    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue(0)
    })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('0')
  })

  it('treats a value equal to a non-exclusive minValue as valid', async () => {
    const store = makeFakeStore(5)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        minValue: 0,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
    expect(store.getValue()).toBe(0)
  })

  it('treats a value equal to an exclusive minValue as invalid', async () => {
    const store = makeFakeStore(10)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 'NM',
        namespace: 'air',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        minValue: 0,
        minExclusive: true,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('does not rewrite the typed text when it already parses to the newly staged value', async () => {
    // Regression guard for the value<->inputText sync heuristic: typing a
    // leading zero ("025") must not be rewritten to "25" after the store
    // mirrors the parsed number back through `value`.
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        maxLength: 3,
      },
    })
    await flushPromises()
    await wrapper.find('input').setValue('025')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('025')
    expect(store.getValue()).toBe(25)
  })

  it('applies the maxlength attribute when provided', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        maxLength: 3,
      },
    })
    await flushPromises()
    expect(wrapper.find('input').attributes('maxlength')).toBe('3')
  })

  it('omits the maxlength attribute when not provided', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    expect(wrapper.find('input').attributes('maxlength')).toBeUndefined()
  })

  it('emits commit on Enter', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('forwards the disabled prop to the input', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        disabled: true,
      },
    })
    await flushPromises()
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })

  it('has no accessibility violations', async () => {
    const store = makeFakeStore(0)
    const wrapper = mount(BaseNumberSetting, {
      props: {
        accessibleName: 'Example number setting',
        unit: 's',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
