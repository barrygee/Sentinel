import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AppMode } from '@sentinel/shell-api/types/appMode'

const onUnauthorized = vi.hoisted(() => vi.fn())
vi.mock('./api/sdrManagerLocalApi', () => ({ onUnauthorized }))

/** sdr-manager-local's `./register` entry: settings only, and a 401 brings back sign-in. */
describe('register (sdr-manager-local)', () => {
  beforeEach(() => {
    vi.resetModules()
    onUnauthorized.mockClear()
  })

  async function registerOnShellPinia(appMode?: AppMode) {
    const { default: register } = await import('./register')
    const pinia = createPinia()
    setActivePinia(pinia)
    register(appMode === undefined ? { pinia } : { pinia, appMode })
    return pinia
  }

  it('registers the THIS MACHINE settings on Settings › SDR in the full app', async () => {
    await registerOnShellPinia('full')
    const { getSettingItems } = await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingItems().length).toBeGreaterThan(0)
    expect(new Set(getSettingItems().map((item) => item.section))).toEqual(new Set(['sdr']))
  })

  it('treats a shell that names no mode as the full app', async () => {
    await registerOnShellPinia()
    const { getSettingsSections } = await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toEqual(['sdr'])
  })

  it('registers them on Settings › SDR Manager in SDR Manager-only mode', async () => {
    await registerOnShellPinia('sdr-manager-local-only')
    const { getSettingsSections } = await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toEqual(['sdr-manager'])
  })

  it("provides this machine's SDR list to Settings › SDR in the full app", async () => {
    await registerOnShellPinia('full')
    const { getCapability } = await import('@sentinel/shell-api/shell/capabilities')
    const { default: LocalDevicesControl } =
      await import('./components/devices/LocalDevicesControl.vue')

    expect(getCapability('thisMachineSdrs')).toEqual({ DevicesPanel: LocalDevicesControl })
  })

  it('provides no SDR list in SDR Manager-only mode, where its page has the card', async () => {
    await registerOnShellPinia('sdr-manager-local-only')
    const { getCapability } = await import('@sentinel/shell-api/shell/capabilities')

    expect(getCapability('thisMachineSdrs')).toBeUndefined()
  })

  it('marks the console signed out when a request comes back 401', async () => {
    const pinia = await registerOnShellPinia()
    const { useLocalAuthStore } = await import('./stores/localAuthStore')
    const auth = useLocalAuthStore(pinia)
    auth.passwordSet = true
    auth.authenticated = true

    expect(onUnauthorized).toHaveBeenCalledOnce()
    const handler = onUnauthorized.mock.calls[0]![0] as () => void
    handler()

    expect(auth.authenticated).toBe(false)
  })

  it('refuses to run on a Pinia other than the shell’s', async () => {
    const { default: register } = await import('./register')
    setActivePinia(createPinia())

    expect(() => register({ pinia: createPinia() })).toThrow(/sdr-manager-local/)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
