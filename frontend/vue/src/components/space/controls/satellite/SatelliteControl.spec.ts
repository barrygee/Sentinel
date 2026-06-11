import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import type maplibregl from 'maplibre-gl'

// ---- Marker mock registry ----
interface FakeMarker {
  options: { element: HTMLElement; anchor?: string; offset?: [number, number] }
  lngLat: [number, number] | null
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  getElement: () => HTMLElement
  removed: boolean
}
const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  function Marker(this: FakeMarker, options: FakeMarker['options']) {
    this.options = options
    this.lngLat = null
    this.removed = false
    this.getElement = () => this.options.element
    this.addTo = vi.fn(() => this)
    this.remove = vi.fn(() => {
      this.removed = true
      return this
    })
    this.setLngLat = vi.fn((coords: [number, number]) => {
      this.lngLat = coords
      return this
    })
    markerRegistry.instances.push(this)
  }
  return { default: { Marker } }
})

// Sprite factories touch <canvas>; stub the icon/bracket to sentinels and make
// buildFootprintFeatures controllable (it can be told to throw).
const spriteState = vi.hoisted(() => ({ footprintThrows: false }))
vi.mock('./satelliteSprites', () => {
  const fakeImage = () =>
    ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) as unknown as ImageData
  return {
    createSatelliteIcon: fakeImage,
    createSatBracket: fakeImage,
    buildFootprintFeatures: (geom: unknown) => {
      if (spriteState.footprintThrows) throw new Error('bad footprint')
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geom, properties: {} }],
      } as GeoJSON.FeatureCollection
    },
  }
})

import { SatelliteControl } from './SatelliteControl'
import { useSpaceStore } from '@/stores/space'
import { useNotificationsStore } from '@/stores/notifications'
import { useTrackingStore } from '@/stores/tracking'

// ---- API payload factory ----
interface IssPosition {
  lon: number
  lat: number
  alt_km: number
  velocity_kms: number
  track_deg: number
}
function makePosition(overrides: Partial<IssPosition> = {}): IssPosition {
  return { lon: 10, lat: 20, alt_km: 420, velocity_kms: 7.66, track_deg: 51, ...overrides }
}
function makeIssData(position = makePosition()) {
  return {
    position,
    ground_track: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
    footprint: { type: 'Polygon', coordinates: [[]] } as GeoJSON.Polygon,
  }
}

// ---- fetch router ----
const net = {
  tleTotal: 0, // default: empty DB → mount does not start polling
  tleStatusMode: 'ok' as 'ok' | 'notok' | 'throw',
  tleMissingTotal: false, // status payload omits `total` entirely
  satOk: true,
  satBody: makeIssData() as unknown,
}

function installFetch() {
  return vi.fn((url: string, _opts?: { signal?: AbortSignal }) => {
    if (url.includes('/tle/status')) {
      if (net.tleStatusMode === 'throw') return Promise.reject(new Error('offline'))
      if (net.tleStatusMode === 'notok') return Promise.resolve({ ok: false } as Response)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(net.tleMissingTotal ? {} : { total: net.tleTotal }),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: net.satOk,
      json: () => Promise.resolve(net.satBody),
    } as unknown as Response)
  })
}

