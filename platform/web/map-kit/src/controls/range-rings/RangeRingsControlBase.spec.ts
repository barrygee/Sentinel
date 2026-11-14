import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { RangeRingsControlBase } from './RangeRingsControlBase'
import { buildRingTopsGeoJSON } from '../../utils/rangeRings'
import type { ResolvedRingOrigin } from '../../composables/useRangeRingOrigin'

const LAYER = 'test-rings'
const ORIGIN_LAYER = `${LAYER}-origin`
const ORIGIN_DOT_LAYER = `${LAYER}-origin-dot`
const LABEL_LAYER = `${LAYER}-label`
const DISTANCE_LAYER = `${LAYER}-distances`
const DOTS_SOURCE = `${LAYER}-dots`

/** The on-screen gap between ring dots the control promises. */
const DOT_SPACING_PX = 7

/** The smallest concrete control: a fixed layer id and a recorded toggle. */
class TestRangeRingsControl extends RangeRingsControlBase {
  readonly persisted: boolean[] = []

  protected get layerId(): string {
    return LAYER
  }

  protected persistVisible(visible: boolean): void {
    this.persisted.push(visible)
  }
}

interface FakeLayer {
  id: string
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

/**
 * A fake map with a flat projection: `pixelsPerDegree` screen pixels for each
 * degree of longitude and latitude, centred on 0,0, in a `width` × `height`
 * canvas. Flat on purpose, so a dot's screen position is easy to check.
 */
function makeFakeMap({ pixelsPerDegree = 100, width = 800, height = 600 } = {}) {
  const state = {
    pixelsPerDegree,
    moveEndHandlers: [] as (() => void)[],
    layers: new Map<string, FakeLayer>(),
    sources: new Map<string, { data?: unknown; setData: ReturnType<typeof vi.fn> }>(),
    visibility: {} as Record<string, string>,
    textField: {} as Record<string, unknown>,
    removedLayers: [] as string[],
    removedSources: [] as string[],
  }
  const map = {
    isStyleLoaded: () => true,
    once: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'moveend') state.moveEndHandlers.push(handler)
    }),
    off: vi.fn((event: string, handler: () => void) => {
      if (event === 'moveend') {
        state.moveEndHandlers = state.moveEndHandlers.filter((candidate) => candidate !== handler)
      }
    }),
    getCanvas: () => ({ clientWidth: width, clientHeight: height }),
    project: ([longitude, latitude]: [number, number]) => ({
      x: width / 2 + longitude * state.pixelsPerDegree,
      y: height / 2 - latitude * state.pixelsPerDegree,
    }),
    unproject: ([x, y]: [number, number]) => ({
      lng: state.pixelsPerDegree === 0 ? 0 : (x - width / 2) / state.pixelsPerDegree,
      lat: state.pixelsPerDegree === 0 ? 0 : (height / 2 - y) / state.pixelsPerDegree,
    }),
    getLayer: (id: string) => state.layers.get(id),
    removeLayer: (id: string) => {
      state.removedLayers.push(id)
      state.layers.delete(id)
    },
    getSource: (id: string) => state.sources.get(id),
    removeSource: (id: string) => {
      state.removedSources.push(id)
      state.sources.delete(id)
    },
    addSource: (id: string, source: { data: unknown }) =>
      state.sources.set(id, { data: source.data, setData: vi.fn() }),
    addLayer: (layer: FakeLayer) => {
      state.layers.set(layer.id, layer)
      state.visibility[layer.id] = (layer.layout?.visibility as string) ?? 'visible'
    },
    setLayoutProperty: (id: string, prop: string, value: unknown) => {
      if (prop === 'visibility') state.visibility[id] = value as string
      if (prop === 'text-field') state.textField[id] = value
    },
    _state: state,
  }
  return map
}

const asMap = (map: ReturnType<typeof makeFakeMap>) => map as unknown as MapLibreGlMap

function origin(overrides: Partial<ResolvedRingOrigin> = {}): ResolvedRingOrigin {
  return {
    longitude: -2,
    latitude: 54,
    label: 'SDR HOST ONE',
    kind: 'sdr-manager',
    degraded: false,
    ...overrides,
  }
}

function addedControl(
  initialOrigin: ResolvedRingOrigin | null = origin(),
  visible = true,
  mapOptions: Parameters<typeof makeFakeMap>[0] = {},
) {
  const control = new TestRangeRingsControl(visible, initialOrigin)
  const map = makeFakeMap(mapOptions)
  control.onAdd(asMap(map))
  return { control, map }
}

