import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBasemapStore } from './basemap'

const LS_KEY = 'sentinel_basemapLayers'
const LEGACY_AIR_OVERLAYS_KEY = 'overlayStates'

/** Read back what the store persisted. */
function persisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(LS_KEY)!) as Record<string, unknown>
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('basemap store defaults', () => {
  it('starts with both shared layers off', () => {
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('restores previously persisted layers', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ roads: true, names: false, terrain: false }))
    setActivePinia(createPinia())
    expect(useBasemapStore().layers).toEqual({ roads: true, names: false, terrain: false })
  })

  it('fills in a missing key from the defaults', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ names: true }))
    setActivePinia(createPinia())
    expect(useBasemapStore().layers).toEqual({ roads: false, names: true, terrain: false })
  })
})

describe('basemap store setLayer', () => {
  it('turns a layer on and persists it', () => {
    const store = useBasemapStore()
    store.setLayer('roads', true)
    expect(store.layers.roads).toBe(true)
    expect(persisted().roads).toBe(true)
  })

  it('turns a layer off and persists it', () => {
    const store = useBasemapStore()
    store.setLayer('names', true)
    store.setLayer('names', false)
    expect(store.layers.names).toBe(false)
    expect(persisted().names).toBe(false)
  })

  it('leaves the other layer untouched', () => {
    const store = useBasemapStore()
    store.setLayer('names', true)
    expect(store.layers.roads).toBe(false)
    expect(persisted()).toEqual({ roads: false, names: true, terrain: false })
  })
})

// The shared flags used to live on the Air map's own overlay state. Seeding
// from that key keeps an existing user's choice when they upgrade.
describe('basemap store legacy Air-overlay seeding', () => {
  function seedLegacy(value: unknown): void {
    localStorage.setItem(LEGACY_AIR_OVERLAYS_KEY, JSON.stringify(value))
    setActivePinia(createPinia())
  }

  it('adopts both flags from the legacy Air overlay state', () => {
    seedLegacy({ adsb: true, roads: true, names: true })
    expect(useBasemapStore().layers).toEqual({ roads: true, names: true, terrain: false })
  })

  it('lets an explicit new-key choice win over the legacy seed', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ roads: true, names: true, terrain: false }))
    seedLegacy({ roads: false, names: false, terrain: false })
    // The new key still wins — seeding only supplies the base the new key
    // merges over, so an explicit later choice is never clobbered.
    expect(useBasemapStore().layers).toEqual({ roads: true, names: true, terrain: false })
  })

  it('adopts only the flags the legacy state actually carried', () => {
    seedLegacy({ names: true })
    expect(useBasemapStore().layers).toEqual({ roads: false, names: true, terrain: false })
  })

  it('ignores legacy values of the wrong type', () => {
    seedLegacy({ roads: 'yes', names: 1 })
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('ignores a legacy key holding an array', () => {
    seedLegacy(['roads'])
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('ignores a legacy key holding null', () => {
    seedLegacy(null)
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('ignores a legacy key holding a non-object', () => {
    seedLegacy(42)
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('ignores malformed legacy JSON', () => {
    localStorage.setItem(LEGACY_AIR_OVERLAYS_KEY, '{not json')
    setActivePinia(createPinia())
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })

  it('falls back to the defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    setActivePinia(createPinia())
    expect(useBasemapStore().layers).toEqual({ roads: false, names: false, terrain: false })
  })
})

describe('basemap store config mirroring', () => {
  let putSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    const settingsApi = await import('@/services/settingsApi')
    putSpy = vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
  })

  it('writes app.mapLayers to the config database on every setLayer', () => {
    const store = useBasemapStore()
    store.setLayer('names', true)
    expect(putSpy).toHaveBeenCalledWith('app', 'mapLayers', {
      roads: false,
      names: true,
      terrain: false,
    })
    store.setLayer('roads', true)
    expect(putSpy).toHaveBeenLastCalledWith('app', 'mapLayers', {
      roads: true,
      names: true,
      terrain: false,
    })
  })

  it('persistLayers writes a detached copy, not the live reactive object', async () => {
    const store = useBasemapStore()
    await store.persistLayers()
    const written = putSpy.mock.calls[0]![2] as Record<string, boolean>
    expect(written).toEqual({ roads: false, names: false, terrain: false })
    expect(written).not.toBe(store.layers)
  })

  describe('hydrateLayers', () => {
    it('adopts boolean values for known layers', () => {
      const store = useBasemapStore()
      store.hydrateLayers({ roads: true, names: true, terrain: false })
      expect(store.layers).toEqual({ roads: true, names: true, terrain: false })
      expect(persisted()).toEqual({ roads: true, names: true, terrain: false })
    })

    it('ignores unknown keys and non-boolean values', () => {
      const store = useBasemapStore()
      store.hydrateLayers({ roads: 'yes', names: 1, contours: true })
      expect(store.layers).toEqual({ roads: false, names: false, terrain: false })
    })

    it.each([null, undefined, 'names', 42, ['names']])(
      'ignores a non-object value: %s',
      (value) => {
        const store = useBasemapStore()
        store.setLayer('names', true)
        store.hydrateLayers(value)
        expect(store.layers.names).toBe(true)
      },
    )

    it('does not write back to the config database', () => {
      useBasemapStore().hydrateLayers({ names: true })
      expect(putSpy).not.toHaveBeenCalled()
    })

    it('adopts the terrain flag like any other layer', () => {
      const store = useBasemapStore()
      store.hydrateLayers({ terrain: true })
      expect(store.layers.terrain).toBe(true)
    })
  })

  describe('terrainAvailable', () => {
    it('starts optimistic and is not persisted', () => {
      const store = useBasemapStore()
      expect(store.terrainAvailable).toBe(true)
      store.setTerrainAvailable(false)
      expect(store.terrainAvailable).toBe(false)
      setActivePinia(createPinia())
      expect(useBasemapStore().terrainAvailable).toBe(true)
    })
  })
})
