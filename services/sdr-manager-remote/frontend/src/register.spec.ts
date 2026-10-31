import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const provideCapability = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/capabilities', () => ({ provideCapability }))
const registerSectionSpy = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({
  registerSection: registerSectionSpy,
}))

/**
 * sdr-manager-remote's `./register` entry: the `radioSites` capability (with
 * the host editor Settings › SDR renders) — no settings and no map section.
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

  it('adds no settings of its own: its hosts live in Settings › SDR’s radios card', async () => {
    await registerOnShellPinia()
    const { getSettingsSections, getSettingItems } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections()).toEqual([])
    expect(getSettingItems()).toEqual([])
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
    const { default: RemoteHostHeader } = await import('./components/RemoteHostHeader.vue')
    const { default: RemoteHostAddForm } = await import('./components/RemoteHostAddForm.vue')
    expect((capability as { hostEditor: unknown }).hostEditor).toEqual({
      HostHeader: RemoteHostHeader,
      NewHostForm: RemoteHostAddForm,
    })
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
