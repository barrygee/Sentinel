import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { BASEMAP_LAYER_GROUPS, applyBasemapLayerVisibility } from './basemapLayers'

const STYLE_NAMES = ['fiord', 'fiord-online', 'osm-light', 'osm-light-online']

interface StyleLayer {
  id: string
  source?: string
  'source-layer'?: string
}

function styleLayers(styleName: string): StyleLayer[] {
  // Paths resolve from the vitest root (platform/web/map-kit) up to the repo's
  // frontend/assets, where the offline basemap styles live.
  const style = JSON.parse(
    readFileSync(resolve(process.cwd(), `../../../frontend/assets/${styleName}.json`), 'utf8'),
  ) as { layers: StyleLayer[] }
  return style.layers
}

/** A fake map whose style holds exactly `layerIds`. */
function fakeMap(layerIds: string[]) {
  const present = new Set(layerIds)
  return {
    getLayer: vi.fn((layerId: string) => (present.has(layerId) ? { id: layerId } : undefined)),
    setLayoutProperty: vi.fn(),
  }
}

describe('BASEMAP_LAYER_GROUPS against the bundled styles', () => {
  it.each(STYLE_NAMES)('names only layers that exist in %s (or its offline twin)', (styleName) => {
    // The online builds lack the offline-only `surroundings_*` layers; every
    // other id must be in every style, or a toggle silently misses it.
    const ids = new Set(styleLayers(styleName).map((layer) => layer.id))
    const isOnline = styleName.endsWith('-online')
    for (const [group, layerIds] of Object.entries(BASEMAP_LAYER_GROUPS)) {
      for (const layerId of layerIds) {
        if (isOnline && layerId.startsWith('surroundings_')) continue
        expect(ids.has(layerId), `${group}: ${layerId}`).toBe(true)
      }
    }
  })

  it.each(STYLE_NAMES)('puts every road-source line in %s in the roads group', (styleName) => {
    // Any layer drawn from the road tiles (bar railways, which are not roads)
    // must hide with Roads — missing one left motorways on the map.
    const roadLayers = styleLayers(styleName).filter(
      (layer) =>
        (layer['source-layer'] === 'roads' || layer['source-layer'] === 'transportation') &&
        !layer.id.startsWith('railway'),
    )
    expect(roadLayers.length).toBeGreaterThan(0)
    for (const layer of roadLayers) {
      expect(BASEMAP_LAYER_GROUPS.roads, layer.id).toContain(layer.id)
    }
  })

  it.each(STYLE_NAMES)('puts every boundary line in %s in the borders group', (styleName) => {
    const boundaryLayers = styleLayers(styleName).filter((layer) =>
      ['boundaries', 'boundary'].includes(layer['source-layer'] ?? ''),
    )
    expect(boundaryLayers.length).toBeGreaterThan(0)
    for (const layer of boundaryLayers) {
      expect(BASEMAP_LAYER_GROUPS.borders, layer.id).toContain(layer.id)
    }
  })

  it('hides country names with the names group', () => {
    expect(BASEMAP_LAYER_GROUPS.names).toEqual(
      expect.arrayContaining(['place_country_major', 'place_country_minor', 'place_city_large']),
    )
  })

  it('keeps the three groups disjoint', () => {
    const all = Object.values(BASEMAP_LAYER_GROUPS).flat()
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('applyBasemapLayerVisibility', () => {
  it('shows every layer of the group the style has', () => {
    const map = fakeMap([...BASEMAP_LAYER_GROUPS.borders])
    applyBasemapLayerVisibility(map as unknown as Map, 'borders', true)
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(BASEMAP_LAYER_GROUPS.borders.length)
    for (const layerId of BASEMAP_LAYER_GROUPS.borders) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(layerId, 'visibility', 'visible')
    }
  })

  it('hides them with visibility none', () => {
    const map = fakeMap(['boundary_state'])
    applyBasemapLayerVisibility(map as unknown as Map, 'borders', false)
    expect(map.setLayoutProperty).toHaveBeenCalledExactlyOnceWith(
      'boundary_state',
      'visibility',
      'none',
    )
  })

  it('skips ids the current style does not have', () => {
    const map = fakeMap(['highway_minor'])
    applyBasemapLayerVisibility(map as unknown as Map, 'roads', false)
    expect(map.setLayoutProperty).toHaveBeenCalledExactlyOnceWith(
      'highway_minor',
      'visibility',
      'none',
    )
  })

  it('touches only the requested group', () => {
    const map = fakeMap(['highway_minor', 'place_city', 'boundary_state'])
    applyBasemapLayerVisibility(map as unknown as Map, 'names', false)
    expect(map.setLayoutProperty).toHaveBeenCalledExactlyOnceWith(
      'place_city',
      'visibility',
      'none',
    )
  })
})
