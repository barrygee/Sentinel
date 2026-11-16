import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import { altitudeColour } from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'
import type { SilhouettePalette } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import type { AircraftIconStyle } from '../../stores/air'
import { AircraftTrails, TRAIL_LAYER_IDS, type AircraftTrailsHost } from './AircraftTrails'
import { trailLineGradient } from './trailLineGradient'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'

// Literal colours (not the constants the code reads) so a swapped branch fails.
const EMERGENCY_RED = '#ff2222'
const MILITARY_GREEN = '#c8ff00'
const ARROW_CIVIL_BLUE = '#00aaff'
const SILHOUETTE_CIVIL_DARK = '#8f949a'
const SILHOUETTE_CIVIL_LIGHT = '#4b5057'
const SILHOUETTE_PLAIN_DARK = '#d9dcdf'

const LINE_LAYER = 'adsb-trail-line'
const DOTS_LAYER = 'adsb-trail-dots'
const LINE_SOURCE = 'adsb-trail-line-source'
const DOTS_SOURCE = 'adsb-trails-source'

// ---- Fixtures ----

function aircraftFeature(overrides: Partial<AircraftProperties> = {}): AircraftGeoFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-1, 51] },
    properties: {
      hex: 'abc123',
      flight: 'BAW123',
      r: 'G-EUUA',
      t: 'a320',
      alt_baro: 30000,
      alt_geom: null,
      gs: 400,
      ias: null,
      mach: null,
      track: 90,
      baro_rate: 0,
      nav_altitude: null,
      nav_heading: null,
      category: 'A3',
      emergency: '',
      squawk: '1000',
      squawkEmerg: 0,
      rssi: null,
      military: false,
      stale: 0,
      silhouetteImage: '',
      silhouetteRadiusPx: 0,
      silhouetteRotates: 0,
      ...overrides,
    },
  }
}

interface FakeSource {
  setData: ReturnType<typeof vi.fn>
}

/** A map recording what the trail does to it; layers/sources exist only once added (or seeded). */
function createFakeMap() {
  const layers = new Set<string>()
  const sources = new Map<string, FakeSource>()
  const map = {
    layers,
    sources,
    addSource: vi.fn((id: string, spec: unknown) => {
      sources.set(id, { setData: vi.fn() })
      return spec
    }),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id)
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    getSource: vi.fn((id: string) => sources.get(id)),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  }
  return map
}
type FakeMap = ReturnType<typeof createFakeMap>

function seedLayersAndSources(map: FakeMap): void {
  map.layers.add(LINE_LAYER)
  map.layers.add(DOTS_LAYER)
  map.sources.set(LINE_SOURCE, { setData: vi.fn() })
  map.sources.set(DOTS_SOURCE, { setData: vi.fn() })
}

function createHost(map: FakeMap | undefined) {
  const state = {
    map: map as unknown as maplibregl.Map | undefined,
    features: [] as AircraftGeoFeature[],
    selectedHex: null as string | null,
    interpolated: {} as Record<string, [number, number]>,
    iconStyle: 'arrow' as AircraftIconStyle,
    altitudeColouring: false,
    palette: 'dark' as SilhouettePalette,
  }
  const host: AircraftTrailsHost = {
    getMap: () => state.map,
    features: () => state.features,
    selectedHex: () => state.selectedHex,
    interpolatedCoords: (hex) => state.interpolated[hex] ?? null,
    iconStyle: () => state.iconStyle,
    altitudeColouring: () => state.altitudeColouring,
    silhouettePalette: () => state.palette,
  }
  return { host, state }
}

/** The last GeoJSON a source was given. */
function lastData(map: FakeMap, sourceId: string): GeoJSON.FeatureCollection {
  const calls = map.sources.get(sourceId)!.setData.mock.calls
  return calls[calls.length - 1]![0] as GeoJSON.FeatureCollection
}

let map: FakeMap
let state: ReturnType<typeof createHost>['state']
let trails: AircraftTrails

beforeEach(() => {
  map = createFakeMap()
  const created = createHost(map)
  state = created.state
  trails = new AircraftTrails(created.host)
})

// ---- record / forget ----