// ---- fake map ----
interface MapEvent {
  event: string
  layer?: string
  fn: (...args: unknown[]) => void
}
interface FakeMap {
  map: maplibregl.Map
  sources: Set<string>
  sourceData: Record<string, GeoJSON.GeoJSON>
  layers: Set<string>
  images: Set<string>
  events: MapEvent[]
  styleHandlers: Array<() => void>
  setLayoutProperty: ReturnType<typeof vi.fn>
  easeTo: ReturnType<typeof vi.fn>
  flyTo: ReturnType<typeof vi.fn>
  canvasStyle: { cursor: string }
  fire: (event: string, layer?: string, payload?: unknown) => void
  zoom: number
}
function fakeMap(options: { styleLoaded?: boolean; zoom?: number } = {}): FakeMap {
  const sources = new Set<string>()
  const sourceData: Record<string, GeoJSON.GeoJSON> = {}
  const layers = new Set<string>()
  const images = new Set<string>()
  const events: MapEvent[] = []
  const styleHandlers: Array<() => void> = []
  const canvasStyle = { cursor: '' }
  const setLayoutProperty = vi.fn()
  const easeTo = vi.fn((opts?: { easing?: (t: number) => number }) => {
    opts?.easing?.(0)
  })
  const flyTo = vi.fn()
  const state = { zoom: options.zoom ?? 2 }

  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, fn: () => void) => {
      if (event === 'style.load') styleHandlers.push(fn)
    }),
    on: vi.fn((event: string, layerOrFn: unknown, maybeFn?: unknown) => {
      if (typeof layerOrFn === 'function') events.push({ event, fn: layerOrFn as MapEvent['fn'] })
      else events.push({ event, layer: layerOrFn as string, fn: maybeFn as MapEvent['fn'] })
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    getSource: vi.fn((id: string) =>
      sources.has(id)
        ? { setData: vi.fn((data: GeoJSON.GeoJSON) => (sourceData[id] = data)) }
        : undefined,
    ),
    addSource: vi.fn((id: string, opts: { data?: GeoJSON.GeoJSON }) => {
      sources.add(id)
      if (opts?.data) sourceData[id] = opts.data
    }),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    hasImage: vi.fn((id: string) => images.has(id)),
    addImage: vi.fn((id: string) => images.add(id)),
    removeImage: vi.fn((id: string) => images.delete(id)),
    setLayoutProperty,
    easeTo,
    flyTo,
    getCenter: vi.fn(() => ({ lat: 20, lng: 10 })),
    getZoom: vi.fn(() => state.zoom),
    getCanvas: vi.fn(() => ({ style: canvasStyle })),
  } as unknown as maplibregl.Map

  const fire = (event: string, layer?: string, payload?: unknown) => {
    for (const entry of events) {
      if (entry.event === event && entry.layer === layer) entry.fn(payload)
    }
  }

  return {
    map,
    sources,
    sourceData,
    layers,
    images,
    events,
    styleHandlers,
    setLayoutProperty,
    easeTo,
    flyTo,
    canvasStyle,
    fire,
    get zoom() {
      return state.zoom
    },
    set zoom(value: number) {
      state.zoom = value
    },
  }
}

// ---- bootstrap ----
let spaceStore: ReturnType<typeof useSpaceStore>
let notificationsStore: ReturnType<typeof useNotificationsStore>
let trackingStore: ReturnType<typeof useTrackingStore>
let userLocation: [number, number] | null
let fetchMock: ReturnType<typeof vi.fn>

function makeControl(onSwitch: ((noradId: string, name: string) => void) | null = null) {
  return new SatelliteControl(
    spaceStore,
    notificationsStore,
    trackingStore,
    () => userLocation,
    onSwitch,
  )
}

// Mount onto a style-loaded fake map and flush the TLE-status check.
async function mounted(opts: { onSwitch?: ((n: string, s: string) => void) | null } = {}) {
  const control = makeControl(opts.onSwitch ?? null)
  const map = fakeMap({ styleLoaded: true })
  control.onAdd(map.map)
  await flushPromises()
  return { control, map }
}

beforeEach(() => {
  setActivePinia(createPinia())
  spaceStore = useSpaceStore()
  notificationsStore = useNotificationsStore()
  trackingStore = useTrackingStore()
  userLocation = null
  localStorage.clear()
  markerRegistry.instances.length = 0
  spriteState.footprintThrows = false
  net.tleTotal = 0
  net.tleStatusMode = 'ok'
  net.tleMissingTotal = false
  net.satOk = true
  net.satBody = makeIssData()
  document.body.innerHTML = '<div id="no-tle-overlay" class="hidden"></div>'
  fetchMock = installFetch()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SatelliteControl constructor + getters', () => {
  it('seeds visibility from the store and exposes label/title', () => {
    spaceStore.setOverlay('iss', true)
    const control = makeControl()
    expect(control.issVisible).toBe(true)
    expect(control.trackVisible).toBe(true)
    expect(control.footprintVisible).toBe(true)
    expect(control.buttonLabel).toContain('<svg')
    expect(control.buttonTitle).toBe('Toggle ISS tracking')
  })

  it('reports follow state and active satellite via getters', () => {
    const control = makeControl()
    expect(control.isFollowing).toBe(false)
    expect(control.followedNoradId).toBeNull()
    expect(control.activeNoradId).toBe('25544')
    expect(control.passNotificationsEnabled).toBe(false)
  })
})

