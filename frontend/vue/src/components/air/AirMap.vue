<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="styleUrl"
    region-label="Air domain map — live aircraft"
    region-description="Interactive map of live aircraft. The same aircraft are also listed, with full details and keyboard access, in the Search panel of the map sidebar."
    :center="airStore.mapCenter ?? [-2, 54]"
    :zoom="airStore.mapZoom ?? 6"
    :pitch="airStore.pitch"
    @map-created="onMapCreated"
    @style-loaded="onStyleLoaded"
  />
</template>

<script setup lang="ts">
// IMPORTANT: Map instance is stored in a plain variable — never in ref/reactive.
// All IControl subclasses receive Pinia store refs instead of window.* globals.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { basemapStyleUrl, setMapStyle } from '@/utils/mapStyle'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useAirStore } from '@/stores/air'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import {
  registerAircraftClickHandler,
  clearAircraftClickHandler,
} from './aircraftNotificationTarget'
import { useAirNotifStore } from '@/stores/airNotif'
import { useTrackingStore } from '@sentinel/shell-api/stores/tracking'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useSentrySitesStore } from '@sentinel/shell-api/stores/sentrySites'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { useConnectivity } from '@/composables/useConnectivity'
import { useUserLocation } from '@/composables/useUserLocation'
import { useRangeRingOrigin } from '@/composables/useRangeRingOrigin'
import { useOverheadAlertZones } from '@/composables/useOverheadAlertZones'
import { useMapContextMenu } from '@/composables/useMapContextMenu'
import { useOfflineTierRefresh } from '@/composables/useOfflineTierRefresh'
import { useBasemapLayerSync } from '@/composables/useBasemapLayerSync'
import { useOfflineMapsStore } from '@sentinel/shell-api/stores/offlineMaps'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'
import { UserLocationMarker } from '@/components/shared/UserLocationMarker'

import { NamesToggleControl } from '@/components/shared/controls/names/NamesToggleControl'
import { SentrySitesControl } from '@/components/shared/controls/sentry-sites/SentrySitesControl'
import { RoadsToggleControl } from '@/components/shared/controls/roads/RoadsToggleControl'
import { TerrainToggleControl } from '@/components/shared/controls/terrain/TerrainToggleControl'
import { RangeRingsControl } from './controls/range-rings/RangeRingsControl'
import { OverheadZoneControl } from './controls/overhead-zone/OverheadZoneControl'
import { AdsbLabelsToggleControl } from './controls/adsb-labels/AdsbLabelsToggleControl'
import { ClearOverlaysControl } from './controls/clear-overlays/ClearOverlaysControl'
import { AirportsToggleControl } from './controls/airports/AirportsControl'
import { MilitaryBasesToggleControl } from './controls/military-bases/MilitaryBasesControl'
import { AaraToggleControl } from './controls/aara/AaraControl'
import { AwacToggleControl } from './controls/awacs/AwacControl'
import { AdsbLiveControl } from './controls/adsb/AdsbLiveControl'

const appStore = useAppStore()
const airStore = useAirStore()
const basemapStore = useBasemapStore()
const notificationsStore = useNotificationsStore()
const airNotifStore = useAirNotifStore()
const trackingStore = useTrackingStore()
const settingsStore = useSettingsStore()
const sentrySitesStore = useSentrySitesStore()
const themeStore = useThemeStore()
const offlineMapsStore = useOfflineMapsStore()

const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const styleUrl = computed(() => basemapStyleUrl(appStore.isOnline, themeStore.mapTheme))

// The 3D view was removed from the map options, so the map is always flat. The
// two readers below (ADS-B labels, military-base extrusions) still ask, and a
// previously-stored `sentinel_3d` flag is deliberately not honoured — without a
// control to turn it off, a tilted map would be a state with no way out.
const is3DActive = () => false
const getTargetPitch = () => 0

// User location
const { location: userLocation, start: startLocation } = useUserLocation()
const getUserLocation = (): [number, number] | null =>
  userLocation.value ? [userLocation.value.lon, userLocation.value.lat] : null

const _locationMarker = new UserLocationMarker('user-location-marker')

// Where the range rings are centred — your own position by default, but equally
// a Sentry site or a chosen point (see useRangeRingOrigin). Shared app-wide, so
// the Land map and the Settings panel agree with this one.
const { origin: ringOrigin } = useRangeRingOrigin()
// One shaded zone per watched place — the map's half of the same list the
// alert service works from, so the rings and the alerts can never disagree.
const { activeZones } = useOverheadAlertZones()

