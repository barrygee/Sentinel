import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { AirMultiPlaybackControl } from './AirMultiPlaybackControl'
import type { AdsbLiveControl } from './AdsbLiveControl'
import type { PlaybackAircraft, MultiSnapshot } from '@/stores/playback'

const TRAIL_LAYERS = ['adsb-bracket', 'adsb-hit', 'adsb-icons']

interface FakeMap {
  map: MapLibreGlMap
  sourceData: Record<string, GeoJSON.FeatureCollection>
  setFilter: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
}

// Fake map whose getSource returns a recording setData per id, and whose layers
// (the isolate-filter targets) all report present.
function fakeMap(): FakeMap {
  const sourceData: Record<string, GeoJSON.FeatureCollection> = {}
  const setFilter = vi.fn()
  const setLayoutProperty = vi.fn()
  const map = {
    getSource: (id: string) => ({
      setData: (data: GeoJSON.FeatureCollection) => {
        sourceData[id] = data
      },
    }),
    getLayer: (id: string) => (TRAIL_LAYERS.includes(id) ? { id } : undefined),
    setFilter,
    setLayoutProperty,
  } as unknown as MapLibreGlMap
  return { map, sourceData, setFilter, setLayoutProperty }
}

// Variant whose getLayer always reports absent, to exercise the layer-guard
// false arms in both the isolate and non-isolate paths.
function fakeMapNoLayers(): FakeMap {
  const base = fakeMap()
  ;(base.map as unknown as { getLayer: () => undefined }).getLayer = () => undefined
  return base
}

interface FakeAdsb {
  control: AdsbLiveControl
  pauseLive: ReturnType<typeof vi.fn>
  resumeLive: ReturnType<typeof vi.fn>
  setPlaybackFeatures: ReturnType<typeof vi.fn>
}

function fakeAdsb(
  overrides: Partial<{
    trailHex: string | null
    selectedHex: string | null
    isolatedHex: string | null
  }> = {},
): FakeAdsb {
  const pauseLive = vi.fn()
  const resumeLive = vi.fn()
  const setPlaybackFeatures = vi.fn()
  const control = {
    pauseLive,
    resumeLive,
    setPlaybackFeatures,
    _onPlaybackSelectionChange: null,
    _trailHex: overrides.trailHex ?? null,
    _selectedHex: overrides.selectedHex ?? null,
    _isolatedHex: overrides.isolatedHex ?? null,
  } as unknown as AdsbLiveControl
  return { control, pauseLive, resumeLive, setPlaybackFeatures }
}

function snapshot(overrides: Partial<MultiSnapshot> & Pick<MultiSnapshot, 'ts'>): MultiSnapshot {
  return {
    lat: 51,
    lon: -1,
    alt_baro: 5000,
    gs: 200,
    track: null,
    baro_rate: null,
    squawk: null,
    ...overrides,
  }
}

function airborneAircraft(overrides: Partial<PlaybackAircraft> = {}): PlaybackAircraft {
  return {
    hex: 'AC1',
    registration: 'G-AC1',
    callsign: 'TEST1',
    type_code: 'A320',
    snapshots: [snapshot({ ts: 1000 }), snapshot({ ts: 2000 }), snapshot({ ts: 3000 })],
    ...overrides,
  }
}

let map: FakeMap

beforeEach(() => {
  map = fakeMap()
})

describe('AirMultiPlaybackControl constructor', () => {
  it('pauses live updates and registers a selection-change re-render hook', () => {
    const adsb = fakeAdsb()
    const control = new AirMultiPlaybackControl(map.map, adsb.control)
    expect(adsb.pauseLive).toHaveBeenCalledOnce()

    // Prime a render, then fire the hook to prove it re-renders the last frame.
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    const renderSpy = vi.spyOn(control, 'renderAtTime')
    ;(adsb.control._onPlaybackSelectionChange as () => void)()
    expect(renderSpy).toHaveBeenCalledWith(2500, expect.any(Object))
  })
})

