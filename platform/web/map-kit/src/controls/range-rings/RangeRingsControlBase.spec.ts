import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { RangeRingsControlBase } from './RangeRingsControlBase'
import type { ResolvedRingOrigin } from '../../composables/useRangeRingOrigin'

const LAYER = 'test-rings'
const ORIGIN_LAYER = `${LAYER}-origin`
const ORIGIN_DOT_LAYER = `${LAYER}-origin-dot`
const LABEL_LAYER = `${LAYER}-label`

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
    })

    it('flags a stale position in the ring label', () => {
      const { control, map } = addedControl()
      control.setOrigin(origin({ degraded: true }))
      expect(map._state.textField[LABEL_LAYER]).toMatch(/^SENTRY ONE · OFFLINE · \d+ NM$/)
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
    })

    it('switches to black with a white halo on the bright basemap', () => {
      document.documentElement.dataset.mapTheme = 'light'
      const { map } = addedControl()
      expect(map._state.layers.get(LAYER)!.paint!['line-color']).toBe('#000000')
      expect(map._state.layers.get(ORIGIN_LAYER)!.paint!['circle-stroke-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-color']).toBe('#000000')
      expect(map._state.layers.get(LABEL_LAYER)!.paint!['text-halo-color']).toBe('#ffffff')
    })
  })

  describe('style reload', () => {
    it('replaces its own layers and sources instead of adding duplicates', () => {
      const { control, map } = addedControl()
      control._initRings()
      expect(map._state.removedLayers.sort()).toEqual(
        [LAYER, ORIGIN_LAYER, ORIGIN_DOT_LAYER, LABEL_LAYER].sort(),
      )
      expect(map._state.removedSources.sort()).toEqual([LAYER, ORIGIN_LAYER].sort())
      expect([...map._state.layers.keys()]).toHaveLength(4)
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
