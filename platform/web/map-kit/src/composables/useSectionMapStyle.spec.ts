import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import type { TerrainToggleControl } from '@sentinel/map-kit/controls/terrain/TerrainToggleControl'
import {
  useSectionMapStyle,
  type SectionMapStyle,
  type SectionMapStyleOptions,
} from './useSectionMapStyle'

// The composables this one wires together each have their own spec; here they
// are doubles, so the tests see exactly which calls the lifecycle makes.
const doubles = vi.hoisted(() => ({
  setMapStyle: vi.fn(),
  startLocation: vi.fn(),
  location: null as null | { value: { lon: number; lat: number; accuracy: number } | null },
  contextMenu: { attach: vi.fn(), detach: vi.fn() },
  marker: { addTo: vi.fn(), remove: vi.fn(), update: vi.fn() },
  markerClassName: '' as string,
  basemapApply: vi.fn(),
  basemapGroups: null as null | readonly string[],
  basemapGetMap: null as null | (() => unknown),
  tierApply: vi.fn(),
  tierGetMap: null as null | (() => unknown),
  tierIsOffline: null as null | (() => boolean),
  tierGetTerrain: null as null | (() => unknown),
}))

vi.mock('@sentinel/map-kit/utils/mapStyle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentinel/map-kit/utils/mapStyle')>()),
  setMapStyle: doubles.setMapStyle,
}))
vi.mock('@sentinel/map-kit/composables/useUserLocation', async () => {
  const { ref } = await import('vue')
  const location = ref<{ lon: number; lat: number; accuracy: number } | null>(null)
  doubles.location = location
  return { useUserLocation: () => ({ location, start: doubles.startLocation }) }
})
vi.mock('@sentinel/map-kit/composables/useMapContextMenu', () => ({
  useMapContextMenu: () => doubles.contextMenu,
}))
vi.mock('@sentinel/map-kit/composables/useBasemapLayerSync', () => ({
  useBasemapLayerSync: (getMap: () => unknown, groups: readonly string[]) => {
    doubles.basemapGetMap = getMap
    doubles.basemapGroups = groups
    return { apply: doubles.basemapApply }
  },
}))
vi.mock('@sentinel/map-kit/composables/useOfflineTierRefresh', () => ({
  useOfflineTierRefresh: (
    getMap: () => unknown,
    isOffline: () => boolean,
    getTerrain: () => unknown,
  ) => {
    doubles.tierGetMap = getMap
    doubles.tierIsOffline = isOffline
    doubles.tierGetTerrain = getTerrain
    return { applyCurrentVersion: doubles.tierApply }
  },
}))
vi.mock('@sentinel/map-kit/UserLocationMarker', () => ({
  UserLocationMarker: class {
    addTo = doubles.marker.addTo
    remove = doubles.marker.remove
    update = doubles.marker.update
    constructor(className: string) {
      doubles.markerClassName = className
    }
  },
}))

const DARK_ONLINE = '/assets/fiord-online.json'
const DARK_OFFLINE = '/assets/fiord.json'
const LIGHT_ONLINE = '/assets/osm-light-online.json'

/** A map double that records its one-shot listeners so a test can fire `style.load`. */
function fakeMap(): MapLibreGlMap & { fireStyleLoad: () => void } {
  const onceListeners: Array<() => void> = []
  return {
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'style.load') onceListeners.push(listener)
    }),
    fireStyleLoad: () => onceListeners.splice(0).forEach((listener) => listener()),
  } as unknown as MapLibreGlMap & { fireStyleLoad: () => void }
}

let wrapper: VueWrapper | null = null
let mountedSectionMap: SectionMapStyle | null = null

/** Run the composable inside a mounted component, so its watchers and onMounted run. */
function mountSectionMap(overrides: Partial<SectionMapStyleOptions> = {}): {
  sectionMap: SectionMapStyle
  options: SectionMapStyleOptions
} {
  const options: SectionMapStyleOptions = {
    initOverlays: vi.fn(),
    reinitOverlays: vi.fn(),
    getTerrainControl: vi.fn(() => null),
    ...overrides,
  }
  let sectionMap: SectionMapStyle | null = null
  wrapper = mount(
    defineComponent({
      setup() {
        sectionMap = useSectionMapStyle(options)
        return () => h('div')
      },
    }),
  )
  mountedSectionMap = sectionMap as unknown as SectionMapStyle
  return { sectionMap: mountedSectionMap, options }
}

