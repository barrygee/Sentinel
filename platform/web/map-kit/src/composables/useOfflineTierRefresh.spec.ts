import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import type { Map as MapLibreGlMap, VectorTileSource } from 'maplibre-gl'
import { useOfflineTierRefresh } from './useOfflineTierRefresh'
import { useOfflineMapsStore } from '@sentinel/shell-api/stores/offlineMaps'
import type { TerrainToggleControl } from '../controls/terrain/TerrainToggleControl'

function fakeVectorSource(): VectorTileSource & { setTiles: ReturnType<typeof vi.fn> } {
  return { setTiles: vi.fn() } as unknown as VectorTileSource & {
    setTiles: ReturnType<typeof vi.fn>
  }
}

function fakeMap(source: VectorTileSource | undefined): MapLibreGlMap {
  return { getSource: vi.fn(() => source) } as unknown as MapLibreGlMap
}

describe('useOfflineTierRefresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('applyCurrentVersion (called after every style load)', () => {
    it('sets the versioned basemap tile URL on the openmaptiles source when showing the offline style', () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.status = {
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
      }
      const { applyCurrentVersion } = useOfflineTierRefresh(
        () => map,
        () => true,
      )
      applyCurrentVersion()
      expect(source.setTiles).toHaveBeenCalledWith(['/api/offline-map/basemap/{z}/{x}/{y}?v=v1'])
    })

    it('does nothing when there is no map yet', () => {
      const { applyCurrentVersion } = useOfflineTierRefresh(
        () => null,
        () => true,
      )
      expect(() => applyCurrentVersion()).not.toThrow()
    })

    it('does nothing when the map is not currently showing the offline style', () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const { applyCurrentVersion } = useOfflineTierRefresh(
        () => map,
        () => false,
      )
      applyCurrentVersion()
      expect(source.setTiles).not.toHaveBeenCalled()
    })

    it('does nothing when the style has no openmaptiles source yet', () => {
      const map = fakeMap(undefined)
      const { applyCurrentVersion } = useOfflineTierRefresh(
        () => map,
        () => true,
      )
      expect(() => applyCurrentVersion()).not.toThrow()
    })

    it('never calls map.setStyle — only the source is touched', () => {
      const source = fakeVectorSource()
      const map = {
        getSource: vi.fn(() => source),
        setStyle: vi.fn(),
      } as unknown as MapLibreGlMap & {
        setStyle: ReturnType<typeof vi.fn>
      }
      const { applyCurrentVersion } = useOfflineTierRefresh(
        () => map,
        () => true,
      )
      applyCurrentVersion()
      expect(
        (map as unknown as { setStyle: ReturnType<typeof vi.fn> }).setStyle,
      ).not.toHaveBeenCalled()
    })
  })

  describe('reacting to a tiersVersion change', () => {
    it('skips the very first assignment (undefined → a real value) with no refresh', async () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      useOfflineTierRefresh(
        () => map,
        () => true,
      )
      offlineMapsStore.status = {
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
      }
      await nextTick()
      expect(source.setTiles).not.toHaveBeenCalled()
    })

    it('refreshes the basemap source and calls the terrain control when the version genuinely changes', async () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.status = {
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
      }
      const terrainControl = { refreshTiles: vi.fn() } as unknown as TerrainToggleControl
      useOfflineTierRefresh(
        () => map,
        () => true,
        () => terrainControl,
      )
      await nextTick() // let the first (skipped) assignment settle

      offlineMapsStore.status = { ...offlineMapsStore.status, tiers_version: 'v2' }
      await nextTick()

      expect(source.setTiles).toHaveBeenCalledWith(['/api/offline-map/basemap/{z}/{x}/{y}?v=v2'])
      expect(terrainControl.refreshTiles).toHaveBeenCalledOnce()
    })

    it('does nothing when the offline style is not currently shown', async () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.status = {
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
      }
      const terrainControl = { refreshTiles: vi.fn() } as unknown as TerrainToggleControl
      useOfflineTierRefresh(
        () => map,
        () => false,
        () => terrainControl,
      )
      await nextTick()
      offlineMapsStore.status = { ...offlineMapsStore.status, tiers_version: 'v2' }
      await nextTick()
      expect(source.setTiles).not.toHaveBeenCalled()
      expect(terrainControl.refreshTiles).not.toHaveBeenCalled()
    })

    it('does nothing when tiersVersion "changes" to the same value', async () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.status = {
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
      }
      useOfflineTierRefresh(
        () => map,
        () => true,
      )
      await nextTick()
      offlineMapsStore.status = { ...offlineMapsStore.status, used_bytes: 5 } // unrelated field change
      await nextTick()
      expect(source.setTiles).not.toHaveBeenCalled()
    })

    it('works with no terrain control supplied', async () => {
      const source = fakeVectorSource()
      const map = fakeMap(source)
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.status = {
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
      }
      useOfflineTierRefresh(
        () => map,
        () => true,
      )
      await nextTick()
      offlineMapsStore.status = { ...offlineMapsStore.status, tiers_version: 'v2' }
      await expect(nextTick()).resolves.not.toThrow()
      expect(source.setTiles).toHaveBeenCalled()
    })
  })
})
