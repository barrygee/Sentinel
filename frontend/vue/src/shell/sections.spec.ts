import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * `sections.ts` has no logic of its own — it lists every section's `./register`
 * module in nav order (then the SDR Manager remote). This spec loads each one and calls its `register()`, as
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
    expect(sources.map((source) => source.id)).toEqual([
      'air',
      'space',
      'sea',
      'land',
      'sdr',
      'sdr-manager-local',
      'sdr-manager-remote',
    ])
    const pinia = createPinia()
    setActivePinia(pinia)
    for (const source of sources) (await source.load()).default({ pinia })
    const { getRegisteredSections, getPersistentRadioPaneLoader } =
      await import('@sentinel/shell-api/shell/sectionRegistry')
    const { default: SdrTabPanel } = await import('@sentinel/section-sdr/SdrTabPanel.vue')

    // The SDR Manager remotes add settings, never a map section.
    const sections = getRegisteredSections()
    expect(sections.map((section) => section.id)).toEqual(['air', 'space', 'sea', 'land', 'sdr'])
    expect((await getPersistentRadioPaneLoader()!()).default).toBe(SdrTabPanel)
  })

  it('asks no backend in specs, loading every remote', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.resetModules()
    const { sectionSources } = await import('./sections')
    expect((await sectionSources()).map((source) => source.id)).toEqual([
      'air',
      'space',
      'sea',
      'land',
      'sdr',
      'sdr-manager-local',
      'sdr-manager-remote',
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  describe('which SDR Manager remotes it loads, in the dev server', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'development')
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    const MAP_SECTIONS = ['air', 'space', 'sea', 'land', 'sdr']

    function answer(response: unknown, ok = true): void {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => response }))
    }

    async function listedIds(): Promise<string[]> {
      vi.resetModules()
      const { sectionSources } = await import('./sections')
      return (await sectionSources()).map((source) => source.id)
    }

    it('asks the backend which parts are deployed', async () => {
      answer({ sections: [] })
      await listedIds()
      expect(fetch).toHaveBeenCalledWith('/api/app/sections')
    })

    it('loads only the SDR Manager remotes the backend lists, and every map section', async () => {
      answer({ sections: [{ id: 'air' }, { id: 'sdr-manager-remote' }] })
      expect(await listedIds()).toEqual([...MAP_SECTIONS, 'sdr-manager-remote'])
    })

    it('loads neither SDR Manager remote when none is deployed', async () => {
      answer({ sections: [{ id: 'sdr' }] })
      expect(await listedIds()).toEqual(MAP_SECTIONS)
    })

    it('loads sdr-manager-local when it is deployed', async () => {
      answer({ sections: [{ id: 'sdr-manager-local' }, { id: 'sdr-manager-remote' }] })
      expect(await listedIds()).toEqual([
        ...MAP_SECTIONS,
        'sdr-manager-local',
        'sdr-manager-remote',
      ])
    })

    it('ignores list entries without a usable id', async () => {
      answer({ sections: [null, { id: 7 }, {}, { id: 'sdr-manager-local' }] })
      expect(await listedIds()).toEqual([...MAP_SECTIONS, 'sdr-manager-local'])
    })

    it.each([
      [
        'the request fails',
        () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down'))),
      ],
      ['the backend refuses', () => answer({ sections: [] }, false)],
      ['the answer holds no list', () => answer({ sections: 'nope' })],
    ])('loads both when %s: with no list to go by, nothing is left out', async (_case, arrange) => {
      arrange()
      expect(await listedIds()).toEqual([
        ...MAP_SECTIONS,
        'sdr-manager-local',
        'sdr-manager-remote',
      ])
    })
  })
})