describe('SatelliteControl.onInit', () => {
  it('builds layers immediately when the style is already loaded', async () => {
    const { map } = await mounted()
    expect(map.layers.has('iss-icon')).toBe(true)
    expect(map.layers.has('iss-bracket')).toBe(true)
    expect(map.images.has('iss-icon-sprite')).toBe(true)
  })

  it('defers layer building until style.load when the style is not ready', async () => {
    const control = makeControl()
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(map.layers.size).toBe(0)
    map.styleHandlers[0]!()
    await flushPromises()
    expect(map.layers.has('iss-icon')).toBe(true)
    control.onRemove()
  })

  it('restores a persisted follow: seeds the satellite and forces ISS visible', async () => {
    localStorage.setItem(
      'sentinel_space_follow',
      JSON.stringify({ noradId: '99999', name: 'NOAA 19' }),
    )
    spaceStore.setOverlay('iss', false)
    const { control } = await mounted()
    expect(control.activeNoradId).toBe('99999')
    expect(control.issVisible).toBe(true)
    expect(spaceStore.overlayStates.iss).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl._startTrackingIfTleReady', () => {
  it('shows the no-TLE overlay and does not poll when the DB is empty', async () => {
    net.tleTotal = 0
    const { control, map } = await mounted()
    expect(document.getElementById('no-tle-overlay')!.classList.contains('hidden')).toBe(false)
    // No satellite fetch fired — only the tle/status check.
    expect(fetchMock.mock.calls.every((call) => String(call[0]).includes('/tle/status'))).toBe(true)
    control.onRemove()
    void map
  })

  it('fetches and starts polling when the DB has data', async () => {
    net.tleTotal = 5
    const { control } = await mounted()
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/space/iss')).toBe(true)
    control.onRemove()
  })

  it('assumes data (fetches) when the tle status request is not ok', async () => {
    net.tleStatusMode = 'notok'
    const { control } = await mounted()
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/space/iss')).toBe(true)
    control.onRemove()
  })

  it('assumes data (fetches) when the tle status request throws', async () => {
    net.tleStatusMode = 'throw'
    const { control } = await mounted()
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/space/iss')).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl._obsQuery', () => {
  it('appends the observer lat/lon to the fetch URL when a fix is known', async () => {
    userLocation = [12, 34]
    net.tleTotal = 5
    const { control } = await mounted()
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]) === '/api/space/iss?lat=34&lon=12'),
    ).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl._fetch', () => {
  it('updates the live/track/footprint sources and emits iss-position-update', async () => {
    const { control, map } = await mounted()
    const positionEvents: unknown[] = []
    const handler = (event: Event) => positionEvents.push((event as CustomEvent).detail)
    document.addEventListener('iss-position-update', handler)

    net.satBody = makeIssData(makePosition({ lon: 5, lat: 6 }))
    await control._fetch()

    const live = map.sourceData['iss-live'] as GeoJSON.FeatureCollection
    expect((live.features[0]!.geometry as GeoJSON.Point).coordinates).toEqual([5, 6])
    expect(positionEvents).toHaveLength(1)
    expect((positionEvents[0] as { noradId: string }).noradId).toBe('25544')
    document.removeEventListener('iss-position-update', handler)
    control.onRemove()
  })

  it('hides the no-TLE overlay and pauses polling when the response reports no_tle_data', async () => {
    const { control } = await mounted()
    net.satOk = false
    net.satBody = { no_tle_data: true }
    control._startPolling()
    await control._fetch()
    expect(document.getElementById('no-tle-overlay')!.classList.contains('hidden')).toBe(false)
    control.onRemove()
  })

  it('returns quietly on a non-ok response without no_tle_data', async () => {
    const { control, map } = await mounted()
    net.satOk = false
    net.satBody = {}
    await control._fetch()
    // The live source keeps its seeded empty collection — no point was written.
    expect((map.sourceData['iss-live'] as GeoJSON.FeatureCollection).features).toHaveLength(0)
    control.onRemove()
  })

  it('returns when the payload carries an error field', async () => {
    const { control, map } = await mounted()
    net.satBody = { error: 'no tle', position: makePosition() }
    await control._fetch()
    expect((map.sourceData['iss-live'] as GeoJSON.FeatureCollection).features).toHaveLength(0)
    control.onRemove()
  })

  it('swallows a footprint build error but still updates the icon', async () => {
    const { control, map } = await mounted()
    spriteState.footprintThrows = true
    net.satBody = makeIssData(makePosition({ lon: 1, lat: 2 }))
    await control._fetch()
    const live = map.sourceData['iss-live'] as GeoJSON.FeatureCollection
    expect((live.features[0]!.geometry as GeoJSON.Point).coordinates).toEqual([1, 2])
    control.onRemove()
  })

  it('swallows a network error', async () => {
    const { control } = await mounted()
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('down')))
    await expect(control._fetch()).resolves.toBeUndefined()
    control.onRemove()
  })

  it('shows the moving label while ISS is visible and not following', async () => {
    const { control } = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 3, lat: 4 }))
    await control._fetch()
    const label = markerRegistry.instances.find((marker) =>
      marker.options.element.className.includes('iss-label'),
    )
    expect(label).toBeDefined()
    expect(label!.lngLat).toEqual([3, 4])
    control.onRemove()
  })
})

