import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

// ── maplibre-gl mock: record markers so labels/counts can be asserted. ───────
interface RecordedMarker {
  element: HTMLElement
  anchor: string | undefined
  offset: [number, number] | undefined
  lngLat: [number, number] | null
  removed: boolean
}
const mocks = vi.hoisted(() => {
  const created = { markers: [] as RecordedMarker[] }
  class MockMarker {
    element: HTMLElement
    anchor: string | undefined
    offset: [number, number] | undefined
    lngLat: [number, number] | null = null
    removed = false
    constructor(options: { element: HTMLElement; anchor?: string; offset?: [number, number] }) {
      this.element = options.element
      this.anchor = options.anchor
      this.offset = options.offset
      created.markers.push(this)
    }
    setLngLat(coords: [number, number]): this {
      this.lngLat = coords
      return this
    }
    getElement(): HTMLElement {
      return this.element
    }
    addTo(): this {
      return this
    }
    remove(): this {
      this.removed = true
      return this
    }
  }
  return { created, MockMarker }
})
const created = mocks.created
vi.mock('maplibre-gl', () => ({ default: { Marker: mocks.MockMarker } }))

// Canvas sprites need a 2D context jsdom does not have.
vi.mock('./vesselSprites', () => ({
  createVesselArrow: vi.fn(() => ({ width: 64, height: 64, data: new Uint8ClampedArray(4) })),
  createVesselDot: vi.fn(() => ({ width: 64, height: 64, data: new Uint8ClampedArray(4) })),
}))
vi.mock('@/components/air/controls/adsb/adsbSprites', () => ({
  createBracket: vi.fn(() => ({ width: 64, height: 64, data: new Uint8ClampedArray(4) })),
}))

import { AisVesselsControl, deadReckon, isMoving, wrapLongitude } from './AisVesselsControl'
import { useSeaStore, type SeaVessel } from '@/stores/sea'
import {
  SEA_GROUP_ALL_ABOVE_NM,
  SEA_INTERPOLATE_INTERVAL_MS,
  SEA_MOVE_FETCH_DEBOUNCE_MS,
} from '@/constants/sea'

function vessel(overrides: Partial<SeaVessel> = {}): SeaVessel {
  return {
    mmsi: '232012345',
    name: 'PRIDE OF KENT',
    imo: '',
    callsign: '',
    type: '60',
    typeLabel: 'PASSENGER',
    family: 'passenger',
    destination: 'DOVER',
    lat: 51.0,
    lon: 1.0,
    sog: 0,
    cog: 45,
    heading: null,
    navStatus: 0,
    lastPositionMs: Date.now(),
    lastPositionUtc: '',
    ...overrides,
  }
}

interface FakeSource {
  setData: ReturnType<typeof vi.fn>
  loaded: () => boolean
  isLoaded: boolean
}

