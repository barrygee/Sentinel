import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type * as maplibregl from 'maplibre-gl'

const demMock = vi.hoisted(() => ({
  loadTerrainDem: vi.fn(),
}))
vi.mock('./terrainDem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./terrainDem')>()),
  loadTerrainDem: demMock.loadTerrainDem,
}))

import {
  TerrainToggleControl,
  HILLSHADE_SOURCE,
  CONTOUR_SOURCE,
  HILLSHADE_LAYER,
  CONTOUR_MINOR_LAYER,
  CONTOUR_INDEX_LAYER,
  CONTOUR_LABEL_LAYER,
  CONTOUR_PALETTES,
} from './TerrainToggleControl'
import { TERRAIN_PMTILES_PATH, TERRAIN_PMTILES_URL } from './terrainDem'
import { useBasemapStore } from '@/stores/basemap'

const DEM = {
  maxzoom: 12,
  bounds: [-8.65, 49.84, 1.77, 60.86] as [number, number, number, number],
  contourTilesUrl: 'dem-contour://{z}/{x}/{y}',
}

interface FakeMap {
  map: maplibregl.Map
  once: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  removeLayer: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  sources: Set<string>
  layers: string[]
}

// Fake map that tracks sources/layers, pre-seeded with the Fiord layers the
// control anchors its `beforeId`s to.
function fakeMap(options: { styleLoaded?: boolean; styleLayers?: string[] } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const sources = new Set<string>()
  const layers = [...(options.styleLayers ?? ['waterway', 'highway_path', 'water_name'])]
  const once = vi.fn((event: string, handler: () => void) => {
    if (event === 'style.load') styleLoadHandlers.push(handler)
  })
  const addSource = vi.fn((id: string) => sources.add(id))
  const removeSource = vi.fn((id: string) => sources.delete(id))
  const addLayer = vi.fn((layer: { id: string }, before?: string) => {
    const at = before ? layers.indexOf(before) : -1
    if (at === -1) layers.push(layer.id)
    else layers.splice(at, 0, layer.id)
  })
  const removeLayer = vi.fn((id: string) => layers.splice(layers.indexOf(id), 1))
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once,
    getSource: vi.fn((id: string) => (sources.has(id) ? { id } : undefined)),
    getLayer: vi.fn((id: string) => (layers.includes(id) ? { id } : undefined)),
    addSource,
    addLayer,
    removeLayer,
    removeSource,
  } as unknown as maplibregl.Map
  return {
    map,
    once,
    addSource,
    addLayer,
    removeLayer,
    removeSource,
    styleLoadHandlers,
    sources,
    layers,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

let store: ReturnType<typeof useBasemapStore>

vi.mock('@/services/settingsApi', () => ({ put: vi.fn(() => Promise.resolve()) }))

beforeEach(() => {
  setActivePinia(createPinia())
  store = useBasemapStore()
  demMock.loadTerrainDem.mockReset().mockResolvedValue(DEM)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  delete document.documentElement.dataset.mapTheme
})

interface AddedLayer {
  id: string
  paint: Record<string, unknown>
}

// The paint block of the most recent addLayer call for `id`.
function paintOf(map: FakeMap, id: string): Record<string, unknown> {
  const calls = map.addLayer.mock.calls.filter((call) => (call[0] as AddedLayer).id === id)
  return (calls.at(-1)![0] as AddedLayer).paint
}

describe('TerrainToggleControl constructor', () => {
  it('seeds visibility from the basemap store (default off)', () => {
    expect(new TerrainToggleControl(store).visible).toBe(false)
  })

  it('seeds visibility as on when the store has terrain enabled', () => {
    store.setLayer('terrain', true)
    expect(new TerrainToggleControl(store).visible).toBe(true)
  })

  it('exposes its label and title', () => {
    const control = new TerrainToggleControl(store)
    expect(control.buttonLabel).toBe('T')
    expect(control.buttonTitle).toBe('Toggle terrain relief and contour lines')
  })
})

describe('TerrainToggleControl.onInit', () => {
  it('starts disabled when another map already found the archive missing', () => {
    store.setTerrainAvailable(false)
    const control = new TerrainToggleControl(store)
    control.onAdd(fakeMap().map)
    expect(control.available).toBe(false)
    expect(control.button.disabled).toBe(true)
    expect(control.button.title).toContain(TERRAIN_PMTILES_PATH)
    control.toggle()
    expect(control.visible).toBe(false)
  })

  it('adds nothing when off, and leaves the button inactive', () => {
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(demMock.loadTerrainDem).not.toHaveBeenCalled()
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('opens the archive and adds sources + layers in the right slots when on', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    expect(map.addSource).toHaveBeenCalledWith(HILLSHADE_SOURCE, {
      type: 'raster-dem',
      url: TERRAIN_PMTILES_URL,
      encoding: 'terrarium',
      tileSize: 512,
    })
    expect(map.addSource).toHaveBeenCalledWith(
      CONTOUR_SOURCE,
      expect.objectContaining({ type: 'vector', tiles: [DEM.contourTilesUrl], bounds: DEM.bounds }),
    )
    // Relief under waterways, lines under roads, labels under the map's text.
    expect(map.layers).toEqual([
      HILLSHADE_LAYER,
      'waterway',
      CONTOUR_MINOR_LAYER,
      CONTOUR_INDEX_LAYER,
      'highway_path',
      CONTOUR_LABEL_LAYER,
      'water_name',
    ])
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })

  it('appends layers on top when the anchor layers are absent from the style', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap({ styleLayers: [] })
    control.onAdd(map.map)
    await flush()
    expect(map.layers).toEqual([
      HILLSHADE_LAYER,
      CONTOUR_MINOR_LAYER,
      CONTOUR_INDEX_LAYER,
      CONTOUR_LABEL_LAYER,
    ])
  })

  it('defers to the style.load event when the style is not ready', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function))
    expect(demMock.loadTerrainDem).not.toHaveBeenCalled()

    map.styleLoadHandlers[0]!()
    await flush()
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
  })
})

