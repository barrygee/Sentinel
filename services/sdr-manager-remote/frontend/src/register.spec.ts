import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const provideCapability = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/capabilities', () => ({ provideCapability }))
const registerSectionSpy = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({
  registerSection: registerSectionSpy,
}))

/**
 * sdr-manager-remote's `./register` entry: Settings › SDR Manager's REMOTE SDR
 * HOSTS group and the `radioSites` capability — and never a map section.
 */
describe('register (sdr-manager-remote)', () => {
  beforeEach(() => {
    vi.resetModules()
    provideCapability.mockClear()
    registerSectionSpy.mockClear()
  })

  async function registerOnShellPinia(): Promise<void> {
    const { default: register } = await import('./register')
    const pinia = createPinia()
    setActivePinia(pinia)
    register({ pinia })
  }

  it('adds the SDR Manager section with its REMOTE SDR HOSTS item', async () => {
    await registerOnShellPinia()
    const { getSettingsSections, getSettingItems } =
      await import('@sentinel/shell-api/shell/settingsRegistry')
    const { default: RemoteHostsControl } = await import('./components/RemoteHostsControl.vue')

    expect(getSettingsSections()).toEqual([
      { key: 'sdr-manager', label: 'SDR Manager', order: 15, domain: false },
    ])
    const items = getSettingItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      section: 'sdr-manager',
      sectionLabel: 'SDR Manager',
      id: 'sdr-manager-remote-hosts',
      groupLabel: 'REMOTE SDR HOSTS',
      hideLabel: true,
      docPath: 'use/sdr-manager#remote-sdr-hosts',
      control: { component: RemoteHostsControl, layout: 'half' },
    })
  })

  it('provides the radioSites capability with every method the app reads', async () => {
    await registerOnShellPinia()

    expect(provideCapability).toHaveBeenCalledOnce()
    const [name, capability] = provideCapability.mock.calls[0]!
    expect(name).toBe('radioSites')
    for (const method of [
      'listSites',
      'listDevices',
      'listHosts',
      'getHostDevices',
      'getHostDeviceRecords',
      'patchHostDevice',
      'flashHostDeviceSerial',
      'onHostsChanged',
    ]) {
      expect(typeof (capability as Record<string, unknown>)[method]).toBe('function')
    }
  })

  it('registers no map section', async () => {
    await registerOnShellPinia()

    expect(registerSectionSpy).not.toHaveBeenCalled()
  })

  it('refuses to run on a Pinia other than the shell’s', async () => {
    const { default: register } = await import('./register')
    setActivePinia(createPinia())

    expect(() => register({ pinia: createPinia() })).toThrow()
    expect(provideCapability).not.toHaveBeenCalled()
  })
})

describe('registerSdrManagerRemoteSettings', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('shares the section with sdr-manager-local: an identical entry registered first is accepted', async () => {
    const { registerSettingsSection, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')
    const { SDR_MANAGER_SETTINGS_SECTION } =
      await import('@sentinel/shell-api/shell/sdrManagerSettingsSection')
    const { registerSdrManagerRemoteSettings } = await import('./settings')
    registerSettingsSection({ ...SDR_MANAGER_SETTINGS_SECTION })

    expect(() => registerSdrManagerRemoteSettings()).not.toThrow()
    expect(getSettingsSections()).toHaveLength(1)
  })
})