const ctxMenu = useMapContextMenu()

// Cached map instance — plain variable, never reactive
let _map: MapLibreGlMap | null = null
let _currentStyleUrl: string | null = null

// Control instances — plain variables, initialised in onStyleLoaded
let adsbControl: AdsbLiveControl | null = null
let adsbLabelsControl: AdsbLabelsToggleControl | null = null
let rangeRingsControl: RangeRingsControl | null = null
let overheadZoneControl: OverheadZoneControl | null = null
let roadsControl: RoadsToggleControl | null = null
let terrainControl: TerrainToggleControl | null = null
let namesControl: NamesToggleControl | null = null
let airportsControl: AirportsToggleControl | null = null
let militaryBasesControl: MilitaryBasesToggleControl | null = null
let aaraControl: AaraToggleControl | null = null
let awacsControl: AwacToggleControl | null = null
let clearControl: ClearOverlaysControl | null = null
// Sentry sites are plotted on every domain map, not just this one — see
// SentrySitesControl. No side-menu button: the sites are always shown.
let sentrySitesControl: SentrySitesControl | null = null

// Borders have no rail button: Settings › Map is their only switch, and
// this map follows it through the shared basemap store.
const basemapLayerSync = useBasemapLayerSync(() => _map, ['borders'])

// Reload the offline basemap/terrain tiles when a download job completes
// while this map is showing the offline style — see the composable's doc.
const offlineTierRefresh = useOfflineTierRefresh(
  () => _map,
  () => !appStore.isOnline,
  () => terrainControl,
)

// Expose for AirSideMenu
const getAdsbControl = () => adsbControl
const getAdsbLabels = () => adsbLabelsControl
const getRangeRings = () => rangeRingsControl
const getRoadsControl = () => roadsControl
const getNamesControl = () => namesControl
const getAirports = () => airportsControl
const getMilBases = () => militaryBasesControl
const getAara = () => aaraControl
const getAwacs = () => awacsControl
const getClearControl = () => clearControl

defineExpose({
  getAdsbControl,
  getAdsbLabels,
  getRangeRings,
  getRoadsControl,
  getNamesControl,
  getAirports,
  getMilBases,
  getAara,
  getAwacs,
  getClearControl,
  is3DActive,
  getTargetPitch,
  getMap: () => _map,
})

/**
 * Re-add everything this map draws on top of the basemap. `setStyle` discards
 * every source and layer the controls added, so this runs after each style
 * reload — whether the swap came from connectivity or from a theme change.
 */
function reinitAfterStyleLoad(): void {
  roadsControl?.applyVisibility()
  namesControl?.applyVisibility()
  basemapLayerSync.apply()
  terrainControl?.initLayers()
  rangeRingsControl?._initRings()
  overheadZoneControl?.reinit()
  airportsControl?.initLayers()
  militaryBasesControl?.initLayers()
  aaraControl?.initLayers()
  awacsControl?.initLayers()
  adsbControl?.initLayers()
  adsbControl?.handleConnectivityChange()
  offlineTierRefresh.applyCurrentVersion()
}

/** Load `styleUrl` if it isn't already loaded, re-adding the overlays after. */
function syncStyleToState(): boolean {
  const m = _map
  if (!m) return false
  const targetStyle = styleUrl.value
  if (_currentStyleUrl === targetStyle) return false
  _currentStyleUrl = targetStyle
  setMapStyle(m, targetStyle)
  m.once('style.load', reinitAfterStyleLoad)
  return true
}

useConnectivity(() => {
  // A reload switches the ADS-B feed as part of re-adding the layers; when the
  // style was already correct, that still has to happen on its own.
  if (!syncStyleToState()) adsbControl?.handleConnectivityChange()
})

// A theme change is the same operation as a connectivity change: reload the
// basemap, then put the overlays back.
watch(() => themeStore.mapTheme, syncStyleToState)

function onMapCreated(m: MapLibreGlMap) {
  _map = m
  _currentStyleUrl = styleUrl.value
  startLocation()
  _locationMarker.addTo(m)
  ctxMenu.attach(m)
}

