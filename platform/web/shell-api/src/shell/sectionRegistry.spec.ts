import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type * as SectionRegistryModule from './sectionRegistry'

/**
 * `sectionRegistry.ts` keeps its registered sections in a module-level `Map`,
 * so every test here resets the module registry and re-imports fresh — a
 * registration made by one test must never leak into the next.
 */
async function freshRegistry(): Promise<typeof SectionRegistryModule> {
  vi.resetModules()
  return import('./sectionRegistry')
}

function stubComponent(name: string): Component {
  return defineComponent({ name, setup: () => () => h('div', name) })
}

/** A pane loader resolving to a stub component, as a section's `() => import('./engine')`. */
function paneLoader(name: string): () => Promise<{ default: Component }> {
  const pane = stubComponent(name)
  return async () => ({ default: pane })
}

describe('shell/sectionRegistry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('registerSection', () => {
    it('adds the section so it is returned by getRegisteredSections', async () => {
      const { registerSection, getRegisteredSections } = await freshRegistry()
      const airView = stubComponent('AirView')
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: airView },
      })

      const sections = getRegisteredSections()
      expect(sections).toHaveLength(1)
      expect(sections[0]).toMatchObject({ id: 'air', label: 'AIR', navOrder: 10 })
    })

    it('throws when the same section id is registered twice', async () => {
      const { registerSection } = await freshRegistry()
      const view = stubComponent('AirView')
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })

      expect(() =>
        registerSection({
          id: 'air',
          label: 'AIR AGAIN',
          navOrder: 99,
          enabledByDefault: true,
          route: { path: '/air2/', component: view },
        }),
      ).toThrow('Section "air" is already registered')
    })

    it('allows two different section ids to both register', async () => {
      const { registerSection, getRegisteredSections } = await freshRegistry()
      const airView = stubComponent('AirView')
      const seaView = stubComponent('SeaView')
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: airView },
      })
      registerSection({
        id: 'sea',
        label: 'SEA',
        navOrder: 30,
        enabledByDefault: true,
        route: { path: '/sea/', component: seaView },
      })

      expect(getRegisteredSections().map((section) => section.id)).toEqual(['air', 'sea'])
    })
  })

  describe('nav ordering', () => {
    it('orders sections by navOrder regardless of registration order', async () => {
      const { registerSection, getRegisteredSections } = await freshRegistry()
      const view = stubComponent('View')
      // Register out of navOrder sequence (sdr=50 first, air=10 last) — the
      // registry must sort by navOrder, not preserve insertion order.
      registerSection({
        id: 'sdr',
        label: 'SDR',
        navOrder: 50,
        enabledByDefault: true,
        route: { path: '/sdr/', component: view },
      })
      registerSection({
        id: 'sea',
        label: 'SEA',
        navOrder: 30,
        enabledByDefault: true,
        route: { path: '/sea/', component: view },
      })
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })

      expect(getRegisteredSections().map((section) => section.id)).toEqual(['air', 'sea', 'sdr'])
    })
  })

  describe('getSectionRoutes', () => {
    it('returns path, component, and meta.domain for every registered section in nav order', async () => {
      const { registerSection, getSectionRoutes } = await freshRegistry()
      const airView = stubComponent('AirView')
      const seaView = stubComponent('SeaView')
      registerSection({
        id: 'sea',
        label: 'SEA',
        navOrder: 30,
        enabledByDefault: true,
        route: { path: '/sea/', component: seaView },
      })
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: airView },
      })

      expect(getSectionRoutes()).toEqual([
        { path: '/air/', component: airView, meta: { domain: 'air' } },
        { path: '/sea/', component: seaView, meta: { domain: 'sea' } },
      ])
    })

    it('returns an empty array when no section has registered', async () => {
      const { getSectionRoutes } = await freshRegistry()
      expect(getSectionRoutes()).toEqual([])
    })
  })

  describe('getNavEntries', () => {
    it('returns [id, label] pairs for every registered section in nav order', async () => {
      const { registerSection, getNavEntries } = await freshRegistry()
      const view = stubComponent('View')
      registerSection({
        id: 'sdr',
        label: 'SDR',
        navOrder: 50,
        enabledByDefault: true,
        route: { path: '/sdr/', component: view },
      })
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })

      expect(getNavEntries()).toEqual([
        ['air', 'AIR'],
        ['sdr', 'SDR'],
      ])
    })
  })

  describe('isSectionUnavailable', () => {
    it('is true only for a stand-in the shell registered for a section that failed to load', async () => {
      const { registerSection, isSectionUnavailable } = await freshRegistry()
      const view = stubComponent('View')
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })
      registerSection({
        id: 'sea',
        label: 'SEA',
        navOrder: 30,
        enabledByDefault: false,
        route: { path: '/sea/', component: view },
        unavailable: true,
      })

      expect(isSectionUnavailable('air')).toBe(false)
      expect(isSectionUnavailable('sea')).toBe(true)
      expect(isSectionUnavailable('land')).toBe(false)
    })
  })

  describe('getPersistentRadioPaneLoader', () => {
    it('returns undefined when no registered section provides a pane', async () => {
      const { registerSection, getPersistentRadioPaneLoader } = await freshRegistry()
      const view = stubComponent('AirView')
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })

      expect(getPersistentRadioPaneLoader()).toBeUndefined()
    })

    it('returns the pane loader of the section that registers one, skipping earlier sections without one', async () => {
      const { registerSection, getPersistentRadioPaneLoader } = await freshRegistry()
      const view = stubComponent('View')
      const pane = paneLoader('SdrTabPanel')
      // 'air' sorts first (navOrder 10) and has no pane — the lookup must
      // scan past it to find 'sdr's pane, not just read index [0].
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })
      registerSection({
        id: 'sdr',
        label: 'SDR',
        navOrder: 50,
        enabledByDefault: true,
        route: { path: '/sdr/', component: view },
        loadPersistentRadioPane: pane,
      })

      expect(getPersistentRadioPaneLoader()).toBe(pane)
    })

    it('returns the first pane in nav order when more than one section registers one', async () => {
      const { registerSection, getPersistentRadioPaneLoader } = await freshRegistry()
      const view = stubComponent('View')
      const firstPane = paneLoader('FirstPane')
      const secondPane = paneLoader('SecondPane')
      // Registered out of nav order on purpose: the later navOrder (sdr=50)
      // registers first, so this also proves the lookup sorts before finding,
      // rather than returning whichever pane happened to register first.
      registerSection({
        id: 'sdr',
        label: 'SDR',
        navOrder: 50,
        enabledByDefault: true,
        route: { path: '/sdr/', component: view },
        loadPersistentRadioPane: secondPane,
      })
      registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
        loadPersistentRadioPane: firstPane,
      })

      expect(getPersistentRadioPaneLoader()).toBe(firstPane)
    })
  })

  describe('getEnabledSectionIds', () => {
    async function registryWithSections() {
      const registry = await freshRegistry()
      const view = stubComponent('View')
      registry.registerSection({
        id: 'sea',
        label: 'SEA',
        navOrder: 30,
        enabledByDefault: false,
        route: { path: '/sea/', component: view },
      })
      registry.registerSection({
        id: 'air',
        label: 'AIR',
        navOrder: 10,
        enabledByDefault: true,
        route: { path: '/air/', component: view },
      })
      return registry
    }

    it("uses each section's own default when the settings say nothing", async () => {
      const { getEnabledSectionIds } = await registryWithSections()
      expect(getEnabledSectionIds({})).toEqual(['air'])
    })

    it('lets a stored enabled flag win over the default, either way, in nav order', async () => {
      const { getEnabledSectionIds } = await registryWithSections()
      expect(getEnabledSectionIds({ air: { enabled: false }, sea: { enabled: true } })).toEqual([
        'sea',
      ])
      expect(getEnabledSectionIds({ sea: { enabled: true } })).toEqual(['air', 'sea'])
    })

    it('ignores a stored flag that is not a boolean', async () => {
      const { getEnabledSectionIds } = await registryWithSections()
      expect(getEnabledSectionIds({ air: { enabled: 'no' }, sea: { enabled: 1 } })).toEqual(['air'])
    })

    it('only knows registered sections', async () => {
      const { getEnabledSectionIds } = await registryWithSections()
      expect(getEnabledSectionIds({ land: { enabled: true } })).toEqual(['air'])
    })
  })
})
