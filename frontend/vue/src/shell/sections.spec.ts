import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * `sections.ts` has no logic of its own — it lists every section's `./register`
 * module in nav order. This spec loads each one and calls its `register()`, as
 * `loadSections` does at boot, and proves that reaches the shared registry for
 * all five domains, including the sdr persistent radio pane, rather than just
 * asserting the file "doesn't throw".
 *
 * Each section's real view (and SDR's real tab panel) is mocked out to a tiny
 * stub: the thing under test is the registration wiring, not the view's own
 * behaviour (which each view's own spec already covers), and importing the
 * five real views — full MapLibre maps and all — is unnecessarily heavy for
 * what this test asserts.
 */
vi.mock('@sentinel/section-air/AirView.vue', () => ({ default: { name: 'AirView' } }))
vi.mock('@sentinel/section-space/SpaceView.vue', () => ({ default: { name: 'SpaceView' } }))
vi.mock('@sentinel/section-sea/SeaView.vue', () => ({ default: { name: 'SeaView' } }))
vi.mock('@sentinel/section-land/LandView.vue', () => ({ default: { name: 'LandView' } }))
vi.mock('@sentinel/section-sdr/SdrView.vue', () => ({ default: { name: 'SdrView' } }))
vi.mock('@sentinel/section-sdr/SdrTabPanel.vue', () => ({ default: { name: 'SdrTabPanel' } }))

describe('shell/sections', () => {
  it('registers every domain section with the shared registry', async () => {
    vi.resetModules()
    const { sectionSources } = await import('./sections')
    const sources = await sectionSources()
    expect(sources.map((source) => source.id)).toEqual(['air', 'space', 'sea', 'land', 'sdr'])
    const pinia = createPinia()
    setActivePinia(pinia)
    for (const source of sources) (await source.load()).default({ pinia })
    const { getRegisteredSections, getPersistentRadioPaneLoader } =
      await import('@sentinel/shell-api/shell/sectionRegistry')
    const { default: SdrTabPanel } = await import('@sentinel/section-sdr/SdrTabPanel.vue')

    const sections = getRegisteredSections()
    expect(sections.map((section) => section.id)).toEqual(['air', 'space', 'sea', 'land', 'sdr'])
    expect((await getPersistentRadioPaneLoader()!()).default).toBe(SdrTabPanel)
  })
})