afterEach(() => {
  delete document.documentElement.dataset.mapTheme
})

describe('RangeRingsControlBase', () => {
  describe('setOrigin', () => {
    it('remembers an origin set before the control is on a map, without touching one', () => {
      const control = new TestRangeRingsControl(true, null)
      expect(() => control.setOrigin(origin())).not.toThrow()

      // The stored origin is what the rings are built from once added.
      const map = makeFakeMap()
      control.onAdd(asMap(map))
      expect(map._state.visibility[LAYER]).toBe('visible')
    })

    it('skips the rebuild when the origin has not moved', () => {
      const { control, map } = addedControl()
      control.setOrigin(origin())
      expect(map._state.sources.get(LAYER)!.setData).not.toHaveBeenCalled()
      expect(map._state.sources.get(ORIGIN_LAYER)!.setData).not.toHaveBeenCalled()
      expect(map._state.sources.get(DISTANCE_LAYER)!.setData).not.toHaveBeenCalled()
      expect(map._state.sources.get(DOTS_SOURCE)!.setData).not.toHaveBeenCalled()
    })

    it.each([
      ['longitude', { longitude: -3 }],
      ['latitude', { latitude: 55 }],
      ['label', { label: 'SDR HOST TWO' }],
      ['kind', { kind: 'user' as const }],
      ['degraded', { degraded: true }],
    ])('rebuilds when only the %s changes', (_field, change) => {
      const { control, map } = addedControl()
      control.setOrigin(origin(change))
      expect(map._state.sources.get(LAYER)!.setData).toHaveBeenCalledTimes(1)
      expect(map._state.sources.get(ORIGIN_LAYER)!.setData).toHaveBeenCalledTimes(1)
      expect(map._state.sources.get(DISTANCE_LAYER)!.setData).toHaveBeenCalledTimes(1)
      expect(map._state.sources.get(DOTS_SOURCE)!.setData).toHaveBeenCalledTimes(1)
    })

    it('moves the distance labels to the tops of the re-centred rings', () => {
      const { control, map } = addedControl()
      control.setOrigin(origin({ longitude: -3, latitude: 55 }))
      const [moved] = map._state.sources.get(DISTANCE_LAYER)!.setData.mock.calls[0]!
      expect(moved).toEqual(buildRingTopsGeoJSON(-3, 55))
    })

    it('clears the distance labels with the rings when the origin goes', () => {
      const { control, map } = addedControl()
      control.setOrigin(null)
      expect(map._state.sources.get(DISTANCE_LAYER)!.setData).toHaveBeenCalledWith({
        type: 'FeatureCollection',
        features: [],
      })
      expect(map._state.visibility[DISTANCE_LAYER]).toBe('none')
    })

    it('flags a stale position in the origin label, which no longer carries a distance', () => {
      const { control, map } = addedControl()
      control.setOrigin(origin({ degraded: true }))
      expect(map._state.textField[LABEL_LAYER]).toBe('SDR HOST ONE · OFFLINE')
    })
  })

  describe('ring distance labels', () => {
    it('labels each ring once, from its own source of ring-top points', () => {
      const { map } = addedControl()
      const layer = map._state.layers.get(DISTANCE_LAYER) as FakeLayer & { source: string }
      expect(layer.source).toBe(DISTANCE_LAYER)
      expect(map._state.sources.get(DISTANCE_LAYER)!.data).toEqual(buildRingTopsGeoJSON(-2, 54))
      expect(layer.layout).toMatchObject({
        'symbol-placement': 'point',
        'text-field': ['concat', ['to-string', ['get', 'dist']], ' NM'],
      })
    })

    it('sets the distance in small regular type', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(DISTANCE_LAYER)!.layout).toMatchObject({
        'text-font': ['Noto Sans Regular'],
        'text-size': 9,
      })
    })

    it('keeps the text upright and level at any zoom, pitch or bearing', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(DISTANCE_LAYER)!.layout).toMatchObject({
        'text-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
      })
    })

    it('sits clear above the top of the ring, never dropped by label collisions', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(DISTANCE_LAYER)!.layout).toMatchObject({
        'text-anchor': 'bottom',
        'text-offset': [0, -0.5],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      })
    })

    it('shows with the rings around your own position, where the origin marks stay hidden', () => {
      const { map } = addedControl(origin({ kind: 'user' }))
      expect(map._state.visibility[DISTANCE_LAYER]).toBe('visible')
      expect(map._state.visibility[LABEL_LAYER]).toBe('none')
    })

    it('hides with the rings when the operator toggles them off', () => {
      const { control, map } = addedControl()
      control.handleClickPublic()
      expect(map._state.visibility[LAYER]).toBe('none')
      expect(map._state.visibility[DISTANCE_LAYER]).toBe('none')
    })
  })

  describe('ring dots', () => {
    /** The dots placed for the current view, as screen positions in the fake projection. */
    function screenDots(map: ReturnType<typeof makeFakeMap>, call = -1) {
      const source = map._state.sources.get(DOTS_SOURCE)!
      const calls = source.setData.mock.calls
      const data = (
        call === -1 && calls.length === 0 ? source.data : calls.at(call)![0]
      ) as GeoJSON.FeatureCollection<GeoJSON.Point>
      return data.features.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates as [number, number]
        return map.project([longitude, latitude])
      })
    }

    /** Which ring a screen point is on, by its distance from the centre (equator origin). */
    function ringOf(point: { x: number; y: number }, pixelsPerDegree: number) {
      const radiusDegrees = Math.hypot(point.x - 400, point.y - 300) / pixelsPerDegree
      return Math.round((radiusDegrees * 60) / 50) * 50
    }

    it('draws the rings as round dots of a fixed screen size, from points of its own', () => {
      const { map } = addedControl()
      const ringLayer = map._state.layers.get(LAYER) as FakeLayer & { type: string; source: string }
      expect(ringLayer.type).toBe('circle')
      expect(ringLayer.source).toBe(DOTS_SOURCE)
      expect(ringLayer.paint).toMatchObject({
        'circle-radius': 1.125,
        'circle-pitch-alignment': 'viewport',
      })
    })

    it('spaces the dots evenly round each ring, carrying the gap across the ring’s vertices', () => {
      // Equator, 40 px a degree: every ring fits on screen (the 250 NM one is
      // about 330 px across), so consecutive dots on a ring are one spacing apart.
      const { map } = addedControl(origin({ longitude: 0, latitude: 0 }), true, {
        pixelsPerDegree: 40,
      })
      const dots = screenDots(map)
      const rings = new Map<number, { x: number; y: number }[]>()
      for (const dot of dots) {
        const ring = ringOf(dot, 40)
        rings.set(ring, [...(rings.get(ring) ?? []), dot])
      }
      expect([...rings.keys()]).toEqual([50, 100, 150, 200, 250])
      for (const ringDots of rings.values()) {
        for (let index = 1; index < ringDots.length; index++) {
          const gap = Math.hypot(
            ringDots[index]!.x - ringDots[index - 1]!.x,
            ringDots[index]!.y - ringDots[index - 1]!.y,
          )
          // Chords across a vertex are a hair shorter than the path; never longer.
          expect(gap).toBeGreaterThan(DOT_SPACING_PX - 0.05)
          expect(gap).toBeLessThanOrEqual(DOT_SPACING_PX + 1e-9)
        }
      }
    })

    it('places as many dots as each ring’s circumference holds', () => {
      const { map } = addedControl(origin({ longitude: 0, latitude: 0 }), true, {
        pixelsPerDegree: 40,
      })
      const circumference = (distanceNm: number) => 2 * Math.PI * (distanceNm / 60) * 40
      const expected = [50, 100, 150, 200, 250].reduce(
        (total, distanceNm) => total + circumference(distanceNm) / DOT_SPACING_PX,
        0,
      )
      // Within one dot a ring (the remainder of the last gap).
      expect(Math.abs(screenDots(map).length - expected)).toBeLessThanOrEqual(5)
    })

    it('keeps only the dots near the view when a ring runs far off screen', () => {
      // 400 px a degree: the 250 NM ring is about 10,000 px across.
      const { map } = addedControl(origin({ longitude: 0, latitude: 0 }), true, {
        pixelsPerDegree: 400,
      })
      const dots = screenDots(map)
      expect(dots.length).toBeGreaterThan(0)
      // The margin is half the canvas's longer side (400 px); a kept segment
      // may run past it by at most one ring segment.
      const segment = (2 * Math.PI * (250 / 60) * 400) / 720
      for (const dot of dots) {
        expect(dot.x).toBeGreaterThanOrEqual(-400 - segment)
        expect(dot.x).toBeLessThanOrEqual(800 + 400 + segment)
        expect(dot.y).toBeGreaterThanOrEqual(-400 - segment)
        expect(dot.y).toBeLessThanOrEqual(600 + 400 + segment)
      }
      const allRingsDots = [50, 100, 150, 200, 250].reduce(
        (total, distanceNm) => total + (2 * Math.PI * (distanceNm / 60) * 400) / DOT_SPACING_PX,
        0,
      )
      expect(dots.length).toBeLessThan(allRingsDots / 2)
    })

    it('puts a single dot on a ring too small to have length on screen', () => {
      const { map } = addedControl(origin({ longitude: 0, latitude: 0 }), true, {
        pixelsPerDegree: 0,
      })
      expect(screenDots(map)).toHaveLength(5)
    })

    it('re-places the dots each time the map stops moving', () => {
      const { map } = addedControl(origin({ longitude: 0, latitude: 0 }), true, {
        pixelsPerDegree: 20,
      })
      const before = screenDots(map).length
      expect(map.on).toHaveBeenCalledWith('moveend', expect.any(Function))

      map._state.pixelsPerDegree = 40
      for (const handler of map._state.moveEndHandlers) handler()

      expect(map._state.sources.get(DOTS_SOURCE)!.setData).toHaveBeenCalledOnce()
      // Twice the scale, twice the circumference on screen: about twice the dots.
      expect(screenDots(map).length / before).toBeCloseTo(2, 1)
    })

    it('has no dots without an origin', () => {
      const { control, map } = addedControl()
      control.setOrigin(null)
      expect(map._state.sources.get(DOTS_SOURCE)!.setData).toHaveBeenCalledWith({
        type: 'FeatureCollection',
        features: [],
      })
    })

    it('ignores a move before its layers exist', () => {
      const control = new TestRangeRingsControl(true, origin())
      const map = makeFakeMap()
      map.isStyleLoaded = () => false
      control.onAdd(asMap(map))
      expect(() => map._state.moveEndHandlers[0]!()).not.toThrow()
      expect(map._state.sources.size).toBe(0)
    })

    it('stops listening for moves when it is removed from the map', () => {
      const { control, map } = addedControl()
      const [, handler] = map.on.mock.calls.find(([event]) => event === 'moveend')!
      control.onRemove()
      expect(map.off).toHaveBeenCalledWith('moveend', handler)
      expect(map._state.moveEndHandlers).toHaveLength(0)
    })
  })

  describe('basemap-dependent ink', () => {
    it('draws black dots and black labels, without a halo, on the dark basemap', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(LAYER)!.paint!['circle-color']).toBe('#000000')
      expect(map._state.layers.get(ORIGIN_LAYER)!.paint!['circle-stroke-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint).toMatchObject({
        'text-color': '#000000',
        'text-halo-width': 0,
      })
      expect(map._state.layers.get(DISTANCE_LAYER)!.paint).toEqual({ 'text-color': '#000000' })
    })

    it('switches to black with a white halo on the bright basemap', () => {
      document.documentElement.dataset.mapTheme = 'light'
      const { map } = addedControl()
      expect(map._state.layers.get(LAYER)!.paint!['circle-color']).toBe('#000000')
      expect(map._state.layers.get(ORIGIN_LAYER)!.paint!['circle-stroke-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint).toMatchObject({
        'text-color': '#000000',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      })
      expect(map._state.layers.get(DISTANCE_LAYER)!.paint).toEqual({
        'text-color': 'rgba(27,29,34,0.85)',
      })
    })
  })

  describe('style reload', () => {
    it('replaces its own layers and sources instead of adding duplicates', () => {
      const { control, map } = addedControl()
      control._initRings()
      expect(map._state.removedLayers.sort()).toEqual(
        [LAYER, ORIGIN_LAYER, ORIGIN_DOT_LAYER, LABEL_LAYER, DISTANCE_LAYER].sort(),
      )
      expect(map._state.removedSources.sort()).toEqual(
        [LAYER, ORIGIN_LAYER, DISTANCE_LAYER, DOTS_SOURCE].sort(),
      )
      expect([...map._state.layers.keys()]).toHaveLength(5)
    })
  })

  describe('visibility', () => {
    it('still toggles the rings when the origin-mark layers are missing', () => {
      const { control, map } = addedControl()
      for (const id of [ORIGIN_LAYER, ORIGIN_DOT_LAYER, LABEL_LAYER]) map._state.layers.delete(id)
      map._state.visibility = {}

      control.setOrigin(origin({ latitude: 56 }))

      expect(map._state.visibility[LAYER]).toBe('visible')
      expect(map._state.visibility).not.toHaveProperty(ORIGIN_LAYER)
    })
  })
})