function makeFakeMap(options: { spanDeg?: number; zoom?: number } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  const handlers: Record<string, Array<(event?: unknown) => void>> = {}
  const sources = new Map<string, FakeSource>()
  const layers = new Map<string, Record<string, unknown>>()
  const layout: Record<string, Record<string, unknown>> = {}
  const filters: Record<string, unknown> = {}
  const images = new Set<string>()
  const spanDeg = options.spanDeg ?? 0.5
  const map = {
    _container: container,
    zoom: options.zoom ?? 10,
    getContainer: () => container,
    getCanvas: () => canvas,
    getZoom(): number {
      return this.zoom
    },
    // A view centred on (1, 51) that is `spanDeg` wide, a third as tall.
    getBounds: () => ({
      getSouth: () => 51 - spanDeg / 6,
      getNorth: () => 51 + spanDeg / 6,
      getWest: () => 1 - spanDeg / 2,
      getEast: () => 1 + spanDeg / 2,
      contains: ([lon, lat]: [number, number]) =>
        Math.abs(lon - 1) <= spanDeg / 2 && Math.abs(lat - 51) <= spanDeg / 6,
    }),
    // Pixel scale chosen so distinct fixture positions land well apart.
    project: ([lon, lat]: [number, number]) => ({
      x: (lon - 1) * 4000 + 500,
      y: (51 - lat) * 4000 + 300,
    }),
    easeTo: vi.fn(),
    queryRenderedFeatures: vi.fn(() => []),
    on: (event: string, layerOrHandler: unknown, maybeHandler?: unknown) => {
      const key = typeof layerOrHandler === 'string' ? `${event}:${layerOrHandler}` : event
      const handler = (typeof layerOrHandler === 'string' ? maybeHandler : layerOrHandler) as (
        event?: unknown,
      ) => void
      ;(handlers[key] ??= []).push(handler)
    },
    off: (event: string, handler: (event?: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((each) => each !== handler)
    },
    _emit: (key: string, event?: unknown) =>
      (handlers[key] ?? []).forEach((handler) => handler(event)),
    _handlerCount: (key: string) => (handlers[key] ?? []).length,
    addSource: (id: string) => {
      sources.set(id, { setData: vi.fn(), loaded: () => sources.get(id)!.isLoaded, isLoaded: true })
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (layer: { id: string }) => {
      layers.set(layer.id, layer)
      layout[layer.id] = {}
    },
    getLayer: (id: string) => layers.get(id),
    setLayoutProperty: (id: string, name: string, value: unknown) => {
      layout[id]![name] = value
    },
    setFilter: (id: string, filter: unknown) => {
      filters[id] = filter
    },
    hasImage: (name: string) => images.has(name),
    addImage: (name: string) => images.add(name),
    updateImage: vi.fn(),
    _sources: sources,
    _layers: layers,
    _layout: layout,
    _filters: filters,
    _images: images,
  }
  return map
}

function labelMarkers(): RecordedMarker[] {
  return created.markers.filter(
    (marker) => !marker.removed && marker.element.dataset.mmsi !== undefined,
  )
}
function countMarkers(): RecordedMarker[] {
  return created.markers.filter(
    (marker) => !marker.removed && marker.element.classList.contains('sea-count-marker'),
  )
}

describe('AisVesselsControl', () => {
  let store: ReturnType<typeof useSeaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    created.markers.length = 0
    vi.useFakeTimers()
    store = useSeaStore()
    // The control starts the store's poll on init. The network stub echoes the
    // vessels a test has set, so a resolved snapshot never replaces them.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ vessels: store.vessels, samples: [] }),
      })),
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function addControl(options: Parameters<typeof makeFakeMap>[0] = {}) {
    const control = new AisVesselsControl(store)
    const map = makeFakeMap(options)
    control.onAdd(map as never)
    return { control, map }
  }

  // ── setup ────────────────────────────────────────────────────────────────

  it('registers its sprites, sources and layers, and starts polling', () => {
    const startSpy = vi.spyOn(store, 'startPolling')
    const { control, map } = addControl()
    expect(control.buttonTitle).toBe('Toggle live vessels')
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect(control.button.getAttribute('aria-label')).toBe('Toggle live vessels')
    expect(startSpy).toHaveBeenCalledOnce()
    expect([...map._sources.keys()]).toEqual(['sea-vessels', 'sea-vessel-track'])
    expect([...map._layers.keys()]).toEqual([
      'sea-vessel-track-line',
      'sea-vessel-icons',
      'sea-vessel-bracket',
      'sea-vessel-hit',
    ])
    expect(map._images.has('sea-vessel-cargo')).toBe(true)
    expect(map._images.has('sea-dot-sar')).toBe(true)
    expect(map._images.has('sea-bracket')).toBe(true)
    // The viewport is published for the store's next poll.
    expect(store.viewportBbox).not.toBeNull()
  })

  it('re-running initLayers after a style reload keeps a single set and refreshes images', () => {
    const { control, map } = addControl()
    control.initLayers()
    expect(map._layers.size).toBe(4)
    expect(map.updateImage).toHaveBeenCalled()
  })

  it('keeps a hidden status line for assistive tech', async () => {
    const { map } = addControl()
    const region = map._container.querySelector('[role="status"]')!
    expect(region.getAttribute('aria-label')).toBe('Live vessels')
    expect(region.textContent).toContain('No vessels plotted')
    store.vessels = [vessel()]
    await nextTick()
    expect(region.textContent).toContain('1 vessel plotted')
    store.vessels = [vessel(), vessel({ mmsi: '2', lat: 51.01 })]
    await nextTick()
    expect(region.textContent).toContain('2 vessels plotted')
    vi.useRealTimers() // axe schedules its own timers
    expect(await axe(map._container)).toHaveNoViolations()
  })

  // ── features ─────────────────────────────────────────────────────────────

  it('pushes a feature per vessel under the current filter category', async () => {
    const { map } = addControl()
    const source = map._sources.get('sea-vessels')!
    store.vessels = [
      vessel({ mmsi: '1', family: 'cargo', heading: 90, cog: 80 }),
      vessel({ mmsi: '2', family: 'fishing', cog: null, lastPositionMs: Date.now() - 11 * 60_000 }),
    ]
    await nextTick()
    const collection = source.setData.mock.calls.at(-1)![0] as GeoJSON.FeatureCollection
    expect(collection.features).toHaveLength(2)
    const [cargo, trawler] = collection.features as GeoJSON.Feature<
      GeoJSON.Point,
      Record<string, unknown>
    >[]
    expect(cargo!.properties).toMatchObject({
      mmsi: '1',
      family: 'cargo',
      rotate: 90,
      hasCourse: 1,
      stale: 0,
    })
    expect(trawler!.properties).toMatchObject({ mmsi: '2', rotate: 0, hasCourse: 0, stale: 1 })
    store.setSeaFilterCategory('cargo')
    await nextTick()
    expect(
      (source.setData.mock.calls.at(-1)![0] as GeoJSON.FeatureCollection).features,
    ).toHaveLength(1)
  })

  it('dead-reckons moving vessels on the tick, only when the source is idle', async () => {
    const { map } = addControl()
    const source = map._sources.get('sea-vessels')!
    store.vessels = [vessel({ sog: 20, cog: 90, lastPositionMs: Date.now() - 60_000 })]
    await nextTick()
    const before = source.setData.mock.calls.length
    source.isLoaded = false
    vi.advanceTimersByTime(SEA_INTERPOLATE_INTERVAL_MS)
    expect(source.setData.mock.calls.length).toBe(before)
    source.isLoaded = true
    vi.advanceTimersByTime(SEA_INTERPOLATE_INTERVAL_MS)
    expect(source.setData.mock.calls.length).toBe(before + 1)
    const moved = (source.setData.mock.calls.at(-1)![0] as GeoJSON.FeatureCollection)
      .features[0] as GeoJSON.Feature<GeoJSON.Point>
    expect(moved.geometry.coordinates[0]).toBeGreaterThan(1.0)
    // The pill follows the vessel.
    expect(labelMarkers()[0]!.lngLat![0]).toBeGreaterThan(1.0)
    // Stationary vessels and a hidden layer push nothing.
    store.vessels = [vessel()]
    await nextTick()
    const idle = source.setData.mock.calls.length
    vi.advanceTimersByTime(SEA_INTERPOLATE_INTERVAL_MS)
    expect(source.setData.mock.calls.length).toBe(idle)
    store.setOverlay('vessels', false)
    await nextTick()
    const hidden = source.setData.mock.calls.length
    vi.advanceTimersByTime(SEA_INTERPOLATE_INTERVAL_MS)
    expect(source.setData.mock.calls.length).toBe(hidden)
  })

  // ── visibility ───────────────────────────────────────────────────────────

  it('toggles every layer with the store flag, from the button, toggle() and setVisible()', async () => {
    const { control, map } = addControl()
    expect(map._layout['sea-vessel-hit']!.visibility).toBe('visible')
    control.handleClickPublic()
    await nextTick()
    expect(store.overlayStates.vessels).toBe(false)
    for (const layer of [
      'sea-vessel-icons',
      'sea-vessel-bracket',
      'sea-vessel-hit',
      'sea-vessel-track-line',
    ]) {
      expect(map._layout[layer]!.visibility).toBe('none')
    }
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
    control.toggle()
    await nextTick()
    expect(store.overlayStates.vessels).toBe(true)
    control.setVisible(true) // no-op
    control.setVisible(false)
    expect(store.overlayStates.vessels).toBe(false)
  })

  it('shows bare arrows only while labels are switched off', async () => {
    const { map } = addControl()
    store.vessels = [vessel()]
    await nextTick()
    expect(map._layout['sea-vessel-icons']!.visibility).toBe('none')
    expect(labelMarkers()).toHaveLength(1)
    store.setOverlay('vesselLabels', false)
    await nextTick()
    expect(map._layout['sea-vessel-icons']!.visibility).toBe('visible')
    expect(labelMarkers()).toHaveLength(0)
  })

  // ── labels & counts ──────────────────────────────────────────────────────

  it('draws a pill per vessel in view with the enabled fields, facing its course', async () => {
    addControl()
    store.setLabelFields({
      name: true,
      type: true,
      mmsi: true,
      flag: true,
      destination: true,
      speed: true,
      course: true,
    })
    store.vessels = [
      vessel({ mmsi: '1', name: 'EASTBOUND', cog: 90, sog: 12.34, destination: `A<B>&"'C` }),
      vessel({
        mmsi: '2',
        name: 'WESTBOUND',
        lat: 51.05,
        cog: 270,
        sog: null,
        typeLabel: '',
        destination: '',
      }),
      vessel({ mmsi: '3', name: 'OFFSCREEN', lat: 40 }),
    ]
    await nextTick()
    const pills = labelMarkers()
    expect(pills).toHaveLength(2)
    const east = pills.find((pill) => pill.element.dataset.mmsi === '1')!
    expect(east.anchor).toBe('right')
    expect(east.offset).toEqual([13, 0])
    expect(east.element.textContent).toContain('EASTBOUND')
    expect(east.element.textContent).toContain('PASSENGER')
    expect(east.element.textContent).toContain('MMSI1')
    // Destination text is escaped, never injected as markup.
    expect(east.element.textContent).toContain(`A<B>&"'C`)
    expect(east.element.innerHTML).toContain('A&lt;B&gt;&amp;')
    expect(east.element.querySelector('b')).toBeNull()
    expect(east.element.textContent).toContain('12.3KN')
    expect(east.element.textContent).toContain('90°')
    expect(east.element.getAttribute('aria-label')).toBe('Vessel EASTBOUND, PASSENGER')
    const west = pills.find((pill) => pill.element.dataset.mmsi === '2')!
    expect(west.anchor).toBe('left')
    expect(west.element.textContent).not.toContain('KN')
    // With the name switched off the pill is the glyph well and badges alone.
    store.setLabelFields({ ...store.labelFields, name: false })
    await nextTick()
    expect(
      labelMarkers().find((pill) => pill.element.dataset.mmsi === '1')!.element.textContent,
    ).not.toContain('EASTBOUND')
  })

  it('rebuilds a pill only when its content changes, and drops pills for vessels gone', async () => {
    addControl()
    store.vessels = [vessel()]
    await nextTick()
    const first = labelMarkers()[0]!
    // Same content, new position → moved, not rebuilt.
    store.vessels = [vessel({ lat: 51.01 })]
    await nextTick()
    expect(labelMarkers()[0]).toBe(first)
    expect(first.lngLat).toEqual([1, 51.01])
    // A field change rebuilds it.
    store.setLabelFields({ ...store.labelFields, mmsi: true })
    await nextTick()
    expect(labelMarkers()[0]).not.toBe(first)
    expect(first.removed).toBe(true)
    store.vessels = []
    await nextTick()
    expect(labelMarkers()).toHaveLength(0)
  })

  it('clicking a pill selects the vessel and opens its row', async () => {
    const { map } = addControl()
    const opened = vi.fn()
    document.addEventListener('sea-open-vessel', opened)
    store.vessels = [vessel()]
    await nextTick()
    labelMarkers()[0]!.element.dispatchEvent(new Event('click', { bubbles: true }))
    expect(store.selectedMmsi).toBe('232012345')
    expect(opened).toHaveBeenCalledOnce()
    await nextTick()
    expect(map._filters['sea-vessel-bracket']).toEqual(['==', ['get', 'mmsi'], '232012345'])
    document.removeEventListener('sea-open-vessel', opened)
  })

  it('collapses a huddle into a count that zooms in when clicked', async () => {
    const { map } = addControl()
    store.vessels = [
      vessel({ mmsi: '1', name: 'A' }),
      vessel({ mmsi: '2', name: 'B', lat: 51.0001 }),
      vessel({ mmsi: '3', name: 'C', lat: 51.0002 }),
    ]
    await nextTick()
    expect(countMarkers()).toHaveLength(1)
    const count = countMarkers()[0]!
    expect(count.element.textContent).toBe('2')
    expect(count.element.getAttribute('aria-label')).toBe('2 vessels here — zoom in to see them')
    count.element.dispatchEvent(new Event('click', { bubbles: true }))
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 12 }))
    // Same huddle, same count marker on the next render; a changed size rebuilds it.
    map._emit('moveend')
    expect(countMarkers()[0]).toBe(count)
    store.vessels = [...store.vessels, vessel({ mmsi: '4', name: 'D', lat: 51.00015 })]
    await nextTick()
    expect(countMarkers()[0]).not.toBe(count)
    expect(countMarkers()[0]!.element.textContent).toBe('3')
    store.vessels = [vessel({ mmsi: '1', name: 'A' })]
    await nextTick()
    expect(countMarkers()).toHaveLength(0)
  })

  it('groups a wide view into counts', async () => {
    const { map } = addControl({ spanDeg: 4 }) // ≈150 NM across
    expect(4 * 60 * Math.cos((51 * Math.PI) / 180)).toBeGreaterThan(SEA_GROUP_ALL_ABOVE_NM)
    store.vessels = [
      vessel({ mmsi: '1', name: 'A' }),
      vessel({ mmsi: '2', name: 'B', lat: 51.001 }),
      vessel({ mmsi: '3', name: 'LONER', lat: 51.3, lon: 2.5 }),
    ]
    await nextTick()
    expect(countMarkers()).toHaveLength(1)
    expect(labelMarkers().map((pill) => pill.element.dataset.mmsi)).toEqual(['3'])
    expect(map._layout['sea-vessel-icons']!.visibility).toBe('none')
  })

  // ── selection & track ────────────────────────────────────────────────────

  it('selectByMmsi brackets the vessel, fetches its track and can fly to it', async () => {
    const { control, map } = addControl()
    const trackSpy = vi.spyOn(store, 'fetchTrack').mockResolvedValue()
    store.vessels = [vessel()]
    await nextTick()
    control.selectByMmsi('232012345', { flyTo: true })
    expect(trackSpy).toHaveBeenCalledWith('232012345')
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 11, center: [1, 51] }))
    control.selectByMmsi('unknown', { flyTo: true })
    expect(map.easeTo).toHaveBeenCalledTimes(1)
    await nextTick()
    // The track line is drawn in the family colour once samples arrive.
    const trackSource = map._sources.get('sea-vessel-track')!
    store.setSelectedMmsi('232012345')
    store.setSelectedTrack([
      { lat: 50.9, lon: 0.9, t: 1 },
      { lat: 51, lon: 1, t: 2 },
    ])
    await nextTick()
    const drawn = trackSource.setData.mock.calls.at(-1)![0] as GeoJSON.FeatureCollection
    expect(drawn.features).toHaveLength(1)
    expect(drawn.features[0]!.properties).toEqual({ color: expect.stringMatching(/^#/) })
    // A single fix is not a track.
    store.setSelectedTrack([{ lat: 51, lon: 1, t: 2 }])
    await nextTick()
    expect(
      (trackSource.setData.mock.calls.at(-1)![0] as GeoJSON.FeatureCollection).features,
    ).toEqual([])
  })

  it('clicking empty sea clears the selection; clicking a vessel selects it', async () => {
    const { control, map } = addControl()
    store.vessels = [vessel()]
    await nextTick()
    control.clearSelection() // nothing selected: a no-op
    store.setSelectedMmsi('232012345')
    store.setSelectedTrack([{ lat: 1, lon: 1, t: 1 }])
    map.queryRenderedFeatures.mockReturnValueOnce([{}] as never)
    map._emit('click', { point: { x: 0, y: 0 } })
    expect(store.selectedMmsi).toBe('232012345') // a hit — left to the layer handler
    map._emit('click', { point: { x: 0, y: 0 } })
    expect(store.selectedMmsi).toBe('')
    expect(store.selectedTrack).toEqual([])
    map._emit('click:sea-vessel-hit', { features: [{ properties: { mmsi: '232012345' } }] })
    expect(store.selectedMmsi).toBe('232012345')
    map._emit('click:sea-vessel-hit', { features: [] })
    expect(store.selectedMmsi).toBe('232012345')
  })

  // ── hover ────────────────────────────────────────────────────────────────

  it('shows a transient pill for a hovered vessel that has none, and never twice', async () => {
    const { map } = addControl()
    store.setOverlay('vesselLabels', false)
    store.vessels = [vessel(), vessel({ mmsi: '9', name: 'GHOST', lat: 40 })]
    await nextTick()
    const before = created.markers.length
    map._emit('mouseenter:sea-vessel-hit', { features: [{ properties: { mmsi: '232012345' } }] })
    expect(map.getCanvas().style.cursor).toBe('pointer')
    expect(created.markers).toHaveLength(before + 1)
    expect(created.markers.at(-1)!.element.style.pointerEvents).toBe('none')
    expect(created.markers.at(-1)!.anchor).toBe('right') // course 45° reads left-facing
    map._emit('mouseenter:sea-vessel-hit', { features: [{ properties: { mmsi: '232012345' } }] })
    expect(created.markers).toHaveLength(before + 1)
    map._emit('mouseleave:sea-vessel-hit')
    expect(created.markers.at(-1)!.removed).toBe(true)
    expect(map.getCanvas().style.cursor).toBe('')
    // A vessel with no feature in the current filter draws nothing.
    map._emit('mouseenter:sea-vessel-hit', { features: [{ properties: { mmsi: 'nope' } }] })
    map._emit('mouseenter:sea-vessel-hit', { features: [] })
    expect(created.markers).toHaveLength(before + 1)
    // A vessel that already has a pill needs no hover copy.
    store.setOverlay('vesselLabels', true)
    await nextTick()
    const withPills = created.markers.length
    map._emit('mouseenter:sea-vessel-hit', { features: [{ properties: { mmsi: '232012345' } }] })
    expect(created.markers).toHaveLength(withPills)
  })

  it('faces the hover pill the way the vessel is heading', async () => {
    const { map } = addControl()
    store.setOverlay('vesselLabels', false)
    store.vessels = [vessel({ cog: 270 })]
    await nextTick()
    map._emit('mouseenter:sea-vessel-hit', { features: [{ properties: { mmsi: '232012345' } }] })
    expect(created.markers.at(-1)!.anchor).toBe('left')
    expect(created.markers.at(-1)!.offset).toEqual([-13, 0])
  })

  // ── viewport ─────────────────────────────────────────────────────────────

  it('publishes a padded viewport and refetches after a move settles', () => {
    const fetchSpy = vi.spyOn(store, 'fetchVessels').mockResolvedValue()
    const { map } = addControl({ spanDeg: 1 })
    const [south, west, north, east] = store.viewportBbox!
    expect(south).toBeLessThan(51 - 1 / 6)
    expect(north).toBeGreaterThan(51 + 1 / 6)
    expect(west).toBeLessThan(0.5)
    expect(east).toBeGreaterThan(1.5)
    map._emit('moveend')
    map._emit('moveend')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SEA_MOVE_FETCH_DEBOUNCE_MS)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('treats a view wider than the world as worldwide', () => {
    addControl({ spanDeg: 400 })
    expect(store.viewportBbox).toBeNull()
  })

  // ── teardown ─────────────────────────────────────────────────────────────

  it('removes everything it added and stops polling', async () => {
    const stopSpy = vi.spyOn(store, 'stopPolling')
    const { control, map } = addControl()
    store.vessels = [
      vessel(),
      vessel({ mmsi: '2', lat: 51.0001 }),
      vessel({ mmsi: '3', lat: 51.0002 }),
    ]
    await nextTick()
    map._emit('moveend')
    control.onRemove()
    expect(stopSpy).toHaveBeenCalledOnce()
    expect(map._handlerCount('moveend')).toBe(0)
    expect(map._handlerCount('click')).toBe(0)
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
    expect(map._container.querySelector('[role="status"]')).toBeNull()
    // Watchers are gone: a store change no longer touches the map.
    const source = map._sources.get('sea-vessels')!
    const pushes = source.setData.mock.calls.length
    store.vessels = []
    await nextTick()
    expect(source.setData.mock.calls.length).toBe(pushes)
    vi.advanceTimersByTime(SEA_MOVE_FETCH_DEBOUNCE_MS * 2)
  })

  it('can be removed before any move has been made', () => {
    const { control, map } = addControl()
    control.onRemove()
    expect(map._handlerCount('moveend')).toBe(0)
  })

  it('guards its map calls before the layers exist', () => {
    const control = new AisVesselsControl(store) as unknown as Record<string, () => void>
    for (const method of [
      '_pushFeatures',
      '_applyVisibility',
      '_applySelection',
      '_renderLabels',
      '_renderA11y',
    ]) {
      expect(() => control[method]!()).not.toThrow()
    }
    ;(control as unknown as { _renderTrack: (samples: unknown[]) => void })._renderTrack([])
    ;(control as unknown as { _interpolate: () => void })._interpolate()
  })
})