function onStyleLoaded(m: MapLibreGlMap) {
  basemapLayerSync.apply()
  if (adsbControl) return // already initialised (style reload handled by connectivity hook)

  adsbLabelsControl = new AdsbLabelsToggleControl(airStore, null)

  adsbControl = new AdsbLiveControl(
    airStore,
    notificationsStore,
    trackingStore,
    airNotifStore,
    is3DActive,
    getTargetPitch,
    (v: boolean) => adsbLabelsControl?.syncToAdsb(v),
  )

  // Wire labels back to adsb
  ;(adsbLabelsControl as unknown as { _adsbControl: AdsbLiveControl | null })._adsbControl =
    adsbControl

  // The ADS-B filters are the one pair the control does not seed from the store
  // itself, so the stored choice is applied as it is built. (The store holds
  // them as "shown"; the control takes "hide".)
  adsbControl.setHideGroundVehicles(!airStore.overlayStates.groundVehicles)
  adsbControl.setHideTowers(!airStore.overlayStates.towers)

  rangeRingsControl = new RangeRingsControl(airStore, ringOrigin.value)
  overheadZoneControl = new OverheadZoneControl(activeZones.value)
  // Overhead-alert detection runs app-wide in useAirAlertsService (fires from
  // any section). AirMap keeps only the visual OverheadZoneControl ring. We
  // still register the aircraft-click handler so clicking an overhead alert
  // selects the plane while the Air map is mounted.
  registerAircraftClickHandler((hex: string) => {
    adsbControl?.selectByHex(hex)
  })
  roadsControl = new RoadsToggleControl(basemapStore)
  namesControl = new NamesToggleControl(basemapStore)
  terrainControl = new TerrainToggleControl(basemapStore, offlineMapsStore)
  airportsControl = new AirportsToggleControl(airStore)
  militaryBasesControl = new MilitaryBasesToggleControl(airStore, is3DActive)
  aaraControl = new AaraToggleControl(airStore)
  awacsControl = new AwacToggleControl(airStore)

  clearControl = new ClearOverlaysControl({
    adsb: adsbControl,
    adsbLabels: adsbLabelsControl,
    roads: roadsControl,
    names: namesControl,
    rangeRings: rangeRingsControl,
    airports: airportsControl,
    militaryBases: militaryBasesControl,
    aara: aaraControl,
    awacs: awacsControl,
  })

  // Initialise each control (onAdd sets this.map and triggers layer/source setup).
  // The returned container elements are discarded — AirSideMenu owns the UI buttons.
  adsbControl.onAdd(m)
  adsbLabelsControl.onAdd(m)
  rangeRingsControl.onAdd(m)
  roadsControl.onAdd(m)
  namesControl.onAdd(m)
  terrainControl.onAdd(m)
  airportsControl.onAdd(m)
  militaryBasesControl.onAdd(m)
  aaraControl.onAdd(m)
  awacsControl.onAdd(m)
  overheadZoneControl.onAdd(m)
  sentrySitesControl = new SentrySitesControl(sentrySitesStore, settingsStore, {
    // The operator's own position joins the grouping pass, so a Sentry sitting
    // on top of it collapses into a count instead of two marks smearing
    // together; the marker is handed over so the count can stand in for it.
    getUserLocation,
    userMarker: _locationMarker,
  })
  sentrySitesControl.onAdd(m)

  // If connectivity mode or theme changed between map creation and style load
  // (e.g. the offgrid probe fired before _map was set, so the callback was a
  // no-op), the map has loaded the wrong style. Correct it now that the
  // controls exist to be re-added.
  if (!syncStyleToState()) offlineTierRefresh.applyCurrentVersion()
}

// Drop the marker. Bound both to the userLocation watcher (null transition) and
// to sentinel:userLocationCleared so a config-clear is deterministic even if the
// watcher already ran with a stale
// localStorage seed on reload (ordering-independent). The range rings are not
// handled here: they follow the ring origin, which only tracks the location
// when that is what the operator chose to centre on.
function _clearLocationVisuals(): void {
  _locationMarker.remove()
}

// The sidebar's ALL / CIVIL / MILITARY tabs write the store; the control
// (non-reactive) follows here, and the search list is told to re-filter.
watch(
  () => airStore.adsbTypeFilter,
  (mode) => {
    if (!adsbControl) return
    if (adsbControl._allHidden) adsbControl.setAllHidden(false)
    adsbControl.setTypeFilter(mode)
    document.dispatchEvent(new CustomEvent('adsb-filter-change'))
  },
)