describe('record', () => {
  it('starts a history for a new aircraft', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 300 })
    expect(trails.points['abc123']).toEqual([{ lon: 1, lat: 2, alt: 300 }])
  })

  it('appends a moved position, oldest first', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 300 })
    trails.record('abc123', { lon: 1.1, lat: 2, alt: 400 })
    expect(trails.points['abc123']!.map((point) => point.lon)).toEqual([1, 1.1])
  })

  it('skips a position identical to the last one', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 300 })
    trails.record('abc123', { lon: 1, lat: 2, alt: 999 })
    expect(trails.points['abc123']).toHaveLength(1)
  })

  it('keeps a position that only changed latitude', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 300 })
    trails.record('abc123', { lon: 1, lat: 2.5, alt: 300 })
    expect(trails.points['abc123']).toHaveLength(2)
  })

  it('keeps a position seen before when it is not the last one', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 0 })
    trails.record('abc123', { lon: 3, lat: 4, alt: 0 })
    trails.record('abc123', { lon: 1, lat: 2, alt: 0 })
    expect(trails.points['abc123']).toHaveLength(3)
  })

  it('drops the oldest once past maxPoints, and keeps exactly maxPoints', () => {
    trails.maxPoints = 3
    for (let index = 0; index < 5; index++) trails.record('abc123', { lon: index, lat: 0, alt: 0 })
    expect(trails.points['abc123']!.map((point) => point.lon)).toEqual([2, 3, 4])
  })

  it('keeps 100 positions by default', () => {
    for (let index = 0; index < 101; index++)
      trails.record('abc123', { lon: index, lat: 0, alt: 0 })
    expect(trails.points['abc123']).toHaveLength(100)
    expect(trails.points['abc123']![0]!.lon).toBe(1)
  })

  it('keeps each aircraft separate', () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 0 })
    trails.record('def456', { lon: 1, lat: 2, alt: 0 })
    expect(Object.keys(trails.points)).toEqual(['abc123', 'def456'])
  })
})

describe('forget', () => {
  it("drops only that aircraft's history", () => {
    trails.record('abc123', { lon: 1, lat: 2, alt: 0 })
    trails.record('def456', { lon: 1, lat: 2, alt: 0 })
    trails.forget('abc123')
    expect(trails.points).toEqual({ def456: [{ lon: 1, lat: 2, alt: 0 }] })
  })

  it('is harmless for an unknown aircraft', () => {
    expect(() => trails.forget('nobody')).not.toThrow()
  })
})

// ---- addLayers ----

describe('addLayers', () => {
  it('adds an empty dots source, a line source with line metrics, then both layers hidden', () => {
    trails.addLayers(map as unknown as maplibregl.Map)
    expect(map.addSource).toHaveBeenNthCalledWith(1, DOTS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    expect(map.addSource).toHaveBeenNthCalledWith(2, LINE_SOURCE, {
      type: 'geojson',
      lineMetrics: true,
      data: { type: 'FeatureCollection', features: [] },
    })
    const [lineLayer] = map.addLayer.mock.calls[0]!
    const [dotsLayer] = map.addLayer.mock.calls[1]!
    expect(lineLayer).toMatchObject({
      id: LINE_LAYER,
      type: 'line',
      source: LINE_SOURCE,
      layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-width': 4, 'line-opacity': 0.75 },
    })
    expect(dotsLayer).toMatchObject({
      id: DOTS_LAYER,
      type: 'circle',
      source: DOTS_SOURCE,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 2.5,
        'circle-opacity': ['get', 'opacity'],
        'circle-stroke-width': 0,
        'circle-color': ['get', 'colour'],
      },
    })
  })

  it('carries the current line over a style reload, but starts the dots empty', () => {
    state.interpolated['abc123'] = [3, 3]
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.hex = 'abc123'
    trails.rebuild()
    trails.addLayers(map as unknown as maplibregl.Map)
    const dotsData = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection }
    const lineData = map.addSource.mock.calls[1]![1] as { data: GeoJSON.FeatureCollection }
    expect(dotsData.data.features).toEqual([])
    expect(lineData.data.features).toHaveLength(1)
  })

  it('names the layers TRAIL_LAYER_IDS lists, line beneath dots', () => {
    expect(TRAIL_LAYER_IDS).toEqual([LINE_LAYER, DOTS_LAYER])
  })
})

// ---- setVisibility / hasShownAircraft ----