describe('useSectionMapStyle', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    doubles.location!.value = null
    useThemeStore().setMapTheme('dark')
    useAppStore().connectivityMode = 'online'
  })

  afterEach(() => {
    // As a section does in its onBeforeUnmount.
    mountedSectionMap?.releaseMap()
    mountedSectionMap = null
    wrapper?.unmount()
    wrapper = null
  })

  describe('styleUrl', () => {
    it('follows connectivity and the map theme', async () => {
      const { sectionMap } = mountSectionMap()
      expect(sectionMap.styleUrl.value).toBe(DARK_ONLINE)
      useAppStore().connectivityMode = 'offgrid'
      expect(sectionMap.styleUrl.value).toBe(DARK_OFFLINE)
      useAppStore().connectivityMode = 'online'
      useThemeStore().setMapTheme('light')
      expect(sectionMap.styleUrl.value).toBe(LIGHT_ONLINE)
    })
  })

  describe('onMapCreated', () => {
    it('keeps the map, starts location and attaches the marker and context menu', () => {
      const { sectionMap } = mountSectionMap()
      const map = fakeMap()
      expect(sectionMap.getMap()).toBeNull()
      sectionMap.onMapCreated(map)
      expect(sectionMap.getMap()).toBe(map)
      expect(doubles.startLocation).toHaveBeenCalledOnce()
      expect(doubles.marker.addTo).toHaveBeenCalledWith(map)
      expect(doubles.contextMenu.attach).toHaveBeenCalledWith(map)
      expect(doubles.markerClassName).toBe('user-location-marker')
    })

    it('hands the shared helpers the live map, the offline test and the terrain control', () => {
      const terrain = {} as TerrainToggleControl
      const { sectionMap } = mountSectionMap({ getTerrainControl: () => terrain })
      expect(doubles.basemapGroups).toEqual(['borders'])
      expect(doubles.basemapGetMap!()).toBeNull()
      expect(doubles.tierGetMap!()).toBeNull()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      expect(doubles.basemapGetMap!()).toBe(map)
      expect(doubles.tierGetMap!()).toBe(map)
      expect(doubles.tierGetTerrain!()).toBe(terrain)
      expect(doubles.tierIsOffline!()).toBe(false)
      useAppStore().connectivityMode = 'offgrid'
      expect(doubles.tierIsOffline!()).toBe(true)
    })
  })

  describe('per-map options', () => {
    it('takes the map’s own layer groups, marker class and no terrain control', () => {
      mountSectionMap({
        basemapLayerGroups: ['roads', 'borders'],
        markerClassName: 'space-user-location-marker',
        getTerrainControl: undefined,
      })
      expect(doubles.basemapGroups).toEqual(['roads', 'borders'])
      expect(doubles.markerClassName).toBe('space-user-location-marker')
      expect(doubles.tierGetTerrain).toBeUndefined()
    })
  })

  describe('onStyleLoaded', () => {
    it('applies the borders and builds the overlays on the first load only', () => {
      const { sectionMap, options } = mountSectionMap()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      sectionMap.onStyleLoaded(map)
      expect(doubles.basemapApply).toHaveBeenCalledOnce()
      expect(options.initOverlays).toHaveBeenCalledExactlyOnceWith(map)
      // The style already matches, so the offline tiles are brought up to date in place.
      expect(doubles.setMapStyle).not.toHaveBeenCalled()
      expect(doubles.tierApply).toHaveBeenCalledOnce()

      sectionMap.onStyleLoaded(map)
      expect(doubles.basemapApply).toHaveBeenCalledTimes(2)
      expect(options.initOverlays).toHaveBeenCalledOnce()
      expect(doubles.tierApply).toHaveBeenCalledOnce()
    })

    it('corrects a style that changed between map creation and the first load', () => {
      const { sectionMap, options } = mountSectionMap()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      useAppStore().connectivityMode = 'offgrid'
      sectionMap.onStyleLoaded(map)
      expect(options.initOverlays).toHaveBeenCalledOnce()
      expect(doubles.setMapStyle).toHaveBeenCalledExactlyOnceWith(map, DARK_OFFLINE)
      // The correction's reload re-adds the overlays; nothing is re-applied before it lands.
      expect(doubles.tierApply).not.toHaveBeenCalled()
    })
  })

  describe('restyling', () => {
    it('reloads the basemap on a connectivity change and re-adds everything after it', async () => {
      const onConnectivityWithoutRestyle = vi.fn()
      const { sectionMap, options } = mountSectionMap({ onConnectivityWithoutRestyle })
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      useAppStore().connectivityMode = 'offgrid'
      await nextTick()
      expect(doubles.setMapStyle).toHaveBeenCalledExactlyOnceWith(map, DARK_OFFLINE)
      expect(onConnectivityWithoutRestyle).not.toHaveBeenCalled()
      expect(options.reinitOverlays).not.toHaveBeenCalled()

      map.fireStyleLoad()
      expect(doubles.basemapApply).toHaveBeenCalledOnce()
      expect(options.reinitOverlays).toHaveBeenCalledOnce()
      expect(doubles.tierApply).toHaveBeenCalledOnce()
    })

    it('reloads the basemap on a map theme change', async () => {
      const { sectionMap, options } = mountSectionMap()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      useThemeStore().setMapTheme('light')
      await nextTick()
      expect(doubles.setMapStyle).toHaveBeenCalledExactlyOnceWith(map, LIGHT_ONLINE)
      map.fireStyleLoad()
      expect(options.reinitOverlays).toHaveBeenCalledOnce()
    })

    it('tells the section when connectivity changed but the style already matched', async () => {
      const onConnectivityWithoutRestyle = vi.fn()
      const { sectionMap } = mountSectionMap({ onConnectivityWithoutRestyle })
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      // Corrected on the first load, so the later mode change finds the style already right.
      useAppStore().connectivityMode = 'offgrid'
      sectionMap.onStyleLoaded(map)
      doubles.setMapStyle.mockClear()
      await nextTick()
      expect(doubles.setMapStyle).not.toHaveBeenCalled()
      expect(onConnectivityWithoutRestyle).toHaveBeenCalledOnce()
    })

    it('ignores a connectivity change with no section callback and the style already right', async () => {
      const { sectionMap } = mountSectionMap()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      useAppStore().connectivityMode = 'offgrid'
      sectionMap.onStyleLoaded(map)
      doubles.setMapStyle.mockClear()
      // Vue reports a watcher that throws through console.error rather than to the caller.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      await nextTick()
      expect(consoleError).not.toHaveBeenCalled()
      expect(doubles.setMapStyle).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('does nothing before the map exists', async () => {
      const onConnectivityWithoutRestyle = vi.fn()
      mountSectionMap({ onConnectivityWithoutRestyle })
      useAppStore().connectivityMode = 'offgrid'
      useThemeStore().setMapTheme('light')
      await nextTick()
      expect(doubles.setMapStyle).not.toHaveBeenCalled()
      // No map yet counts as "no reload", so the section still hears about the mode change.
      expect(onConnectivityWithoutRestyle).toHaveBeenCalledOnce()
    })
  })

  describe('location marker', () => {
    it('moves with the fix and is removed when the fix goes', async () => {
      const { sectionMap } = mountSectionMap()
      expect(doubles.marker.remove).toHaveBeenCalledOnce() // the immediate run with no fix
      doubles.location!.value = { lon: -1.5, lat: 53.2, accuracy: 0 }
      await nextTick()
      expect(doubles.marker.update).toHaveBeenCalledWith(-1.5, 53.2)
      expect(sectionMap.getUserLocation()).toEqual([-1.5, 53.2])
      doubles.location!.value = null
      await nextTick()
      expect(doubles.marker.remove).toHaveBeenCalledTimes(2)
      expect(sectionMap.getUserLocation()).toBeNull()
    })

    it('is removed on sentinel:userLocationCleared until the map is released', () => {
      const { sectionMap } = mountSectionMap()
      doubles.marker.remove.mockClear()
      window.dispatchEvent(new Event('sentinel:userLocationCleared'))
      expect(doubles.marker.remove).toHaveBeenCalledOnce()
      sectionMap.releaseMap()
      window.dispatchEvent(new Event('sentinel:userLocationCleared'))
      expect(doubles.marker.remove).toHaveBeenCalledOnce()
    })

    it('is the marker the section hands its own controls', () => {
      const { sectionMap } = mountSectionMap()
      expect(sectionMap.locationMarker.addTo).toBe(doubles.marker.addTo)
    })
  })

  describe('releaseMap', () => {
    it('detaches the context menu, forgets the map and returns it', () => {
      const { sectionMap } = mountSectionMap()
      const map = fakeMap()
      sectionMap.onMapCreated(map)
      expect(sectionMap.releaseMap()).toBe(map)
      expect(doubles.contextMenu.detach).toHaveBeenCalledWith(map)
      expect(sectionMap.getMap()).toBeNull()
    })

    it('returns null when no map was ever created', () => {
      const { sectionMap } = mountSectionMap()
      expect(sectionMap.releaseMap()).toBeNull()
      expect(doubles.contextMenu.detach).toHaveBeenCalledWith(null)
    })
  })
})