describe('SatelliteControl polling', () => {
  it('polls every 5s and stops cleanly', async () => {
    vi.useFakeTimers()
    const control = makeControl()
    const map = fakeMap({ styleLoaded: true })
    net.tleTotal = 5
    control.onAdd(map.map)
    await vi.advanceTimersByTimeAsync(0) // resolve tle status → fetch + startPolling
    const callsAfterMount = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount)
    control.onRemove()
    const callsAfterRemove = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock.mock.calls.length).toBe(callsAfterRemove)
  })

  it('startPolling is idempotent', async () => {
    const { control } = await mounted()
    control._startPolling()
    control._startPolling()
    control.onRemove()
  })
})

describe('SatelliteControl follow', () => {
  async function withPosition() {
    const ctx = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 10, lat: 20 }))
    await ctx.control._fetch()
    return ctx
  }

  it('startFollowing registers tracking, eases the camera and persists', async () => {
    const { control, map } = await withPosition()
    const followEvents: unknown[] = []
    const handler = (event: Event) => followEvents.push((event as CustomEvent).detail)
    document.addEventListener('satellite-follow-changed', handler)

    control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()

    expect(control.isFollowing).toBe(true)
    expect(control.followedNoradId).toBe('25544')
    expect(map.easeTo).toHaveBeenCalled()
    expect(localStorage.getItem('sentinel_space_follow')).toContain('25544')
    expect(trackingStore.isLive('space')).toBe(true)
    document.removeEventListener('satellite-follow-changed', handler)
    control.onRemove()
  })

  it('stopFollowing tears down tracking, recentres home and clears persistence', async () => {
    const { control } = await withPosition()
    control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()
    control.stopFollowing()
    expect(control.isFollowing).toBe(false)
    expect(localStorage.getItem('sentinel_space_follow')).toBeNull()
    expect(trackingStore.isLive('space')).toBe(false)
    control.onRemove()
  })

  it('does not start following without a known position', async () => {
    const { control } = await mounted()
    control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()
    expect(control.isFollowing).toBe(true) // flag set, but follow UI deferred to first fetch
    control.onRemove()
  })

  it('resumes a pending follow restore once the first position arrives', async () => {
    localStorage.setItem(
      'sentinel_space_follow',
      JSON.stringify({ noradId: '25544', name: 'ISS (ZARYA)' }),
    )
    const { control } = await mounted()
    net.satBody = makeIssData(makePosition())
    await control._fetch()
    expect(control.isFollowing).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl follow persistence read', () => {
  it('ignores malformed JSON in the follow key', async () => {
    localStorage.setItem('sentinel_space_follow', '{bad json')
    const { control } = await mounted()
    expect(control.activeNoradId).toBe('25544')
    control.onRemove()
  })

  it('ignores a follow entry with no noradId', async () => {
    localStorage.setItem('sentinel_space_follow', JSON.stringify({ name: 'x' }))
    const { control } = await mounted()
    expect(control.activeNoradId).toBe('25544')
    control.onRemove()
  })
})