describe('setVisibility', () => {
  it('shows both layers', () => {
    seedLayersAndSources(map)
    trails.setVisibility(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_LAYER, 'visibility', 'visible')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(DOTS_LAYER, 'visibility', 'visible')
  })

  it('hides both layers', () => {
    seedLayersAndSources(map)
    trails.setVisibility(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_LAYER, 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(DOTS_LAYER, 'visibility', 'none')
  })

  it('skips a layer the map does not have', () => {
    map.layers.add(DOTS_LAYER)
    trails.setVisibility(true)
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(1)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(DOTS_LAYER, 'visibility', 'visible')
  })
})

describe('hasShownAircraft', () => {
  it('is false with nothing asked for or selected', () => {
    expect(trails.hasShownAircraft()).toBe(false)
  })

  it('is true for an asked-for aircraft', () => {
    trails.hex = 'abc123'
    expect(trails.hasShownAircraft()).toBe(true)
  })

  it('falls back to the selected aircraft', () => {
    state.selectedHex = 'abc123'
    expect(trails.hasShownAircraft()).toBe(true)
  })
})

// ---- colour ----

describe('colour', () => {
  it('is red for an emergency, whatever else applies', () => {
    state.altitudeColouring = true
    expect(trails.colour(30000, 1, 1)).toBe(EMERGENCY_RED)
  })

  it("takes the altitude's colour in the current palette when altitude colouring is on", () => {
    state.altitudeColouring = true
    state.palette = 'light'
    expect(trails.colour(30000, 0, 1)).toBe(altitudeColour(30000, 'light'))
    expect(trails.colour(30000, 0, 1)).not.toBe(altitudeColour(30000, 'dark'))
  })

  it('ignores altitude colouring with no altitude to go on (0 ft)', () => {
    state.altitudeColouring = true
    expect(trails.colour(0, 0, 1)).toBe(MILITARY_GREEN)
  })

  it('is military green for a military aircraft without altitude colouring', () => {
    expect(trails.colour(30000, 0, 1)).toBe(MILITARY_GREEN)
  })

  it('is arrow blue for a civil aircraft in arrow mode', () => {
    expect(trails.colour(30000, 0, 0)).toBe(ARROW_CIVIL_BLUE)
  })

  it("is the palette's plain colour for a civil silhouette without altitude colouring", () => {
    state.iconStyle = 'silhouette'
    expect(trails.colour(30000, 0, 0)).toBe(SILHOUETTE_PLAIN_DARK)
  })

  it("is the palette's civil grey for a civil silhouette at 0 ft with altitude colouring on", () => {
    state.iconStyle = 'silhouette'
    state.altitudeColouring = true
    expect(trails.colour(0, 0, 0)).toBe(SILHOUETTE_CIVIL_DARK)
    state.palette = 'light'
    expect(trails.colour(0, 0, 0)).toBe(SILHOUETTE_CIVIL_LIGHT)
  })
})

// ---- rebuild ----

describe('rebuild', () => {
  beforeEach(() => seedLayersAndSources(map))

  it('does nothing before the control is on a map', () => {
    state.map = undefined
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    state.interpolated['abc123'] = [2, 2]
    expect(() => trails.rebuild()).not.toThrow()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    // Nothing was built either: the line a later style load carries is still empty.
    trails.addLayers(map as unknown as maplibregl.Map)
    const lineData = map.addSource.mock.calls[1]![1] as { data: GeoJSON.FeatureCollection }
    expect(lineData.data.features).toEqual([])
  })

  it('hides the layers and empties both sources when no aircraft is shown', () => {
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_LAYER, 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(DOTS_LAYER, 'visibility', 'none')
    expect(lastData(map, DOTS_SOURCE).features).toEqual([])
    expect(lastData(map, LINE_SOURCE).features).toEqual([])
    expect(map.setPaintProperty).not.toHaveBeenCalled()
  })

  it('hides the layers when the shown aircraft has no history', () => {
    trails.hex = 'abc123'
    trails.rebuild()
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_LAYER, 'visibility', 'none')
  })

  it('draws one dot per position, fading in from oldest to newest', () => {
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 100 })
    trails.record('abc123', { lon: 2, lat: 1, alt: 200 })
    trails.record('abc123', { lon: 3, lat: 1, alt: 300 })
    trails.rebuild()
    const dots = lastData(map, DOTS_SOURCE).features
    expect(dots.map((dot) => (dot.geometry as GeoJSON.Point).coordinates)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
    expect(dots.map((dot) => dot.properties!.opacity)).toEqual([1 / 3, 2 / 3, 1])
    expect(dots.map((dot) => dot.properties!.alt)).toEqual([100, 200, 300])
    expect(dots[0]!.properties).toMatchObject({
      colour: ARROW_CIVIL_BLUE,
      emerg: 0,
      military: 0,
      hex: 'abc123',
    })
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_LAYER, 'visibility', 'visible')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(DOTS_LAYER, 'visibility', 'visible')
  })

  it('shows the selected aircraft when none is asked for', () => {
    state.selectedHex = 'sel1'
    trails.record('sel1', { lon: 1, lat: 1, alt: 0 })
    trails.record('other', { lon: 5, lat: 5, alt: 0 })
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties!.hex).toBe('sel1')
  })

  it('prefers the asked-for aircraft over the selection', () => {
    state.selectedHex = 'sel1'
    trails.hex = 'hover1'
    trails.record('sel1', { lon: 1, lat: 1, alt: 0 })
    trails.record('hover1', { lon: 5, lat: 5, alt: 0 })
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties!.hex).toBe('hover1')
  })

  it('runs the line on to the interpolated position, with a gradient ending in the last report colour', () => {
    state.altitudeColouring = true
    state.interpolated['abc123'] = [3, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 1000 })
    trails.record('abc123', { lon: 2, lat: 1, alt: 30000 })
    trails.rebuild()
    const line = lastData(map, LINE_SOURCE).features
    expect(line).toHaveLength(1)
    expect((line[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
    expect(line[0]!.properties).toEqual({ emerg: 0, military: 0, hex: 'abc123' })
    const lowColour = altitudeColour(1000, 'dark')
    const highColour = altitudeColour(30000, 'dark')
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LINE_LAYER,
      'line-gradient',
      trailLineGradient([
        { lon: 1, lat: 1, colour: lowColour },
        { lon: 2, lat: 1, colour: highColour },
        { lon: 3, lat: 1, colour: highColour },
      ]),
    )
  })

  it('draws no line for a single position with no interpolated position', () => {
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(lastData(map, LINE_SOURCE).features).toEqual([])
    expect(lastData(map, DOTS_SOURCE).features).toHaveLength(1)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
  })

  it('draws a line from one position to a different interpolated position', () => {
    state.interpolated['abc123'] = [2, 2]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(lastData(map, LINE_SOURCE).features).toHaveLength(1)
  })

  it('drops an interpolated position identical to the last report (no zero-length segment)', () => {
    state.interpolated['abc123'] = [1, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(lastData(map, LINE_SOURCE).features).toEqual([])
  })

  it('keeps a vertex that shares only its longitude or only its latitude with the one before', () => {
    state.interpolated['abc123'] = [2, 2]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.record('abc123', { lon: 1, lat: 2, alt: 0 })
    trails.rebuild()
    expect(
      (lastData(map, LINE_SOURCE).features[0]!.geometry as GeoJSON.LineString).coordinates,
    ).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
    ])
  })

  it('marks and colours an emergency squawk', () => {
    state.features = [aircraftFeature({ squawkEmerg: 1 })]
    state.interpolated['abc123'] = [2, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 30000 })
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties).toMatchObject({
      emerg: 1,
      colour: EMERGENCY_RED,
    })
    expect(lastData(map, LINE_SOURCE).features[0]!.properties!.emerg).toBe(1)
  })

  it('marks a declared emergency, but not one reading "none"', () => {
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    state.features = [aircraftFeature({ emergency: 'general' })]
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties!.emerg).toBe(1)
    state.features = [aircraftFeature({ emergency: 'none' })]
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties!.emerg).toBe(0)
  })

  it('marks and colours a military aircraft', () => {
    state.features = [aircraftFeature({ military: true })]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties).toMatchObject({
      military: 1,
      colour: MILITARY_GREEN,
    })
  })

  it("reads the shown aircraft's state, not another's", () => {
    state.features = [aircraftFeature({ hex: 'other', military: true, squawkEmerg: 1 })]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(lastData(map, DOTS_SOURCE).features[0]!.properties).toMatchObject({
      emerg: 0,
      military: 0,
    })
  })

  it('skips layers and sources the map does not have', () => {
    const bareMap = createFakeMap()
    state.map = bareMap as unknown as maplibregl.Map
    state.interpolated['abc123'] = [2, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    expect(bareMap.setLayoutProperty).not.toHaveBeenCalled()
    expect(bareMap.setPaintProperty).not.toHaveBeenCalled()
  })

  it('swallows a map error while setting visibility and still updates the sources', () => {
    map.setLayoutProperty.mockImplementation(() => {
      throw new Error('style not loaded')
    })
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    expect(() => trails.rebuild()).not.toThrow()
    expect(lastData(map, DOTS_SOURCE).features).toHaveLength(1)
  })

  it('swallows a map error while updating the sources', () => {
    map.sources.get(DOTS_SOURCE)!.setData.mockImplementation(() => {
      throw new Error('source gone')
    })
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    expect(() => trails.rebuild()).not.toThrow()
  })
})

