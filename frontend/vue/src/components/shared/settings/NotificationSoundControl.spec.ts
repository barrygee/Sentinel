import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import NotificationSoundControl from './NotificationSoundControl.vue'
import { useAppStore } from '@/stores/app'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the global fetch the app store's hydrateNotificationSoundFromDb uses. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

describe('NotificationSoundControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({}) // hydrate is a no-op: store keeps its default (off)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the switch reflecting the store default (off)', async () => {
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('[role="switch"]').classes()).not.toContain('is-on')
  })

  it('toggles on, mirrors into the store, and stages the DB write', async () => {
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    const app = useAppStore()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(app.notificationSound).toBe(true)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'notificationSound', true)
  })

  it('hydrates the toggle from the DB on mount', async () => {
    stubFetch({ notificationSound: true })
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(useAppStore().notificationSound).toBe(true)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    stubFetch({ notificationSound: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('removes the config-uploaded listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:config-uploaded', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