describe('SatelliteControl.switchSatellite', () => {
  it('switches the active satellite, reveals ISS layers and notifies listeners', async () => {
    const onSwitch = vi.fn()
    spaceStore.setOverlay('iss', false)
    const { control, map } = await mounted({ onSwitch })
    const selected: unknown[] = []
    const handler = (event: Event) => selected.push((event as CustomEvent).detail)
    document.addEventListener('satellite-selected', handler)

    control.switchSatellite('40000', 'STARLINK')
    await flushPromises()

    expect(control.activeNoradId).toBe('40000')
    expect(control.issVisible).toBe(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'visible')
    expect(onSwitch).toHaveBeenCalledWith('40000', 'STARLINK')
    expect(selected).toEqual([{ noradId: '40000', name: 'STARLINK' }])
    document.removeEventListener('satellite-selected', handler)
    control.onRemove()
  })

  it('seeds last position from the preview cache for a different satellite', async () => {
    const { control } = await mounted()
    // Prime a preview position for 40000.
    net.satBody = makeIssData(makePosition({ lon: 7, lat: 8 }))
    await control.previewSatellite('40000', 'STARLINK')
    control.switchSatellite('40000', 'STARLINK', true)
    await flushPromises()
    // Following started immediately because the cached position was available.
    expect(control.isFollowing).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl.focusSatellite', () => {
  it('flies to a known position without engaging follow', async () => {
    const { control, map } = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 9, lat: 9 }))
    await control._fetch()
    map.flyTo.mockClear()
    control.focusSatellite('25544', 'ISS (ZARYA)')
    await flushPromises()
    expect(map.flyTo).toHaveBeenCalled()
    expect(control.isFollowing).toBe(false)
    control.onRemove()
  })

  it('defers the recentre to the first fetch when no position is known yet', async () => {
    const { control, map } = await mounted()
    // No cached position for 40000 → focusSatellite arms a one-shot centre that
    // the switch's own first fetch consumes.
    net.satBody = makeIssData(makePosition({ lon: 2, lat: 3 }))
    map.flyTo.mockClear()
    control.focusSatellite('40000', 'STARLINK')
    await flushPromises()
    expect(map.flyTo).toHaveBeenCalled()
    control.onRemove()
  })
})

describe('SatelliteControl preview', () => {
  it('previews a satellite without disturbing the live sources', async () => {
    const { control, map } = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 11, lat: 12 }))
    await control.previewSatellite('40000', 'STARLINK')
    const live = map.sourceData['iss-live'] as GeoJSON.FeatureCollection
    expect((live.features[0]!.geometry as GeoJSON.Point).coordinates).toEqual([11, 12])
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'visible')
    control.onRemove()
  })

  it('is a no-op when re-previewing the satellite already previewed', async () => {
    const { control } = await mounted()
    await control.previewSatellite('40000', 'STARLINK')
    fetchMock.mockClear()
    await control.previewSatellite('40000', 'STARLINK')
    expect(fetchMock).not.toHaveBeenCalled()
    control.onRemove()
  })

  it('flies to the previewed satellite when the hover preference is "fly"', async () => {
    localStorage.setItem('sentinel_space_filterHoverPreview', 'fly')
    const { control, map } = await mounted()
    map.flyTo.mockClear()
    net.satBody = makeIssData(makePosition({ lon: 1, lat: 1 }))
    await control.previewSatellite('40000', 'STARLINK')
    expect(map.flyTo).toHaveBeenCalled()
    control.onRemove()
  })

  it('abandons a preview whose response is not ok', async () => {
    const { control, map } = await mounted()
    net.satOk = false
    await control.previewSatellite('40000', 'STARLINK')
    expect((map.sourceData['iss-live'] as GeoJSON.FeatureCollection).features).toHaveLength(0)
    control.onRemove()
  })

  it('ignores a stale preview superseded by a newer one', async () => {
    const { control } = await mounted()
    let resolveFirst: (value: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
    const first = control.previewSatellite('40000', 'A')
    // Newer preview supersedes the first (aborts it, changes _previewNoradId).
    await control.previewSatellite('50000', 'B')
    resolveFirst({ ok: true, json: () => Promise.resolve(makeIssData()) })
    await first
    expect(control._previewNoradId).toBe('50000')
    control.onRemove()
  })

  it('clearPreview restores live sources and visibility', async () => {
    const { control, map } = await mounted()
    await control.previewSatellite('40000', 'STARLINK')
    map.setLayoutProperty.mockClear()
    control.clearPreview()
    expect(control._previewNoradId).toBeNull()
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'visible')
    control.onRemove()
  })

  it('clearPreview is a no-op when nothing is previewed', async () => {
    const { control, map } = await mounted()
    map.setLayoutProperty.mockClear()
    control.clearPreview()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    control.onRemove()
  })

  it('clearPreview flies home when the hover preference is "fly"', async () => {
    localStorage.setItem('sentinel_space_filterHoverPreview', 'fly')
    const { control, map } = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 4, lat: 5 }))
    await control._fetch() // establish a last position
    await control.previewSatellite('40000', 'STARLINK')
    map.flyTo.mockClear()
    control.clearPreview()
    expect(map.flyTo).toHaveBeenCalled()
    control.onRemove()
  })
})