describe('TerrainToggleControl.toggle', () => {
  it('turns on: persists, activates the button and adds the overlay', async () => {
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)

    control.handleClickPublic()
    expect(control.visible).toBe(true)
    expect(store.layers.terrain).toBe(true)
    expect(control.button.style.opacity).toBe('1')
    await flush()
    expect(map.sources.has(CONTOUR_SOURCE)).toBe(true)
  })

  it('turns off: removes every layer and source and persists', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    control.toggle()
    expect(control.visible).toBe(false)
    expect(store.layers.terrain).toBe(false)
    expect(map.removeLayer.mock.calls.map((c) => c[0])).toEqual([
      CONTOUR_LABEL_LAYER,
      CONTOUR_INDEX_LAYER,
      CONTOUR_MINOR_LAYER,
      HILLSHADE_LAYER,
    ])
    expect(map.removeSource.mock.calls.map((c) => c[0])).toEqual([CONTOUR_SOURCE, HILLSHADE_SOURCE])
    expect(map.layers).toEqual(['waterway', 'highway_path', 'water_name'])
  })

  it('reuses the opened archive and skips re-adding an existing source', async () => {
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle()
    await flush()
    control.initLayers() // e.g. a redundant re-init with the overlay already present
    await flush()
    expect(demMock.loadTerrainDem).toHaveBeenCalledOnce()
    expect(map.addSource).toHaveBeenCalledTimes(2)
  })

  it('does nothing while the overlay was toggled off during the archive open', async () => {
    let resolve!: (dem: typeof DEM) => void
    demMock.loadTerrainDem.mockReturnValue(new Promise((r) => (resolve = r)))
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle() // on → archive opening…
    control.toggle() // …off again before it resolves
    resolve(DEM)
    await flush()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('does nothing when the control was removed during the archive open', async () => {
    let resolve!: (dem: typeof DEM) => void
    demMock.loadTerrainDem.mockReturnValue(new Promise((r) => (resolve = r)))
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle()
    control.onRemove()
    resolve(DEM)
    await flush()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('warns and leaves the map alone when adding layers throws mid style-swap', async () => {
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    map.addSource.mockImplementation(() => {
      throw new Error('Style is not done loading')
    })
    control.onAdd(map.map)
    control.toggle()
    await flush()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('deferring overlay'),
      expect.any(Error),
    )
    expect(control.visible).toBe(true)
  })
})

describe('TerrainToggleControl.setVisible', () => {
  it('adopts a store-driven change without writing back to the store', async () => {
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    const setLayer = vi.spyOn(store, 'setLayer')

    control.setVisible(true)
    await flush()
    expect(control.visible).toBe(true)
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
    expect(setLayer).not.toHaveBeenCalled()

    control.setVisible(true) // no-op when unchanged
    control.setVisible(false)
    expect(map.sources.size).toBe(0)
    expect(setLayer).not.toHaveBeenCalled()
  })
})

describe('missing DEM archive', () => {
  it('disables the control, reverts the store and explains what to install', async () => {
    demMock.loadTerrainDem.mockRejectedValue(new Error('404'))
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle()
    await flush()

    expect(control.available).toBe(false)
    expect(control.visible).toBe(false)
    expect(store.layers.terrain).toBe(false)
    expect(store.terrainAvailable).toBe(false)
    expect(control.button.disabled).toBe(true)
    expect(control.button.title).toContain(TERRAIN_PMTILES_PATH)
    expect(control.button.getAttribute('aria-label')).toBe(control.button.title)
    expect(control.button.style.opacity).toBe('0.3')
    expect(map.addSource).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DEM archive not available'),
      expect.any(Error),
    )

    // Further toggles are ignored.
    control.toggle()
    expect(control.visible).toBe(false)
    expect(demMock.loadTerrainDem).toHaveBeenCalledOnce()
  })
})

