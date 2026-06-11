import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import { DaynightControl } from './DaynightControl'
import { useSpaceStore } from '@/stores/space'

interface FakeMap {
  map: maplibregl.Map
  isStyleLoaded: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  removeLayer: ReturnType<typeof vi.fn>
  getSource: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  setData: ReturnType<typeof vi.fn>
}

// A fake MapLibre map covering the layer/source operations the control performs.
// `existingLayers`/`hasSource` decide what the removal/lookup paths see.
function fakeMap(
  options: {
    styleLoaded?: boolean
    existingLayers?: string[]
    hasSource?: boolean
    removeSourceThrows?: boolean
    sourcePresentForFetch?: boolean
  } = {},
): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const existingLayers = new Set(options.existingLayers ?? [])
  const setData = vi.fn()
  const isStyleLoaded = vi.fn(() => options.styleLoaded ?? true)
  const once = vi.fn((event: string, handler: () => void) => {
    if (event === 'style.load') styleLoadHandlers.push(handler)
  })
  const getLayer = vi.fn((id: string) => (existingLayers.has(id) ? { id } : undefined))
  const removeLayer = vi.fn()
  const getSource = vi.fn(() => {
    // initLayers checks getSource('daynight-source') for removal; _fetch checks
    // the same id to push new data. Both share this flag.
    if (options.hasSource || options.sourcePresentForFetch) return { setData }
    return undefined
  })
  const removeSource = vi.fn(() => {
    if (options.removeSourceThrows) throw new Error('removeSource failed')
  })
  const addSource = vi.fn()
  const addLayer = vi.fn()
  const setLayoutProperty = vi.fn()
  const map = {
    isStyleLoaded,
    once,
    getLayer,
    removeLayer,
    getSource,
    removeSource,
    addSource,
    addLayer,
    setLayoutProperty,
  } as unknown as maplibregl.Map
  return {
    map,
    isStyleLoaded,
    once,
    getLayer,
    removeLayer,
    getSource,
    removeSource,
    addSource,
    addLayer,
    setLayoutProperty,
    styleLoadHandlers,
    setData,
  }
}

let spaceStore: ReturnType<typeof useSpaceStore>

// A default fetch stub that resolves to a non-ok response, so the immediate
// _fetch() inside onInit is an inert no-op unless a test overrides it.
function stubFetchNotOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false } as Response)),
  )
}

beforeEach(() => {
  setActivePinia(createPinia())
  spaceStore = useSpaceStore()
  stubFetchNotOk()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('DaynightControl constructor', () => {
  it('seeds visibility from the space store overlay state (default on)', () => {
    expect(new DaynightControl(spaceStore).dnVisible).toBe(true)
  })

  it('seeds visibility as off when the store has daynight disabled', () => {
    spaceStore.setOverlay('daynight', false)
    expect(new DaynightControl(spaceStore).dnVisible).toBe(false)
  })

  it('exposes a moon SVG label and a descriptive title', () => {
    const control = new DaynightControl(spaceStore)
    expect(control.buttonLabel).toContain('<svg')
    expect(control.buttonTitle).toBe('Toggle day/night shading')
  })
})

describe('DaynightControl.onInit', () => {
  it('builds the layers immediately when the style is already loaded', () => {
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith('daynight-source', expect.any(Object))
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'daynight-fill', type: 'fill' }),
    )
    control.onRemove()
  })

  it('defers layer building to the style.load event when the style is not ready', () => {
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)

    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function))

    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalled()
    control.onRemove()
  })

  it('polls the daynight endpoint on a 60s interval', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false } as Response))
    vi.stubGlobal('fetch', fetchSpy)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    // One immediate fetch on init.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    control.onRemove()
  })
})

describe('DaynightControl.initLayers', () => {
  it('removes a pre-existing layer and source before rebuilding', () => {
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true, existingLayers: ['daynight-fill'], hasSource: true })
    control.onAdd(map.map)

    expect(map.removeLayer).toHaveBeenCalledWith('daynight-fill')
    expect(map.removeSource).toHaveBeenCalledWith('daynight-source')
    control.onRemove()
  })

  it('swallows an error thrown while removing the old source', () => {
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true, hasSource: true, removeSourceThrows: true })
    // Must not throw out of onAdd despite removeSource failing.
    expect(() => control.onAdd(map.map)).not.toThrow()
    expect(map.addSource).toHaveBeenCalled()
    control.onRemove()
  })

  it('adds the layer hidden when visibility is off', () => {
    spaceStore.setOverlay('daynight', false)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ layout: { visibility: 'none' } }),
    )
    control.onRemove()
  })
})

describe('DaynightControl._fetch', () => {
  it('pushes fetched geojson into the source when present', async () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[]] },
      properties: {},
    }
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(feature) } as unknown as Response),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true, sourcePresentForFetch: true })
    control.onAdd(map.map)
    await control._fetch()

    expect(map.setData).toHaveBeenCalledWith(feature)
    control.onRemove()
  })

  it('caches the geojson even when the source is not yet present', async () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
      properties: {},
    }
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(feature) } as unknown as Response),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const control = new DaynightControl(spaceStore)
    // No source for fetch, so setData is never called, but the cache is filled
    // and used when the layers are (re)built.
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    await control._fetch()
    expect(map.setData).not.toHaveBeenCalled()

    // Rebuilding now seeds the source with the cached geometry, not the empty one.
    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalledWith('daynight-source', {
      type: 'geojson',
      data: feature,
    })
    control.onRemove()
  })

  it('returns early without parsing when the response is not ok', async () => {
    const json = vi.fn()
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, json } as unknown as Response))
    vi.stubGlobal('fetch', fetchSpy)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)
    await control._fetch()

    expect(json).not.toHaveBeenCalled()
    control.onRemove()
  })

  it('swallows a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)
    await expect(control._fetch()).resolves.toBeUndefined()
    control.onRemove()
  })
})

describe('DaynightControl.handleClick / toggleDaynight', () => {
  it('toggles shading off, hides the layer, and persists the new state', () => {
    spaceStore.setOverlay('daynight', true)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.dnVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('daynight-fill', 'visibility', 'none')
    expect(spaceStore.overlayStates.daynight).toBe(false)
    expect(control.button.style.opacity).toBe('0.3')
    control.onRemove()
  })

  it('toggles shading on, shows the layer, and persists the new state', () => {
    spaceStore.setOverlay('daynight', false)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.dnVisible).toBe(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('daynight-fill', 'visibility', 'visible')
    expect(spaceStore.overlayStates.daynight).toBe(true)
    expect(control.button.style.opacity).toBe('1')
    control.onRemove()
  })

  it('swallows an error from setLayoutProperty and still persists the toggle', () => {
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    map.setLayoutProperty.mockImplementation(() => {
      throw new Error('no such layer')
    })
    control.onAdd(map.map)

    expect(() => control.handleClickPublic()).not.toThrow()
    expect(spaceStore.overlayStates.daynight).toBe(false)
    control.onRemove()
  })
})

describe('DaynightControl.onRemove', () => {
  it('clears the polling interval and detaches the container', () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false } as Response))
    vi.stubGlobal('fetch', fetchSpy)
    const control = new DaynightControl(spaceStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)
    fetchSpy.mockClear()

    control.onRemove()

    // No further polling after removal.
    vi.advanceTimersByTime(120000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is safe to call when no interval was ever started', () => {
    const control = new DaynightControl(spaceStore)
    // onRemove without onAdd: _pollInterval is null, super.onRemove tolerates it.
    expect(() => control.onRemove()).not.toThrow()
  })
})