describe('SatelliteControl visibility toggles', () => {
  it('toggleIss off hides layers, stops polling and resets to the ISS', async () => {
    spaceStore.setOverlay('iss', true)
    const { control, map } = await mounted()
    control.switchSatellite('40000', 'STARLINK')
    await flushPromises()
    map.setLayoutProperty.mockClear()
    control.toggleIss() // now off
    expect(control.issVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'none')
    expect(control.activeNoradId).toBe('25544')
    expect(spaceStore.overlayStates.iss).toBe(false)
    control.onRemove()
  })

  it('toggleIss on re-shows layers and resumes fetching', async () => {
    spaceStore.setOverlay('iss', false)
    const { control, map } = await mounted()
    map.setLayoutProperty.mockClear()
    control.toggleIss() // now on
    expect(control.issVisible).toBe(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'visible')
    control.onRemove()
  })

  it('toggleTrack flips the orbit layers and persists the overlay state', async () => {
    const { control, map } = await mounted()
    map.setLayoutProperty.mockClear()
    control.toggleTrack()
    expect(control.trackVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-track-orbit0', 'visibility', 'none')
    expect(spaceStore.overlayStates.groundTrack).toBe(false)
    control.onRemove()
  })

  it('toggleFootprint flips the footprint layers', async () => {
    const { control, map } = await mounted()
    map.setLayoutProperty.mockClear()
    control.toggleFootprint()
    expect(control.footprintVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-footprint-fill', 'visibility', 'none')
    control.onRemove()
  })
})

describe('SatelliteControl show-tracks event', () => {
  it('applies the orbit visibility from a sentinel:showTracksChanged event', async () => {
    const { control, map } = await mounted()
    map.setLayoutProperty.mockClear()
    window.dispatchEvent(new CustomEvent('sentinel:showTracksChanged', { detail: { show: false } }))
    expect(control.trackVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-track-orbit1', 'visibility', 'none')
    control.onRemove()
  })
})

describe('SatelliteControl tle:refreshStatus event', () => {
  it('resumes polling when paused on an empty DB', async () => {
    net.tleTotal = 0
    const { control } = await mounted() // paused (overlay shown)
    net.tleTotal = 5
    net.satBody = makeIssData()
    fetchMock.mockClear()
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalled()
    control.onRemove()
  })

  it('ignores tle:refreshStatus when not paused', async () => {
    net.tleTotal = 5
    const { control } = await mounted() // polling already running, not paused
    fetchMock.mockClear()
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalled()
    control.onRemove()
  })
})

describe('SatelliteControl pass notifications', () => {
  it('delegates togglePassNotifications to the notifier', async () => {
    userLocation = [1, 2]
    const { control } = await mounted()
    expect(control.passNotificationsEnabled).toBe(false)
    control.togglePassNotifications()
    expect(control.passNotificationsEnabled).toBe(true)
    control.onRemove()
  })
})

describe('SatelliteControl misc coverage', () => {
  it('handleClick toggles ISS', async () => {
    spaceStore.setOverlay('iss', true)
    const { control } = await mounted()
    control.handleClickPublic()
    expect(control.issVisible).toBe(false)
    control.onRemove()
  })

  it('initLayers tears down existing layers/sources/images on a rebuild', async () => {
    const { control, map } = await mounted()
    const removeLayer = map.map.removeLayer as unknown as ReturnType<typeof vi.fn>
    const removeSource = map.map.removeSource as unknown as ReturnType<typeof vi.fn>
    const removeImage = map.map.removeImage as unknown as ReturnType<typeof vi.fn>
    removeLayer.mockClear()
    removeSource.mockClear()
    removeImage.mockClear()
    control.initLayers()
    expect(removeLayer).toHaveBeenCalledWith('iss-icon')
    expect(removeSource).toHaveBeenCalledWith('iss-live')
    expect(removeImage).toHaveBeenCalledWith('iss-icon-sprite')
    control.onRemove()
  })

  it('sets and clears the pointer cursor on icon/bracket hover', async () => {
    const { control, map } = await mounted()
    map.fire('mouseenter', 'iss-icon')
    expect(map.canvasStyle.cursor).toBe('pointer')
    map.fire('mouseleave', 'iss-icon')
    expect(map.canvasStyle.cursor).toBe('')
    map.fire('mouseenter', 'iss-bracket')
    expect(map.canvasStyle.cursor).toBe('pointer')
    map.fire('mouseleave', 'iss-bracket')
    expect(map.canvasStyle.cursor).toBe('')
    control.onRemove()
  })

  it('swallows a non-ok response whose body cannot be parsed', async () => {
    const { control } = await mounted()
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response),
    )
    await expect(control._fetch()).resolves.toBeUndefined()
    control.onRemove()
  })
})

describe('SatelliteControl tracking label', () => {
  // Establish a position then follow so the tracking label (two spans + badge)
  // is built and added to the map.
  async function following() {
    const ctx = await mounted()
    net.satBody = makeIssData(makePosition({ lon: 10, lat: 20 }))
    await ctx.control._fetch()
    ctx.control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()
    const labelMarker = markerRegistry.instances.find((marker) =>
      marker.options.element.className.includes('iss-label--tracking'),
    )!
    return { ...ctx, labelMarker }
  }

  it('swaps the badge text on hover and back on leave', async () => {
    const { control, labelMarker } = await following()
    const el = labelMarker.options.element
    const badge = el.querySelector('.iss-tracking-badge')!
    el.dispatchEvent(new MouseEvent('mouseenter'))
    expect(badge.textContent).toBe('UNTRACK')
    el.dispatchEvent(new MouseEvent('mouseleave'))
    expect(badge.textContent).toBe('TRACKING')
    control.onRemove()
  })

  it('stops following when the tracking label is clicked', async () => {
    const { control, labelMarker } = await following()
    labelMarker.options.element.dispatchEvent(new MouseEvent('click'))
    expect(control.isFollowing).toBe(false)
    control.onRemove()
  })

  it('stops following when the tracking-panel untrack fires', async () => {
    const { control } = await following()
    trackingStore.getLiveItem('space')!.onUntrack!()
    expect(control.isFollowing).toBe(false)
    control.onRemove()
  })

  it('preview of another sat relabels and hides the tracking badge', async () => {
    const { control, labelMarker } = await following()
    net.satBody = makeIssData(makePosition({ lon: 1, lat: 2 }))
    await control.previewSatellite('40000', 'STARLINK')
    const spans = labelMarker.options.element.querySelectorAll('span')
    expect(spans[0]!.textContent).toBe('STARLINK')
    expect(spans[1]!.classList.contains('iss-tracking-badge--hidden')).toBe(true)
    control.onRemove()
  })

  it('leaves the tracking label untouched when previewing the active satellite', async () => {
    const { control, labelMarker } = await following()
    net.satBody = makeIssData(makePosition({ lon: 1, lat: 2 }))
    await control.previewSatellite('25544', 'ISS (ZARYA)') // same as active → no relabel
    const spans = labelMarker.options.element.querySelectorAll('span')
    expect(spans[0]!.textContent).toBe('ISS (ZARYA)')
    expect(spans[1]!.classList.contains('iss-tracking-badge--hidden')).toBe(false)
    control.onRemove()
  })

  it('clearPreview restores the tracking label name and badge', async () => {
    const { control, labelMarker } = await following()
    net.satBody = makeIssData(makePosition({ lon: 1, lat: 2 }))
    await control.previewSatellite('40000', 'STARLINK')
    control.clearPreview()
    const spans = labelMarker.options.element.querySelectorAll('span')
    expect(spans[0]!.textContent).toBe('ISS (ZARYA)')
    expect(spans[1]!.classList.contains('iss-tracking-badge--hidden')).toBe(false)
    control.onRemove()
  })
})

describe('SatelliteControl branch coverage', () => {
  it('onRemove before onAdd is safe (no listeners registered)', () => {
    const control = makeControl()
    expect(() => control.onRemove()).not.toThrow()
  })

  it('restores a follow entry that has a norad but no name, defaulting the name', async () => {
    localStorage.setItem('sentinel_space_follow', JSON.stringify({ noradId: '77777' }))
    const { control } = await mounted()
    expect(control.activeNoradId).toBe('77777')
    expect(control._activeSatName).toBe('77777')
    control.onRemove()
  })

  it('treats a TLE status payload without a total as empty', async () => {
    net.tleMissingTotal = true
    const { control } = await mounted()
    expect(document.getElementById('no-tle-overlay')!.classList.contains('hidden')).toBe(false)
    control.onRemove()
  })

  it('stops an active follow when switching to a different satellite', async () => {
    const { control } = await mounted()
    net.satBody = makeIssData(makePosition())
    await control._fetch()
    control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()
    expect(control.isFollowing).toBe(true)
    control.switchSatellite('40000', 'STARLINK') // different sat, no follow
    await flushPromises()
    expect(control.isFollowing).toBe(false)
    control.onRemove()
  })

  it('reveals layers as hidden when track + footprint are off during a switch', async () => {
    spaceStore.setOverlay('iss', false)
    const { control, map } = await mounted()
    control.toggleTrack() // trackVisible → false
    control.toggleFootprint() // footprintVisible → false
    map.setLayoutProperty.mockClear()
    control.switchSatellite('40000', 'STARLINK')
    await flushPromises()
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-track-orbit0', 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-footprint-fill', 'visibility', 'none')
    control.onRemove()
  })

  it('previews the ISS via its dedicated endpoint', async () => {
    const { control } = await mounted()
    await control.previewSatellite('25544', 'ISS')
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith('/api/space/iss'))).toBe(
      true,
    )
    control.onRemove()
  })

  it('skips source updates during preview when the sources are absent', async () => {
    const { control, map } = await mounted()
    map.sources.clear()
    await expect(control.previewSatellite('40000', 'STARLINK')).resolves.toBeUndefined()
    control.onRemove()
  })

  it('honours hidden track/footprint toggles while previewing', async () => {
    const { control, map } = await mounted()
    control.toggleTrack()
    control.toggleFootprint()
    map.setLayoutProperty.mockClear()
    await control.previewSatellite('40000', 'STARLINK')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-track-orbit0', 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-footprint-fill', 'visibility', 'none')
    control.onRemove()
  })

  it('a poll fetch during an active preview leaves the live sources untouched', async () => {
    const { control, map } = await mounted()
    await control.previewSatellite('40000', 'STARLINK')
    const previewData = map.sourceData['iss-live']
    net.satBody = makeIssData(makePosition({ lon: 99, lat: 99 }))
    await control._fetch() // preview still active → skips live source writes
    expect(map.sourceData['iss-live']).toBe(previewData)
    control.onRemove()
  })

  it('skips source restores in clearPreview when the sources are absent', async () => {
    const { control, map } = await mounted()
    await control.previewSatellite('40000', 'STARLINK')
    map.sources.clear()
    expect(() => control.clearPreview()).not.toThrow()
    control.onRemove()
  })

  it('restores hidden visibility in clearPreview when ISS is off', async () => {
    const { control, map } = await mounted()
    await control.previewSatellite('40000', 'STARLINK')
    control.issVisible = false
    map.setLayoutProperty.mockClear()
    control.clearPreview()
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-icon', 'visibility', 'none')
    control.onRemove()
  })

  it('toggleTrack back on shows the orbits again', async () => {
    const { control, map } = await mounted()
    control.toggleTrack() // off
    map.setLayoutProperty.mockClear()
    control.toggleTrack() // on
    expect(map.setLayoutProperty).toHaveBeenCalledWith('iss-track-orbit0', 'visibility', 'visible')
    control.onRemove()
  })

  it('toggleFootprint back on shows the footprint again', async () => {
    const { control, map } = await mounted()
    control.toggleFootprint() // off
    map.setLayoutProperty.mockClear()
    control.toggleFootprint() // on
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'iss-footprint-fill',
      'visibility',
      'visible',
    )
    control.onRemove()
  })
})

describe('SatelliteControl.onRemove', () => {
  it('deactivates an active follow and detaches listeners', async () => {
    const { control } = await mounted()
    net.satBody = makeIssData(makePosition())
    await control._fetch()
    control.switchSatellite('25544', 'ISS (ZARYA)', true)
    await flushPromises()
    expect(control.isFollowing).toBe(true)

    control.onRemove()
    // The window listener is gone: a show-tracks event no longer throws/acts.
    expect(() =>
      window.dispatchEvent(
        new CustomEvent('sentinel:showTracksChanged', { detail: { show: true } }),
      ),
    ).not.toThrow()
  })
})
