import { describe, it, expect, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import {
  addMapDimLayer,
  MAP_DIM_OPACITY,
  setMapDimming,
} from '@sentinel/map-kit/map-dimming/mapDimming'

/** A map holding just what the helpers touch: layers, their layout and the canvas. */
function fakeMap(existingLayerIds: string[] = []) {
  const layers = new Map<string, unknown>(existingLayerIds.map((id) => [id, { id }]))
  const canvas = document.createElement('canvas')
  const map = {
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    setLayoutProperty: vi.fn(),
    getCanvas: () => canvas,
  }
  return { map, layers, canvas, asMap: map as unknown as maplibregl.Map }
}

describe('MAP_DIM_OPACITY', () => {
  it('is the black that matches the stylesheet brightness(0.65)', () => {
    expect(MAP_DIM_OPACITY).toBe(0.35)
  })
})

describe('addMapDimLayer', () => {
  it('adds a black background layer at the dimming opacity, on top (no beforeId)', () => {
    const { map, asMap } = fakeMap()
    addMapDimLayer(asMap, 'sea-map-dim')
    expect(map.addLayer).toHaveBeenCalledOnce()
    expect(map.addLayer).toHaveBeenCalledWith({
      id: 'sea-map-dim',
      type: 'background',
      paint: { 'background-color': '#000000', 'background-opacity': 0.35 },
    })
  })

  it('leaves a map that already has the layer alone', () => {
    const { map, asMap } = fakeMap(['sea-map-dim'])
    addMapDimLayer(asMap, 'sea-map-dim')
    expect(map.addLayer).not.toHaveBeenCalled()
  })
})

describe('setMapDimming', () => {
  it('dimmed: turns the canvas filter off and shows the layer', () => {
    const { map, canvas, asMap } = fakeMap(['sea-map-dim'])
    setMapDimming(asMap, 'sea-map-dim', true)
    expect(canvas.style.filter).toBe('none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('sea-map-dim', 'visibility', 'visible')
  })

  it('not dimmed: hands the canvas back to the stylesheet and hides the layer', () => {
    const { map, canvas, asMap } = fakeMap(['sea-map-dim'])
    canvas.style.filter = 'none'
    setMapDimming(asMap, 'sea-map-dim', false)
    expect(canvas.style.filter).toBe('')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('sea-map-dim', 'visibility', 'none')
  })

  it('still sets the canvas when the map has no such layer, and touches no layer', () => {
    const { map, canvas, asMap } = fakeMap()
    setMapDimming(asMap, 'sea-map-dim', true)
    expect(canvas.style.filter).toBe('none')
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})
