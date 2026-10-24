import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const onUnauthorized = vi.hoisted(() => vi.fn())
vi.mock('./api/sdrManagerLocalApi', () => ({ onUnauthorized }))

/** sdr-manager-local's `./register` entry: settings only, and a 401 brings back sign-in. */
describe('register (sdr-manager-local)', () => {
  beforeEach(() => {
    vi.resetModules()
    onUnauthorized.mockClear()
  })

  async function registerOnShellPinia() {
    const { default: register } = await import('./register')
    const pinia = createPinia()
    setActivePinia(pinia)
    register({ pinia })
    return pinia
  }

  it('registers the THIS MACHINE settings', async () => {
    await registerOnShellPinia()
    const { getSettingItems } = await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingItems().length).toBeGreaterThan(0)
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
