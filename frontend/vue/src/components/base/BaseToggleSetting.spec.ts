import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseToggleSetting from './BaseToggleSetting.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Builds a fake store: a boxed boolean plus read/mirror/hydrate callbacks. */
function makeFakeStore(initialValue: boolean) {
  let storeValue = initialValue
  const hydrateFromDb = vi.fn(async () => {
    // no-op by default; tests override with mockImplementation as needed
  })
  const readFromStore = vi.fn(() => storeValue)
  const mirrorToStore = vi.fn((nextValue: boolean) => {
    storeValue = nextValue
  })
  return {
    hydrateFromDb,
    readFromStore,
    mirrorToStore,
    getValue: () => storeValue,
    setValue: (nextValue: boolean) => {
      storeValue = nextValue
    },
  }
}

describe('BaseToggleSetting', () => {
  beforeEach(() => {
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the label and switch reflecting the initial store value', async () => {
    const store = makeFakeStore(true)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('EXAMPLE SETTING')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('calls hydrateFromDb on mount and re-reads the store', async () => {
    const store = makeFakeStore(false)
    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue(true)
    })
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    expect(store.hydrateFromDb).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('re-syncs from the DB when sentinel:config-uploaded fires', async () => {
    const store = makeFakeStore(false)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')

    store.hydrateFromDb.mockImplementation(async () => {
      store.setValue(true)
    })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('mirrors into the store immediately and stages the DB write by default (deferMirror unset)', async () => {
    const store = makeFakeStore(false)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
      },
    })
    await flushPromises()

    await wrapper.get('[role="switch"]').trigger('click')

    expect(store.getValue()).toBe(true) // mirrored immediately
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    expect(settingsApi.put).not.toHaveBeenCalled() // DB write not yet run

    await (staged![0]![0] as () => Promise<unknown>)()
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'exampleSetting', true)
  })

  it('defers the store mirror and DB write to the staged writer when deferMirror is set', async () => {
    const store = makeFakeStore(false)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        deferMirror: true,
      },
    })
    await flushPromises()

    await wrapper.get('[role="switch"]').trigger('click')

    // Switch position flips immediately, but the store must NOT change yet.
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(store.getValue()).toBe(false)

    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => Promise<unknown>)()
    expect(store.getValue()).toBe(true)
    expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'exampleSetting', true)
  })

  it('forwards the disabled prop to the underlying switch', async () => {
    const store = makeFakeStore(false)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
        namespace: 'sdr',
        settingKey: 'exampleSetting',
        hydrateFromDb: store.hydrateFromDb,
        readFromStore: store.readFromStore,
        mirrorToStore: store.mirrorToStore,
        disabled: true,
      },
    })
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    const store = makeFakeStore(false)
    const wrapper = mount(BaseToggleSetting, {
      props: {
        label: 'EXAMPLE SETTING',
        accessibleName: 'Toggle example setting',
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