describe('AirMultiPlaybackControl.renderAtTime', () => {
  it('renders an airborne aircraft into the live source and forwards features', () => {
    const adsb = fakeAdsb()
    const control = new AirMultiPlaybackControl(map.map, adsb.control)

    control.renderAtTime(2500, { AC1: airborneAircraft() })

    expect(map.sourceData['adsb-live']!.features).toHaveLength(1)
    expect(adsb.setPlaybackFeatures).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'Feature' })]),
    )
  })

  it('skips aircraft with no snapshots', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    control.renderAtTime(2500, { AC1: airborneAircraft({ snapshots: [] }) })
    expect(map.sourceData['adsb-live']!.features).toHaveLength(0)
  })

  it('skips aircraft that were never airborne', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    const grounded = airborneAircraft({
      snapshots: [
        snapshot({ ts: 1000, alt_baro: 0, gs: 0 }),
        snapshot({ ts: 2000, alt_baro: 50, gs: 10 }),
      ],
    })
    control.renderAtTime(1500, { AC1: grounded })
    expect(map.sourceData['adsb-live']!.features).toHaveLength(0)
  })

  it('skips an aircraft when the cursor is before its first snapshot', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    control.renderAtTime(500, { AC1: airborneAircraft() }) // before ts 1000
    expect(map.sourceData['adsb-live']!.features).toHaveLength(0)
  })

  it('skips an aircraft when the cursor is past its last snapshot', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    control.renderAtTime(5000, { AC1: airborneAircraft() }) // after ts 3000
    expect(map.sourceData['adsb-live']!.features).toHaveLength(0)
  })

  it('dead-reckons the position forward when the snapshot has track and ground speed', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    const moving = airborneAircraft({
      snapshots: [
        snapshot({ ts: 2000, track: 90, gs: 400 }),
        snapshot({ ts: 4000, track: 90, gs: 400 }),
      ],
    })
    control.renderAtTime(3000, { AC1: moving }) // 1s past the ts-2000 snapshot
    const coords = (map.sourceData['adsb-live']!.features[0]!.geometry as GeoJSON.Point).coordinates
    // Heading east at 400 kt for 1s moves the longitude measurably off -1.
    expect(coords[0]).not.toBe(-1)
  })

  it('uses the raw snapshot position when there is no track to project along', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    control.renderAtTime(2500, { AC1: airborneAircraft() }) // snapshots have no track
    const coords = (map.sourceData['adsb-live']!.features[0]!.geometry as GeoJSON.Point).coordinates
    expect(coords).toEqual([-1, 51])
  })

  it('builds trail dots and a trail line for the followed aircraft', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ trailHex: 'AC1' }).control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(map.sourceData['adsb-trails-source']!.features.length).toBeGreaterThan(1)
    expect(map.sourceData['adsb-trail-line-source']!.features).toHaveLength(1)
  })

  it('falls back to the selected aircraft when no explicit trail hex is set', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ selectedHex: 'AC1' }).control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(map.sourceData['adsb-trails-source']!.features.length).toBeGreaterThan(0)
  })

  it('leaves trail sources empty when the aircraft is not the followed one', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ trailHex: 'OTHER' }).control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(map.sourceData['adsb-trails-source']!.features).toHaveLength(0)
  })

  it('applies an isolate filter to the bracket/hit/icon layers when an aircraft is isolated', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ isolatedHex: 'AC1' }).control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(map.setFilter).toHaveBeenCalledWith('adsb-bracket', expect.anything())
    expect(map.setFilter).toHaveBeenCalledWith('adsb-icons', expect.anything())
    expect(map.setLayoutProperty).toHaveBeenCalledWith('adsb-icons', 'visibility', 'visible')
  })

  it('clears the hit-layer filter when nothing is isolated', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(map.setFilter).toHaveBeenCalledWith('adsb-hit', null)
  })

  it('skips the hit-layer filter when the layer is absent and nothing is isolated', () => {
    const noLayers = fakeMapNoLayers()
    const control = new AirMultiPlaybackControl(noLayers.map, fakeAdsb().control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(noLayers.setFilter).not.toHaveBeenCalled()
  })

  it('skips the isolate filters when the bracket/hit/icon layers are absent', () => {
    const noLayers = fakeMapNoLayers()
    const control = new AirMultiPlaybackControl(
      noLayers.map,
      fakeAdsb({ isolatedHex: 'AC1' }).control,
    )
    control.renderAtTime(2500, { AC1: airborneAircraft() })
    expect(noLayers.setFilter).not.toHaveBeenCalled()
    expect(noLayers.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('applies fallback feature properties for missing fields and a blank hex', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb().control)
    const aircraft = airborneAircraft({
      hex: '', // forces the registration fallback
      registration: 'G-FALLBACK',
      snapshots: [
        snapshot({ ts: 1000, alt_baro: 5000, gs: 200 }), // makes it ever-airborne
        snapshot({
          ts: 2000,
          alt_baro: null,
          gs: null,
          track: null,
          baro_rate: null,
          squawk: null,
        }),
      ],
    })
    control.renderAtTime(2000, { AC1: aircraft }) // renders the all-null snapshot
    const props = map.sourceData['adsb-live']!.features[0]!.properties!
    expect(props.hex).toBe('G-FALLBACK')
    expect(props.alt_baro).toBe(0)
    expect(props.gs).toBe(0)
    expect(props.track).toBe(0)
    expect(props.squawk).toBe('')
  })

  it('defaults a trail dot altitude to zero when the snapshot has none', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ trailHex: 'AC1' }).control)
    const aircraft = airborneAircraft({
      snapshots: [
        snapshot({ ts: 1000, alt_baro: 5000 }), // keeps it ever-airborne
        snapshot({ ts: 2000, alt_baro: null }), // trail dot with no altitude
      ],
    })
    control.renderAtTime(2000, { AC1: aircraft })
    const trailDots = map.sourceData['adsb-trails-source']!.features
    const lastDot = trailDots[trailDots.length - 1]!
    expect(lastDot.properties!.alt).toBe(0)
  })

  it('renders a single-snapshot trail with no connecting line', () => {
    const control = new AirMultiPlaybackControl(map.map, fakeAdsb({ trailHex: 'AC1' }).control)
    const aircraft = airborneAircraft({ snapshots: [snapshot({ ts: 1000, alt_baro: 5000 })] })
    control.renderAtTime(1000, { AC1: aircraft })
    expect(map.sourceData['adsb-trails-source']!.features).toHaveLength(1)
    // A line needs at least two points — a single dot produces none.
    expect(map.sourceData['adsb-trail-line-source']!.features).toHaveLength(0)
  })
})

describe('AirMultiPlaybackControl.destroy', () => {
  it('clears the hook, empties the sources, and resumes live updates', () => {
    const adsb = fakeAdsb()
    const control = new AirMultiPlaybackControl(map.map, adsb.control)
    control.renderAtTime(2500, { AC1: airborneAircraft() })

    control.destroy()

    expect(adsb.control._onPlaybackSelectionChange).toBeNull()
    expect(map.sourceData['adsb-live']!.features).toHaveLength(0)
    expect(map.sourceData['adsb-trails-source']!.features).toHaveLength(0)
    expect(map.sourceData['adsb-trail-line-source']!.features).toHaveLength(0)
    expect(adsb.resumeLive).toHaveBeenCalledOnce()
  })
})
