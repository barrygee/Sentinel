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

function makeFakeMap() {
  const state = {
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
    label: 'SENTRY ONE',
    kind: 'sentry',
    degraded: false,
    ...overrides,
  }
}

function addedControl(initialOrigin: ResolvedRingOrigin | null = origin(), visible = true) {
  const control = new TestRangeRingsControl(visible, initialOrigin)
  const map = makeFakeMap()
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
    })

    it.each([
      ['longitude', { longitude: -3 }],
      ['latitude', { latitude: 55 }],
      ['label', { label: 'SENTRY TWO' }],
      ['kind', { kind: 'user' as const }],
      ['degraded', { degraded: true }],
    ])('rebuilds when only the %s changes', (_field, change) => {
      const { control, map } = addedControl()
      control.setOrigin(origin(change))
      expect(map._state.sources.get(LAYER)!.setData).toHaveBeenCalledTimes(1)
      expect(map._state.sources.get(ORIGIN_LAYER)!.setData).toHaveBeenCalledTimes(1)
      expect(map._state.sources.get(DISTANCE_LAYER)!.setData).toHaveBeenCalledTimes(1)
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
      expect(map._state.textField[LABEL_LAYER]).toBe('SENTRY ONE · OFFLINE')
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

    it('sets the distance in small bold type', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(DISTANCE_LAYER)!.layout).toMatchObject({
        'text-font': ['Noto Sans Bold'],
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
        'text-offset': [0, -0.3],
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

  describe('basemap-dependent ink', () => {
    it('draws faint white with a light label on the dark basemap', () => {
      const { map } = addedControl()
      expect(map._state.layers.get(LAYER)!.paint!['line-color']).toBe('rgba(255,255,255,0.40)')
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-color']).toBe(
        'rgba(255,255,255,0.65)',
      )
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-halo-color']).toBe('#000000')
      expect(map._state.layers.get(DISTANCE_LAYER)!.paint).toEqual({
        'text-color': 'rgba(255,255,255,0.85)',
      })
    })

    it('switches to black with a white halo on the bright basemap', () => {
      document.documentElement.dataset.mapTheme = 'light'
      const { map } = addedControl()
      expect(map._state.layers.get(LAYER)!.paint!['line-color']).toBe('#000000')
      expect(map._state.layers.get(ORIGIN_LAYER)!.paint!['circle-stroke-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-halo-color']).toBe('#ffffff')
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
      expect(map._state.removedSources.sort()).toEqual([LAYER, ORIGIN_LAYER, DISTANCE_LAYER].sort())
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