describe('dead reckoning helpers', () => {
  it('only moving vessels with a course are advanced', () => {
    expect(isMoving(vessel({ sog: 5, cog: 10 }))).toBe(true)
    expect(isMoving(vessel({ sog: 0.2, cog: 10 }))).toBe(false)
    expect(isMoving(vessel({ sog: null, cog: 10 }))).toBe(false)
    expect(isMoving(vessel({ sog: 5, cog: null }))).toBe(false)
  })

  it('projects along the course and caps the elapsed time', () => {
    const now = Date.now()
    const still = vessel({ sog: 0 })
    expect(deadReckon(still, now)).toEqual([1, 51])
    const east = vessel({ sog: 60, cog: 90, lastPositionMs: now - 60_000 }) // 1 NM east
    const [lon, lat] = deadReckon(east, now)
    expect(lat).toBeCloseTo(51, 6)
    expect((lon - 1) * 111_320 * Math.cos((51 * Math.PI) / 180)).toBeCloseTo(1852, -1)
    const north = vessel({ sog: 60, cog: 0, lastPositionMs: now - 60_000 })
    expect(deadReckon(north, now)[1]).toBeGreaterThan(51)
    // Ten minutes is the most a stale fix is projected, however old it is.
    const capped = deadReckon(vessel({ sog: 60, cog: 0, lastPositionMs: now - 3_600_000 }), now)
    const tenMinutes = deadReckon(vessel({ sog: 60, cog: 0, lastPositionMs: now - 600_000 }), now)
    expect(capped).toEqual(tenMinutes)
    // A fix from the future is not projected backwards.
    expect(deadReckon(vessel({ sog: 60, cog: 0, lastPositionMs: now + 60_000 }), now)).toEqual([
      1, 51,
    ])
    // Latitude is clamped at the poles.
    expect(
      deadReckon(vessel({ lat: 89.9999, sog: 100, cog: 0, lastPositionMs: now - 600_000 }), now)[1],
    ).toBe(90)
  })

  it('wraps longitudes into range', () => {
    expect(wrapLongitude(181)).toBe(-179)
    expect(wrapLongitude(-181)).toBe(179)
    expect(wrapLongitude(540)).toBe(180)
    expect(wrapLongitude(0)).toBe(0)
  })
})
