import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
// SdrView.vue/SdrTabPanel.vue's real module graphs pull in the full SDR
// engine (AudioContext, worklets, the spectrum canvas) — heavy, and
// irrelevant to what this test asserts (the registration wiring, not either
// component's own behaviour, which their own specs already cover).
vi.mock('./SdrView.vue', () => ({ default: { name: 'SdrView' } }))
vi.mock('./SdrTabPanel.vue', () => ({ default: { name: 'SdrTabPanel' } }))

describe('components/sdr/section', () => {
  it('registers the SDR section with its id, label, navOrder, routed view, and persistent radio pane', async () => {
    const { default: SdrView } = await import('./SdrView.vue')
    const { default: SdrTabPanel } = await import('./SdrTabPanel.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'sdr',
      label: 'SDR',
      navOrder: 50,
      route: { path: '/sdr/', component: SdrView },
      persistentRadioPane: SdrTabPanel,
    })
  })

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } = await import('@/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('sdr')
    expect(getSettingItems().some((item) => item.section === 'sdr')).toBe(true)
  })
})

describe('components/sdr/section — radio capability', () => {
  it('provides the radio capability at registration, before anything mounts', async () => {
    await import('./section')
    const { getCapability } = await import('@/shell/capabilities')

    const radio = getCapability('radio')
    expect(radio).toBeDefined()
    expect(typeof radio!.tune).toBe('function')
    expect(typeof radio!.frequencies.save).toBe('function')
  })
})