// ---- refreshLineHead ----

describe('refreshLineHead', () => {
  beforeEach(() => {
    seedLayersAndSources(map)
    state.interpolated['abc123'] = [2, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    map.sources.get(LINE_SOURCE)!.setData.mockClear()
    map.sources.get(DOTS_SOURCE)!.setData.mockClear()
  })

  it('moves the line end to where the aircraft is drawn now, touching only the line source', () => {
    state.interpolated['abc123'] = [2.5, 1]
    trails.refreshLineHead()
    expect(
      (lastData(map, LINE_SOURCE).features[0]!.geometry as GeoJSON.LineString).coordinates,
    ).toEqual([
      [1, 1],
      [2.5, 1],
    ])
    expect(map.sources.get(DOTS_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('does nothing with no aircraft shown', () => {
    trails.hex = null
    trails.refreshLineHead()
    expect(map.sources.get(LINE_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('does nothing when the drawn line belongs to another aircraft', () => {
    trails.hex = 'def456'
    trails.record('def456', { lon: 9, lat: 9, alt: 0 })
    state.interpolated['def456'] = [10, 10]
    trails.refreshLineHead()
    expect(map.sources.get(LINE_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('does nothing once the aircraft history is gone', () => {
    trails.forget('abc123')
    trails.refreshLineHead()
    expect(map.sources.get(LINE_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('does nothing when no line is drawn', () => {
    trails.hex = 'solo'
    trails.record('solo', { lon: 5, lat: 5, alt: 0 })
    trails.rebuild()
    map.sources.get(LINE_SOURCE)!.setData.mockClear()
    trails.refreshLineHead()
    expect(map.sources.get(LINE_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('leaves the line as it is when the aircraft is drawn back on its last report', () => {
    state.interpolated['abc123'] = [1, 1]
    trails.refreshLineHead()
    expect(map.sources.get(LINE_SOURCE)!.setData).not.toHaveBeenCalled()
  })

  it('swallows a missing map or a map error', () => {
    state.interpolated['abc123'] = [3, 1]
    map.sources.get(LINE_SOURCE)!.setData.mockImplementation(() => {
      throw new Error('source gone')
    })
    expect(() => trails.refreshLineHead()).not.toThrow()
    state.map = undefined
    expect(() => trails.refreshLineHead()).not.toThrow()
  })
})

// ---- clear ----

describe('clear', () => {
  it('forgets every history and the asked-for aircraft, and empties both sources', () => {
    seedLayersAndSources(map)
    state.interpolated['abc123'] = [2, 1]
    trails.hex = 'abc123'
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.rebuild()
    trails.clear()
    expect(trails.points).toEqual({})
    expect(trails.hex).toBeNull()
    expect(lastData(map, DOTS_SOURCE).features).toEqual([])
    expect(lastData(map, LINE_SOURCE).features).toEqual([])
  })

  it('forgets everything even with no map, and does not throw', () => {
    state.map = undefined
    trails.record('abc123', { lon: 1, lat: 1, alt: 0 })
    trails.hex = 'abc123'
    expect(() => trails.clear()).not.toThrow()
    expect(trails.points).toEqual({})
    expect(trails.hex).toBeNull()
  })

  it('skips sources the map does not have', () => {
    expect(() => trails.clear()).not.toThrow()
  })

  it('still empties the line source when emptying the dots fails', () => {
    seedLayersAndSources(map)
    map.sources.get(DOTS_SOURCE)!.setData.mockImplementation(() => {
      throw new Error('source gone')
    })
    trails.clear()
    expect(map.sources.get(LINE_SOURCE)!.setData).toHaveBeenCalledTimes(1)
  })

  it('swallows an error emptying the line source', () => {
    seedLayersAndSources(map)
    map.sources.get(LINE_SOURCE)!.setData.mockImplementation(() => {
      throw new Error('source gone')
    })
    expect(() => trails.clear()).not.toThrow()
  })
})