describe('contour palette per basemap', () => {
  it.each(['dark', 'light', 'colour'] as const)(
    'paints lines and labels with the %s palette',
    async (theme) => {
      document.documentElement.dataset.mapTheme = theme
      store.setLayer('terrain', true)
      const control = new TerrainToggleControl(store)
      const map = fakeMap()
      control.onAdd(map.map)
      await flush()

      const palette = CONTOUR_PALETTES[theme]
      expect(paintOf(map, CONTOUR_MINOR_LAYER)).toMatchObject({
        'line-color': palette.minorColor,
        'line-opacity': palette.minorOpacity,
      })
      expect(paintOf(map, CONTOUR_INDEX_LAYER)).toMatchObject({
        'line-color': palette.indexColor,
        'line-opacity': palette.indexOpacity,
      })
      expect(paintOf(map, CONTOUR_LABEL_LAYER)).toMatchObject({
        'text-color': palette.labelColor,
        'text-halo-color': palette.labelHaloColor,
      })
    },
  )

  it('uses the dark palette when no map theme has been published', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()
    expect(paintOf(map, CONTOUR_INDEX_LAYER)['line-color']).toBe(CONTOUR_PALETTES.dark.indexColor)
  })

  it('re-reads the palette when a style swap re-adds the overlay', async () => {
    document.documentElement.dataset.mapTheme = 'dark'
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    // A palette change reloads the style, dropping the overlay's layers and
    // sources; the map then re-runs initLayers.
    document.documentElement.dataset.mapTheme = 'colour'
    map.sources.clear()
    map.layers.splice(0, map.layers.length, 'waterway', 'highway_path', 'water_name')
    control.initLayers()
    await flush()

    expect(paintOf(map, CONTOUR_INDEX_LAYER)['line-color']).toBe(CONTOUR_PALETTES.colour.indexColor)
    expect(paintOf(map, CONTOUR_LABEL_LAYER)['text-color']).toBe(CONTOUR_PALETTES.colour.labelColor)
  })

  it('gives each basemap its own ink rather than one shared colour', () => {
    const indexColors = new Set(
      Object.values(CONTOUR_PALETTES).map((palette) => palette.indexColor),
    )
    expect(indexColors.size).toBe(3)
  })
})
