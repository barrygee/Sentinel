import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import NotificationSoundControl from './NotificationSoundControl.vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

/** Set what the app store's hydrateNotificationSoundFromDb reads. */
function stubStoredSettings(storedSettings: Record<string, unknown>): void {
  vi.mocked(settingsApi.getNamespace).mockResolvedValue(storedSettings)
}

describe('NotificationSoundControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubStoredSettings({}) // hydrate is a no-op: store keeps its default (off)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
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

  describe('caption', () => {
    const caption = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find('.toggle-setting-label').text()
    const switchName = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find('[role="switch"]').attributes('aria-label')

    it('offers to enable the sound while it is off', async () => {
      const wrapper = mount(NotificationSoundControl)
      await flushPromises()
      expect(caption(wrapper)).toBe('Enable')
      expect(switchName(wrapper)).toBe('Enable alert sound')
    })

    it('flips to enabled once switched on, and back again', async () => {
      const wrapper = mount(NotificationSoundControl)
      await flushPromises()
      await wrapper.find('[role="switch"]').trigger('click')
      expect(caption(wrapper)).toBe('Enabled')
      expect(switchName(wrapper)).toBe('Alert sound enabled')
      await wrapper.find('[role="switch"]').trigger('click')
      expect(caption(wrapper)).toBe('Enable')
      expect(switchName(wrapper)).toBe('Enable alert sound')
    })

    it('reads enabled when the saved setting has it on', async () => {
      stubStoredSettings({ notificationSound: true })
      const wrapper = mount(NotificationSoundControl)
      await flushPromises()
      expect(caption(wrapper)).toBe('Enabled')
    })

    it('never mentions the old blip wording', async () => {
      const wrapper = mount(NotificationSoundControl)
      await flushPromises()
      expect(wrapper.html().toLowerCase()).not.toContain('blip')
    })
  })

  it('hydrates the toggle from the DB on mount', async () => {
    stubStoredSettings({ notificationSound: true })
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(useAppStore().notificationSound).toBe(true)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(NotificationSoundControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    stubStoredSettings({ notificationSound: true })
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