onMounted(() => {
  window.addEventListener('sentinel:userLocationCleared', _clearLocationVisuals)
  watch(
    userLocation,
    (loc) => {
      if (!loc) {
        // Location was cleared (e.g. config emptied). Drop the marker; the
        // overhead zones follow the alert locations, and the operator's own
        // entry disappears from that list with the fix.
        _clearLocationVisuals()
        return
      }
      _locationMarker.update(loc.lon, loc.lat)
    },
    { immediate: true },
  )

  // The rings follow the chosen origin, not the operator. A null origin (no
  // location set, or a pinned Sentry with no position yet) hides them, which is
  // the same rule as before — it just now has three ways of being satisfied.
  watch(ringOrigin, (origin) => rangeRingsControl?.setOrigin(origin), { immediate: true })

  // Settings > Map Layers writes the same overlay flags the rail buttons do, so
  // the map follows the store rather than either surface. Each control keeps its
  // own `visible` and flips it through `toggle()`, so the sync is "toggle when
  // the control and the store disagree" — which also makes a rail click, whose
  // own toggle already wrote the store, a no-op here.
  function syncOverlay(
    isOn: () => boolean,
    control: () => { visible: boolean; toggle: () => void } | null,
  ): void {
    watch(isOn, (on) => {
      const c = control()
      if (c && c.visible !== on) c.toggle()
    })
  }
  syncOverlay(
    () => airStore.overlayStates.airports,
    () => airportsControl,
  )
  syncOverlay(
    () => airStore.overlayStates.militaryBases,
    () => militaryBasesControl,
  )
  syncOverlay(
    () => airStore.overlayStates.aara,
    () => aaraControl,
  )
  syncOverlay(
    () => airStore.overlayStates.awacs,
    () => awacsControl,
  )
  watch(
    () => airStore.overlayStates.rangeRings,
    (on) => {
      if (rangeRingsControl && rangeRingsControl.ringsVisible !== on) {
        rangeRingsControl.handleClickPublic()
      }
    },
  )
  // Ground vehicles and towers are ADS-B filters rather than layers, and the
  // store holds them as "shown", which is the inverse of the control's "hide".
  watch(
    () => airStore.overlayStates.groundVehicles,
    (shown) => adsbControl?.setHideGroundVehicles(!shown),
  )
  watch(
    () => airStore.overlayStates.towers,
    (shown) => adsbControl?.setHideTowers(!shown),
  )
  // Place names are a shared base-map layer, so this one follows the basemap
  // store — and is equally how the Land map's own names button reaches this map.
  watch(
    () => basemapStore.layers.names,
    (on) => namesControl?.setVisible(on),
  )
  // Terrain contours likewise — one shared choice across Air, Sea and Land.
  watch(
    () => basemapStore.layers.terrain,
    (on) => terrainControl?.setVisible(on),
  )
  // Roads are a shared base-map layer too: follow the store whether the change
  // came from this map's rail, another map, or Settings › Map › Map Layers.
  watch(
    () => basemapStore.layers.roads,
    (on) => roadsControl?.setVisible(on),
  )

  // Only the drawn zones are driven here; overhead-alert detection lives in
  // useAirAlertsService, off the same list.
  watch(activeZones, (zones) => overheadZoneControl?.setZones(zones), { immediate: true })
})

onBeforeUnmount(() => {
  clearAircraftClickHandler()
  window.removeEventListener('sentinel:userLocationCleared', _clearLocationVisuals)
  const m = _map
  ctxMenu.detach(m)
  if (m) {
    const center = m.getCenter()
    airStore.saveMapState([center.lng, center.lat], m.getZoom(), m.getPitch())
  }
  _map = null
  adsbControl?.onRemove()
  adsbLabelsControl?.onRemove()
  rangeRingsControl?.onRemove()
  roadsControl?.onRemove()
  namesControl?.onRemove()
  terrainControl?.onRemove()
  airportsControl?.onRemove()
  militaryBasesControl?.onRemove()
  aaraControl?.onRemove()
  awacsControl?.onRemove()
  overheadZoneControl?.onRemove()
  adsbControl = null
  adsbLabelsControl = null
  rangeRingsControl = null
  overheadZoneControl = null
  roadsControl = null
  namesControl = null
  terrainControl = null
  airportsControl = null
  militaryBasesControl = null
  aaraControl = null
  awacsControl = null
  clearControl = null
})
</script>
