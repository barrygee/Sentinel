import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import { RangeRingsControl } from './RangeRingsControl'
import { useAirStore } from '@/stores/air'
import type { AirStore } from '../types'

const LAYER_ID = 'range-rings-lines'

interface FakeMap {
  map: maplibregl.Map
  once: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  setData: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  layers: Set<string>
  sources: Set<string>
}

// Fake MapLibre map tracking layer/source existence so getLayer/getSource
// behave like the real map after add/remove, and capturing the GeoJSON written.
function fakeMap(options: { styleLoaded?: boolean } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const layers = new Set<string>()
  const sources = new Set<string>()
  const setData = vi.fn()
  const addSource = vi.fn((id: string) => sources.add(id))
  const addLayer = vi.fn((layer: { id: string }) => layers.add(layer.id))
  const setLayoutProperty = vi.fn()
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') styleLoadHandlers.push(handler)
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    getSource: vi.fn((id: string) => (sources.has(id) ? { setData } : undefined)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    addSource,
    addLayer,
    setLayoutProperty,
  } as unknown as maplibregl.Map
  return {
    map,
    once: map.once as unknown as ReturnType<typeof vi.fn>,
    addSource,
    addLayer,
    setLayoutProperty,
    setData,
    styleLoadHandlers,
    layers,
    sources,
  }
}

const HOME: [number, number] = [-1, 51]

let airStore: AirStore

beforeEach(() => {
  setActivePinia(createPinia())
  airStore = useAirStore()
})

describe('RangeRingsControl constructor', () => {
  it('seeds visibility from the store (default off) and detects an available location', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    expect(control.ringsVisible).toBe(false)
  })

  it('seeds visibility on when the store enables range rings', () => {
    airStore.setOverlay('rangeRings', true)
    expect(new RangeRingsControl(airStore, () => HOME).ringsVisible).toBe(true)
  })

  it('exposes its label and title', () => {
    const control = new RangeRingsControl(airStore, () => null)
    expect(control.buttonLabel).toBe('◎')
    expect(control.buttonTitle).toBe('Toggle range rings')
  })
})

describe('RangeRingsControl.onInit', () => {
  it('builds the rings source and layer immediately when the style is loaded', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      LAYER_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: LAYER_ID, type: 'line' }),
    )
    // Five ring distances, each a closed 64-step LineString (65 points).
    const sourceArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection }
    expect(sourceArg.data.features).toHaveLength(5)
    const firstRing = sourceArg.data.features[0]!.geometry as GeoJSON.LineString
    expect(firstRing.coordinates).toHaveLength(65)
  })

  it('defers ring construction to the style.load event when the style is not ready', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)

    expect(map.addSource).not.toHaveBeenCalled()
    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('builds an empty source when no user location is available', () => {
    const control = new RangeRingsControl(airStore, () => null)
    const map = fakeMap()
    control.onAdd(map.map)
    const sourceArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection }
    expect(sourceArg.data.features).toHaveLength(0)
  })

  it('removes a pre-existing rings layer and source before rebuilding', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap()
    map.layers.add(LAYER_ID)
    map.sources.add(LAYER_ID)
    control.onAdd(map.map)
    expect(map.map.removeLayer).toHaveBeenCalledWith(LAYER_ID)
    expect(map.map.removeSource).toHaveBeenCalledWith(LAYER_ID)
  })
})

describe('RangeRingsControl visibility', () => {
  it('shows the layer when rings are on and a location exists', () => {
    airStore.setOverlay('rangeRings', true)
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LAYER_ID, 'visibility', 'visible')
  })

  it('keeps the layer hidden when rings are toggled on but no location exists', () => {
    const control = new RangeRingsControl(airStore, () => null)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(control.ringsVisible).toBe(true)
    expect(airStore.overlayStates.rangeRings).toBe(true)
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LAYER_ID, 'visibility', 'none')
  })

  it('toggles the layer visible and persists when a location exists', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LAYER_ID, 'visibility', 'visible')
    expect(airStore.overlayStates.rangeRings).toBe(true)
  })

  it('reapplies visibility when the location-available flag changes', () => {
    airStore.setOverlay('rangeRings', true)
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.setLocationAvailable(false)
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LAYER_ID, 'visibility', 'none')

    control.setLocationAvailable(true)
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LAYER_ID, 'visibility', 'visible')
  })

  it('does not touch a layer that has not been created', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map) // style not loaded → no layer yet
    // setLocationAvailable triggers _applyVisibility but the layer is absent.
    expect(() => control.setLocationAvailable(true)).not.toThrow()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})

describe('RangeRingsControl.updateCenter', () => {
  it('rewrites the rings source data at the new centre', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap()
    control.onAdd(map.map)

    control.updateCenter(2, 49)
    expect(map.setData).toHaveBeenCalledOnce()
    const data = map.setData.mock.calls[0]![0] as GeoJSON.FeatureCollection
    expect(data.features).toHaveLength(5)
  })

  it('is a no-op when the source does not exist yet', () => {
    const control = new RangeRingsControl(airStore, () => HOME)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map) // deferred → no source
    control.updateCenter(2, 49)
    expect(map.setData).not.toHaveBeenCalled()
  })
})
