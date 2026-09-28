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

const statusMock = vi.hoisted(() => ({
  getOfflineMapStatus: vi.fn(),
}))
vi.mock('@/services/offlineMapsApi', () => ({
  getOfflineMapStatus: statusMock.getOfflineMapStatus,
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
import { TERRAIN_TILE_URL_TEMPLATE } from './terrainDem'
import { useBasemapStore } from '@/stores/basemap'
import type { OfflineMapsStore } from '@/stores/offlineMaps'

/** A minimal stand-in for the offline-maps store — this control only ever reads
 *  `tiersVersion` off it. */
function fakeOfflineMapsStore(tiersVersion: string | null = 'v1'): OfflineMapsStore {
  return { tiersVersion } as unknown as OfflineMapsStore
}

const DEM = {
  maxzoom: 12,
  contourTilesUrl: 'dem-contour://{z}/{x}/{y}',
}

const TERRAIN_UNAVAILABLE_TITLE = 'Terrain data not available on this server'

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
let offlineMapsStore: OfflineMapsStore

vi.mock('@/services/settingsApi', () => ({ put: vi.fn(() => Promise.resolve()) }))

beforeEach(() => {
  setActivePinia(createPinia())
  store = useBasemapStore()
  offlineMapsStore = fakeOfflineMapsStore()
  demMock.loadTerrainDem.mockReset().mockResolvedValue(DEM)
  statusMock.getOfflineMapStatus.mockReset().mockResolvedValue({
    basemap_available: true,
    terrain_available: true,
    basemap_max_zoom: 14,
    terrain_max_zoom: 12,
    free_bytes: 0,
    used_bytes: 0,
    sources_configured: true,
    pmtiles_available: true,
    tiers_version: 'v1',
    avg_tile_bytes: { basemap: {}, terrain: {} },
  })
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
    expect(new TerrainToggleControl(store, offlineMapsStore).visible).toBe(false)
  })

  it('seeds visibility as on when the store has terrain enabled', () => {
    store.setLayer('terrain', true)
    expect(new TerrainToggleControl(store, offlineMapsStore).visible).toBe(true)
  })

  it('exposes its label and title', () => {
    const control = new TerrainToggleControl(store, offlineMapsStore)
    expect(control.buttonLabel).toBe('T')
    expect(control.buttonTitle).toBe('Toggle terrain relief and contour lines')
  })
})

describe('TerrainToggleControl.onInit', () => {
  it('starts disabled when another map already found the archive missing', () => {
    store.setTerrainAvailable(false)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    control.onAdd(fakeMap().map)
    expect(control.available).toBe(false)
    expect(control.button.disabled).toBe(true)
    expect(control.button.title).toContain(TERRAIN_UNAVAILABLE_TITLE)
    control.toggle()
    expect(control.visible).toBe(false)
  })

  it('adds nothing when off, and leaves the button inactive', () => {
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(demMock.loadTerrainDem).not.toHaveBeenCalled()
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('opens the archive and adds sources + layers in the right slots when on', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    expect(map.addSource).toHaveBeenCalledWith(HILLSHADE_SOURCE, {
      type: 'raster-dem',
      // offlineMapsStore's tiersVersion defaults to 'v1' in this suite's fake store.
      tiles: [`${TERRAIN_TILE_URL_TEMPLATE}?v=v1`],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: DEM.maxzoom,
    })
    expect(map.addSource).toHaveBeenCalledWith(
      CONTOUR_SOURCE,
      expect.objectContaining({ type: 'vector', tiles: [DEM.contourTilesUrl] }),
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle()
    control.onRemove()
    resolve(DEM)
    await flush()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('warns and leaves the map alone when adding layers throws mid style-swap', async () => {
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
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

describe('terrain unavailability (M1: a STATUS FACT, never inferred from a fetch error)', () => {
  it('disables the control and reverts the store when the server says there is no terrain source', async () => {
    statusMock.getOfflineMapStatus.mockResolvedValue({
      basemap_available: true,
      terrain_available: false,
      basemap_max_zoom: 14,
      terrain_max_zoom: 12,
      free_bytes: 0,
      used_bytes: 0,
      sources_configured: true,
      pmtiles_available: true,
      tiers_version: 'v1',
      avg_tile_bytes: { basemap: {}, terrain: {} },
    })
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    control.toggle()
    await flush()

    expect(control.available).toBe(false)
    expect(control.visible).toBe(false)
    expect(store.layers.terrain).toBe(false)
    expect(store.terrainAvailable).toBe(false)
    expect(control.button.disabled).toBe(true)
    expect(control.button.title).toContain(TERRAIN_UNAVAILABLE_TITLE)
    expect(control.button.getAttribute('aria-label')).toBe(control.button.title)
    expect(control.button.style.opacity).toBe('0.3')
    expect(map.addSource).not.toHaveBeenCalled()
    expect(demMock.loadTerrainDem).not.toHaveBeenCalled()

    // Further toggles are ignored while genuinely unavailable.
    control.toggle()
    expect(control.visible).toBe(false)
  })
})

describe('TerrainToggleControl.refreshTiles', () => {
  it('rebuilds the layers against the new version when available and the version actually changed', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)

    demMock.loadTerrainDem.mockClear()
    map.removeSource.mockClear()
    // The real useOfflineTierRefresh watcher reads `offlineMapsStore.tiersVersion`
    // fresh on every call — mutate the same store object refreshTiles() already
    // holds a reference to, exactly as a completed download bumping the store
    // would look from the control's point of view.
    ;(offlineMapsStore as unknown as { tiersVersion: string }).tiersVersion = 'v2'

    control.refreshTiles()
    await flush()
    expect(demMock.loadTerrainDem).toHaveBeenCalledWith(DEM.maxzoom, 'v2')
    // The old sources/layers were torn down and rebuilt, not left stale.
    expect(map.removeSource).toHaveBeenCalledWith(HILLSHADE_SOURCE)
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
  })

  it('does nothing when available and the tiers version has not changed', async () => {
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()
    demMock.loadTerrainDem.mockClear()
    map.addSource.mockClear()

    control.refreshTiles()
    await flush()
    expect(demMock.loadTerrainDem).not.toHaveBeenCalled()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('updates the remembered version but rebuilds nothing while the overlay is toggled off', async () => {
    // visible=false: available and version-changed, but there is nothing on
    // the map to tear down/rebuild — only bookkeeping should happen.
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    ;(offlineMapsStore as unknown as { tiersVersion: string }).tiersVersion = 'v2'

    control.refreshTiles()
    await flush()
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.removeSource).not.toHaveBeenCalled()

    // The remembered version was still updated, so turning the overlay on
    // afterwards builds it fresh against 'v2' rather than re-triggering a
    // rebuild for a version change that was already absorbed.
    demMock.loadTerrainDem.mockClear()
    control.toggle()
    await flush()
    expect(demMock.loadTerrainDem).toHaveBeenCalledWith(DEM.maxzoom, 'v2')
  })

  it('re-probes /status when currently unavailable, and enables once the server reports terrain', async () => {
    store.setTerrainAvailable(false)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(control.available).toBe(false)

    control.refreshTiles()
    await flush()
    expect(control.available).toBe(true)
    expect(control.button.disabled).toBe(false)
  })

  it('stays disabled when the re-probe still reports no terrain source', async () => {
    store.setTerrainAvailable(false)
    statusMock.getOfflineMapStatus.mockResolvedValue({
      basemap_available: true,
      terrain_available: false,
      basemap_max_zoom: 14,
      terrain_max_zoom: 12,
      free_bytes: 0,
      used_bytes: 0,
      sources_configured: true,
      pmtiles_available: true,
      tiers_version: 'v1',
      avg_tile_bytes: { basemap: {}, terrain: {} },
    })
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)

    control.refreshTiles()
    await flush()
    expect(control.available).toBe(false)
    expect(control.button.disabled).toBe(true)
  })

  it('builds the overlay immediately once the re-probe succeeds while the overlay is already meant to be visible', async () => {
    store.setLayer('terrain', true)
    store.setTerrainAvailable(false)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled() // starts disabled — nothing built yet

    control.refreshTiles()
    await flush()
    expect(control.available).toBe(true)
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
  })

  it('leaves the control disabled (not a verdict) when the re-probe fails transiently', async () => {
    store.setTerrainAvailable(false)
    statusMock.getOfflineMapStatus.mockRejectedValue(new Error('offline'))
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)

    control.refreshTiles()
    await flush()
    expect(control.available).toBe(false)
    expect(control.button.disabled).toBe(true)
  })
})

describe('a fetch/DEM-configuration error is transient, not a verdict (M1)', () => {
  it('leaves availability and the persisted preference untouched when the status fetch fails while opening layers', async () => {
    statusMock.getOfflineMapStatus.mockRejectedValue(new Error('network blip'))
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    expect(control.available).toBe(true)
    expect(control.visible).toBe(true)
    expect(store.layers.terrain).toBe(true)
    expect(store.terrainAvailable).toBe(true)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('status fetch failed'),
      expect.any(Error),
    )
  })

  it('retries on the next initLayers() call once the transient status fetch failure clears', async () => {
    statusMock.getOfflineMapStatus.mockRejectedValueOnce(new Error('network blip'))
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()
    expect(map.addSource).not.toHaveBeenCalled()

    control.initLayers()
    await flush()
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
  })

  it('leaves availability untouched (and retries later) when configuring the DEM source throws', async () => {
    demMock.loadTerrainDem.mockRejectedValueOnce(new Error('contour setup failed'))
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()

    expect(control.available).toBe(true)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DEM configuration failed'),
      expect.any(Error),
    )

    demMock.loadTerrainDem.mockResolvedValue(DEM)
    control.initLayers()
    await flush()
    expect(map.sources.has(HILLSHADE_SOURCE)).toBe(true)
  })
})

describe('contour palette per basemap', () => {
  it.each(['dark', 'light', 'colour'] as const)(
    'paints lines and labels with the %s palette',
    async (theme) => {
      document.documentElement.dataset.mapTheme = theme
      store.setLayer('terrain', true)
      const control = new TerrainToggleControl(store, offlineMapsStore)
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
    const control = new TerrainToggleControl(store, offlineMapsStore)
    const map = fakeMap()
    control.onAdd(map.map)
    await flush()
    expect(paintOf(map, CONTOUR_INDEX_LAYER)['line-color']).toBe(CONTOUR_PALETTES.dark.indexColor)
  })

  it('re-reads the palette when a style swap re-adds the overlay', async () => {
    document.documentElement.dataset.mapTheme = 'dark'
    store.setLayer('terrain', true)
    const control = new TerrainToggleControl(store, offlineMapsStore)
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
