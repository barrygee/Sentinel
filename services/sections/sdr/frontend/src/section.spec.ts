import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
// SdrView.vue/SdrTabPanel.vue's real module graphs pull in the full SDR
// engine (AudioContext, worklets, the spectrum canvas) — heavy, and
// irrelevant to what this test asserts (the registration wiring, not either
// component's own behaviour, which their own specs already cover).
vi.mock('./SdrView.vue', () => ({ default: { name: 'SdrView' } }))
vi.mock('./SdrTabPanel.vue', () => ({ default: { name: 'SdrTabPanel' } }))

// `register()` runs once per file, as the module's side effects used to: each
// case asserts on the same single registration.
let registered = false
async function registerOnce(): Promise<void> {
  if (registered) return
  registered = true
  const { default: register } = await import('./section')
  register()
}

describe('components/sdr/section', () => {
  it('registers the SDR section with its id, label, navOrder, routed view, and persistent radio pane', async () => {
    const { default: SdrView } = await import('./SdrView.vue')
    const { default: SdrTabPanel } = await import('./SdrTabPanel.vue')
    await registerOnce()

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'sdr',
      label: 'SDR',
      navOrder: 50,
      enabledByDefault: true,
      route: { path: '/sdr/', component: SdrView },
      persistentRadioPane: SdrTabPanel,
    })
  })

  it('registers its Settings section and items', async () => {
    await registerOnce()
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('sdr')
    expect(getSettingItems().some((item) => item.section === 'sdr')).toBe(true)
  })
})

describe('components/sdr/section — radio capability', () => {
  it('provides the radio capability at registration, before anything mounts', async () => {
    await registerOnce()
    const { getCapability } = await import('@sentinel/shell-api/shell/capabilities')

    const radio = getCapability('radio')
    expect(radio).toBeDefined()
    expect(typeof radio!.tune).toBe('function')
    expect(typeof radio!.frequencies.save).toBe('function')
  })

  it('provides the Sentry fleet as the radioSites capability', async () => {
    await registerOnce()
    const { getCapability } = await import('@sentinel/shell-api/shell/capabilities')

    const radioSites = getCapability('radioSites')
    expect(typeof radioSites?.listSites).toBe('function')
    expect(typeof radioSites?.listDevices).toBe('function')
  })

  it('registers its tuned-frequency footer readout', async () => {
    const { default: SdrFooterIndicator } = await import('./SdrFooterIndicator.vue')
    await registerOnce()
    const { getFooterItems } = await import('@sentinel/shell-api/shell/footerRegistry')

    expect(getFooterItems()).toEqual([
      { id: 'sdr-frequency', order: 10, component: SdrFooterIndicator },
    ])
  })
})
