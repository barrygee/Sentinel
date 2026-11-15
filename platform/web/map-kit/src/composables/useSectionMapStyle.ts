import { computed, onMounted, watch, type ComputedRef } from 'vue'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { useConnectivity } from '@sentinel/shell-api/composables/useConnectivity'
import { basemapStyleUrl, setMapStyle } from '@sentinel/map-kit/utils/mapStyle'
import { useUserLocation } from '@sentinel/map-kit/composables/useUserLocation'
import { useMapContextMenu } from '@sentinel/map-kit/composables/useMapContextMenu'
import { useOfflineTierRefresh } from '@sentinel/map-kit/composables/useOfflineTierRefresh'
import { useBasemapLayerSync } from '@sentinel/map-kit/composables/useBasemapLayerSync'
import { UserLocationMarker } from '@sentinel/map-kit/UserLocationMarker'
import type { TerrainToggleControl } from '@sentinel/map-kit/controls/terrain/TerrainToggleControl'

/** What a section map hands the shared style lifecycle. */
export interface SectionMapStyleOptions {
  /** Build and add the section's own controls. Runs once, on the first style load. */
  initOverlays: (map: MapLibreGlMap) => void
  /**
   * Re-add the section's own sources and layers. `setStyle` discards every
   * source and layer the controls added, so this runs after each style reload,
   * whether the swap came from connectivity or from a theme change.
   */
  reinitOverlays: () => void
  /** The section's terrain control, whose tiles reload when an offline download completes. */
  getTerrainControl: () => TerrainToggleControl | null
  /**
   * Called when connectivity changes but the basemap style is already the
   * right one, so no reload (and no `reinitOverlays`) follows.
   */
  onConnectivityWithoutRestyle?: () => void
}

/** The parts of the shared lifecycle a section map wires into its template and controls. */
export interface SectionMapStyle {
  /** The basemap style for the current connectivity and map theme. */
  styleUrl: ComputedRef<string>
  /** The live map, or null before `map-created` and after `releaseMap`. */
  getMap: () => MapLibreGlMap | null
  /** The operator's position marker, for controls that group around it. */
  locationMarker: UserLocationMarker
  /** The operator's position as `[lon, lat]`, or null when there is none. */
  getUserLocation: () => [number, number] | null
  /** Bind to `MapLibreMap`'s `map-created`. */
  onMapCreated: (map: MapLibreGlMap) => void
  /** Bind to `MapLibreMap`'s `style-loaded`. */
  onStyleLoaded: (map: MapLibreGlMap) => void
  /**
   * Detach from the map on unmount and hand it back, so the section can save
   * its view before removing its controls. Null when no map was created.
   */
  releaseMap: () => MapLibreGlMap | null
}

/**
 * The style lifecycle every flat section map (Air, Sea) shares: load the
 * basemap for the current connectivity and theme, reload it when either
 * changes and put the overlays back afterwards, show the operator's position
 * and attach the map's context menu.
 *
 * The map instance is held in a plain variable, never in a ref: MapLibre's
 * internals must not be made reactive.
 */
export function useSectionMapStyle(options: SectionMapStyleOptions): SectionMapStyle {
  const appStore = useAppStore()
  const themeStore = useThemeStore()

  const styleUrl = computed(() => basemapStyleUrl(appStore.isOnline, themeStore.mapTheme))

  let map: MapLibreGlMap | null = null
  let currentStyleUrl: string | null = null
  let overlaysInitialised = false

  const { location: userLocation, start: startLocation } = useUserLocation()
  const getUserLocation = (): [number, number] | null =>
    userLocation.value ? [userLocation.value.lon, userLocation.value.lat] : null
  const locationMarker = new UserLocationMarker('user-location-marker')

  const contextMenu = useMapContextMenu()

  // Borders have no rail button: Settings › Map is their only switch, and
  // the map follows it through the shared basemap store.
  const basemapLayerSync = useBasemapLayerSync(() => map, ['borders'])

  // Reload the offline basemap/terrain tiles when a download job completes
  // while the map is showing the offline style — see the composable's doc.
  const offlineTierRefresh = useOfflineTierRefresh(
    () => map,
    () => !appStore.isOnline,
    options.getTerrainControl,
  )

  function reinitAfterStyleLoad(): void {
    basemapLayerSync.apply()
    options.reinitOverlays()
    offlineTierRefresh.applyCurrentVersion()
  }

  /** Load `styleUrl` if it isn't already loaded, re-adding the overlays after.
   *  Returns whether a reload was actually triggered. */
  function syncStyleToState(): boolean {
    if (!map) return false
    const targetStyle = styleUrl.value
    if (currentStyleUrl === targetStyle) return false
    currentStyleUrl = targetStyle
    setMapStyle(map, targetStyle)
    map.once('style.load', reinitAfterStyleLoad)
    return true
  }

  useConnectivity(() => {
    if (!syncStyleToState()) options.onConnectivityWithoutRestyle?.()
  })

  // A theme change is the same operation as a connectivity change: reload the
  // basemap, then put the overlays back.
  watch(() => themeStore.mapTheme, syncStyleToState)

  function onMapCreated(createdMap: MapLibreGlMap): void {
    map = createdMap
    currentStyleUrl = styleUrl.value
    startLocation()
    locationMarker.addTo(createdMap)
    contextMenu.attach(createdMap)
  }

  function onStyleLoaded(loadedMap: MapLibreGlMap): void {
    basemapLayerSync.apply()
    // MapLibreMap emits this on every style load; later ones are reloads,
    // which syncStyleToState already re-adds the overlays for.
    if (overlaysInitialised) return
    overlaysInitialised = true
    options.initOverlays(loadedMap)
    // If connectivity or the theme changed between map creation and style
    // load (e.g. the off-grid probe fired before the map existed, so the
    // callback was a no-op), the map has loaded the wrong style. Correct it
    // now that the controls exist to be re-added.
    if (!syncStyleToState()) offlineTierRefresh.applyCurrentVersion()
  }

  // Drop the marker both when the location watcher sees it go and on
  // sentinel:userLocationCleared, so a config-clear is deterministic even if
  // the watcher already ran with a stale localStorage seed on reload.
  function clearLocationMarker(): void {
    locationMarker.remove()
  }

  onMounted(() => {
    window.addEventListener('sentinel:userLocationCleared', clearLocationMarker)
    watch(
      userLocation,
      (location) => {
        if (!location) {
          clearLocationMarker()
          return
        }
        locationMarker.update(location.lon, location.lat)
      },
      { immediate: true },
    )
  })

  function releaseMap(): MapLibreGlMap | null {
    window.removeEventListener('sentinel:userLocationCleared', clearLocationMarker)
    const releasedMap = map
    contextMenu.detach(releasedMap)
    map = null
    return releasedMap
  }

  return {
    styleUrl,
    getMap: () => map,
    locationMarker,
    getUserLocation,
    onMapCreated,
    onStyleLoaded,
    releaseMap,
  }
}
