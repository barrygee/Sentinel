import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import GlobeEnabledControl from './GlobeEnabledControl.vue'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

// The shell's sections in nav order, as the registry lists them.
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({
  getRegisteredSections: () =>
    ['air', 'space', 'sea', 'land', 'sdr', 'globe'].map((id) => ({ id })),
}))

type StagedWriter = () => Promise<unknown> | void

/** What `GET /api/settings/globe` answers (null = the request failed). */
function stubStoredGlobeSettings(stored: Record<string, unknown> | null): void {
  vi.mocked(settingsApi.getNamespace).mockResolvedValue(stored)
}

async function mountControl(): Promise<VueWrapper> {
  const wrapper = mount(GlobeEnabledControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const switchOf = (wrapper: VueWrapper) => wrapper.find('[role="switch"]')

/** The writer the last switch change staged for APPLY. */
function lastStagedWriter(wrapper: VueWrapper): StagedWriter {
  const staged = wrapper.emitted('stage')
  expect(staged).toBeDefined()
  return staged!.at(-1)![0] as StagedWriter
}

describe('GlobeEnabledControl', () => {
  let wrappers: VueWrapper[]

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
    useAppStore().setEnabledDomains(['air', 'space', 'sea', 'land', 'sdr'])
    wrappers = []
    return () => wrappers.forEach((wrapper) => wrapper.unmount())
  })

  async function mountTracked(): Promise<VueWrapper> {
    const wrapper = await mountControl()
    wrappers.push(wrapper)
    return wrapper
  }

  describe('reading the saved setting on mount', () => {
    it('reads the globe namespace', async () => {
      stubStoredGlobeSettings({ enabled: false })
      await mountTracked()

      expect(settingsApi.getNamespace).toHaveBeenCalledWith('globe')
    })

    it('on: adds GLOBE to the enabled sections, last in nav order, and shows the switch on', async () => {
      stubStoredGlobeSettings({ enabled: true })
      const wrapper = await mountTracked()

      expect(useAppStore().enabledDomains).toEqual(['air', 'space', 'sea', 'land', 'sdr', 'globe'])
      expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
    })

    it('off: removes GLOBE from the enabled sections and shows the switch off', async () => {
      useAppStore().setEnabledDomains(['air', 'globe', 'sdr'])
      stubStoredGlobeSettings({ enabled: false })
      const wrapper = await mountTracked()

      expect(useAppStore().enabledDomains).toEqual(['air', 'sdr'])
      expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
    })

    it('a missing key means off', async () => {
      useAppStore().setEnabledDomains(['air', 'globe'])
      stubStoredGlobeSettings({})
      const wrapper = await mountTracked()

      expect(useAppStore().enabledDomains).toEqual(['air'])
      expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
    })

    it('only a real true counts as on', async () => {
      stubStoredGlobeSettings({ enabled: 'true' })
      const wrapper = await mountTracked()

      expect(useAppStore().enabledDomains).not.toContain('globe')
      expect(switchOf(wrapper).attributes('aria-checked')).toBe('false')
    })

    it('leaves the sections alone when the settings cannot be read', async () => {
      useAppStore().setEnabledDomains(['air', 'globe'])
      stubStoredGlobeSettings(null)
      const wrapper = await mountTracked()

      expect(useAppStore().enabledDomains).toEqual(['air', 'globe'])
      expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
    })

    it('keeps the other sections in nav order whatever order they were in', async () => {
      useAppStore().setEnabledDomains(['sdr', 'land', 'air'])
      stubStoredGlobeSettings({ enabled: true })
      await mountTracked()

      expect(useAppStore().enabledDomains).toEqual(['air', 'land', 'sdr', 'globe'])
    })
  })

  describe('switching', () => {
    it('turning it on changes nothing until APPLY runs the staged write', async () => {
      stubStoredGlobeSettings({ enabled: false })
      const wrapper = await mountTracked()

      await switchOf(wrapper).trigger('click')

      expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
      expect(useAppStore().enabledDomains).not.toContain('globe')
      expect(settingsApi.put).not.toHaveBeenCalled()
    })

    it('APPLY saves globe.enabled = true and shows GLOBE', async () => {
      stubStoredGlobeSettings({ enabled: false })
      const wrapper = await mountTracked()
      await switchOf(wrapper).trigger('click')

      await lastStagedWriter(wrapper)()

      expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('globe', 'enabled', true)
      expect(useAppStore().enabledDomains).toEqual(['air', 'space', 'sea', 'land', 'sdr', 'globe'])
    })

    it('APPLY after turning it off saves false and hides GLOBE', async () => {
      stubStoredGlobeSettings({ enabled: true })
      const wrapper = await mountTracked()
      await switchOf(wrapper).trigger('click')
      expect(useAppStore().enabledDomains).toContain('globe')

      await lastStagedWriter(wrapper)()

      expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('globe', 'enabled', false)
      expect(useAppStore().enabledDomains).toEqual(['air', 'space', 'sea', 'land', 'sdr'])
    })
  })

  describe('wording', () => {
    it('keeps the same caption and accessible name whichever way it is set', async () => {
      stubStoredGlobeSettings({ enabled: false })
      const wrapper = await mountTracked()
      const caption = () => wrapper.find('.toggle-setting-label').text()
      const accessibleName = () => switchOf(wrapper).attributes('aria-label')

      expect(caption()).toBe('Show')
      expect(accessibleName()).toBe('Show the globe section')
      await switchOf(wrapper).trigger('click')
      expect(caption()).toBe('Show')
      expect(accessibleName()).toBe('Show the globe section')
    })
  })

  it('re-reads the setting when a config file is uploaded', async () => {
    stubStoredGlobeSettings({ enabled: false })
    const wrapper = await mountTracked()
    stubStoredGlobeSettings({ enabled: true })

    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()

    expect(useAppStore().enabledDomains).toContain('globe')
    expect(switchOf(wrapper).attributes('aria-checked')).toBe('true')
  })

  it('has no detectable accessibility violations', async () => {
    stubStoredGlobeSettings({ enabled: false })
    const wrapper = await mountTracked()

    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
