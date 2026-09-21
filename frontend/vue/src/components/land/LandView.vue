<template>
  <div id="map-wrap" data-domain="land">
    <h1 class="sr-only">Land domain</h1>
    <NoUrlOverlay domain="land" />
    <MapLibreMap
      ref="mapRef"
      :style-url="styleUrl"
      region-label="Land domain map"
      region-description="Interactive map of APRS stations, traffic cameras and UK amateur-radio repeaters. The same items are listed in accessible data tables."
      :center="[-2, 54]"
      :zoom="6"
      @map-created="onMapCreated"
      @style-loaded="onStyleLoaded"
    />
    <LandSideMenu
      :zoom-in="zoomIn"
      :zoom-out="zoomOut"
      :go-to-location="goToLocation"
      :toggle-range-rings="toggleRangeRings"
      :range-rings-active="rangeRingsActive"
      :location-active="locationActive"
    />
    <!-- msb-pane-search lives in MapSidebar, a sibling of <RouterView> in
         App.vue — see useSidebarPaneTarget for why this waits rather than
         teleporting unconditionally. -->
    <Teleport v-if="searchPaneReady" :to="sidebarPaneSelector('search')">
      <LandFilter />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { Map } from 'maplibre-gl'
import { setMapStyle } from '@/utils/mapStyle'
import { useAppStore } from '@/stores/app'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import { useRepeatersStore } from '@/stores/repeaters'
import { useBasemapStore } from '@/stores/basemap'
import { useConnectivity } from '@/composables/useConnectivity'
import { useUserLocation } from '@/composables/useUserLocation'
import { useRangeRingOrigin } from '@/composables/useRangeRingOrigin'
import { useMapContextMenu } from '@/composables/useMapContextMenu'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import LandSideMenu from '@/components/land/LandSideMenu.vue'
import LandFilter from '@/components/land/LandFilter.vue'
import { sidebarPaneSelector } from '@/constants/sidebarPanes'
import { useSidebarPaneTarget } from '@/composables/useSidebarPaneTarget'
import { UserLocationMarker } from '@/components/shared/UserLocationMarker'
import { useSentrySitesStore } from '@/stores/sentrySites'
import { useSettingsStore } from '@/stores/settings'
import { useSdrStore } from '@/stores/sdr'
import { AprsStationsControl } from '@/components/land/controls/aprs/AprsStationsControl'
import { TrafficCamerasControl } from '@/components/land/controls/traffic-cameras/TrafficCamerasControl'
import { RepeatersControl } from '@/components/land/controls/repeaters/RepeatersControl'
import { LandRangeRingsControl } from '@/components/land/controls/range-rings/LandRangeRingsControl'
import { NamesToggleControl } from '@/components/shared/controls/names/NamesToggleControl'
import { SentrySitesControl } from '@/components/shared/controls/sentry-sites/SentrySitesControl'
import { RoadsToggleControl } from '@/components/shared/controls/roads/RoadsToggleControl'
import { TerrainToggleControl } from '@/components/shared/controls/terrain/TerrainToggleControl'

/** Zoom level the map flies to when centring on the user's location. */
const LOCATE_ZOOM = 10

const appStore = useAppStore()
const landStore = useLandStore()
const landFeedsStore = useLandFeedsStore()
const repeatersStore = useRepeatersStore()
const basemapStore = useBasemapStore()
const sentrySitesStore = useSentrySitesStore()
const settingsStore = useSettingsStore()
const sdrStore = useSdrStore()
const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)
const { ready: searchPaneReady } = useSidebarPaneTarget('search')

// User location drives the "go to my location" button and the on-map location
// marker (shared app-wide via useUserLocation).
const { location: userLocation, start: startLocation } = useUserLocation()
const getUserLocation = (): [number, number] | null =>
  userLocation.value ? [userLocation.value.lon, userLocation.value.lat] : null
const _locationMarker = new UserLocationMarker('user-location-marker')

// Where the range rings are centred — your own position by default, but equally
// a Sentry site or a chosen point (see useRangeRingOrigin). Shared app-wide, so
// the Air map and the Settings panel agree with this one.
const { origin: ringOrigin } = useRangeRingOrigin()

// Right-click "SET LOCATION" menu (matches the Air/Space maps). Setting a
// location dispatches sentinel:setUserLocation, which useUserLocation handles
// app-wide; the marker then follows via the userLocation watcher.
const ctxMenu = useMapContextMenu()

let _map: Map | null = null
let _initialStyleUrl: string | null = null
let _aprsControl: AprsStationsControl | null = null
let _trafficCamerasControl: TrafficCamerasControl | null = null
let _repeatersControl: RepeatersControl | null = null
let _rangeRingsControl: LandRangeRingsControl | null = null
let _namesControl: NamesToggleControl | null = null
// Sentry sites are plotted on every domain map, this one included — see
// SentrySitesControl. No side-menu button: the sites are always shown.
let _sentrySitesControl: SentrySitesControl | null = null
let _roadsControl: RoadsToggleControl | null = null
let _terrainControl: TerrainToggleControl | null = null

// APRS has a receiver only once an SDR has been named as the APRS radio in
// Settings → LAND (backed by the same single backend decode bridge the SDR
// panel's APRS button drives). Without one nothing is decoding, so the layer is
// forced off whatever the Settings switch says, rather than offering a layer
// that could only ever be empty.
const aprsSourceConfigured = computed(() => sdrStore.aprsRadioId !== null)
// Reactive toggle state backing the rail's range-rings button.
const rangeRingsActive = ref(false)
const locationActive = computed(() => userLocation.value !== null)

const styleUrl = computed(() =>
  appStore.isOnline ? '/assets/fiord-online.json' : '/assets/fiord.json',
)

useConnectivity((online) => {
  if (_map) setMapStyle(_map, online ? '/assets/fiord-online.json' : '/assets/fiord.json')
})

function onMapCreated(m: Map) {
  _map = m
  _initialStyleUrl = styleUrl.value

  // The map features are IControls that own their layers/markers. We init them
  // directly (onAdd) rather than adding their default buttons — the side menu
  // owns the visible controls — and hide the native control corner.
  _rangeRingsControl = new LandRangeRingsControl(ringOrigin.value)
  _aprsControl = new AprsStationsControl(landStore)
  _trafficCamerasControl = new TrafficCamerasControl(landStore, landFeedsStore)
  _repeatersControl = new RepeatersControl(landStore, repeatersStore)
  // Location names and roads are shared base-map layers driven by the
  // cross-domain basemap store, so Land shows whatever the other domains were
  // last set to. Roads has no button of its own — the control exists purely to
  // apply the stored visibility to this map's style.
  _namesControl = new NamesToggleControl(basemapStore)
  _roadsControl = new RoadsToggleControl(basemapStore)
  _terrainControl = new TerrainToggleControl(basemapStore)
  _sentrySitesControl = new SentrySitesControl(sentrySitesStore, settingsStore, {
    // The operator's own position joins the grouping pass, so a Sentry sitting
    // on top of it collapses into a count instead of two marks smearing
    // together; the marker is handed over so the count can stand in for it.
    getUserLocation,
    userMarker: _locationMarker,
  })
  _sentrySitesControl.onAdd(m)
  _rangeRingsControl.onAdd(m)
  _aprsControl.onAdd(m)
  _trafficCamerasControl.onAdd(m)
  _repeatersControl.onAdd(m)
  _namesControl.onAdd(m)
  _roadsControl.onAdd(m)
  _terrainControl.onAdd(m)
  // APRS starts visible per the land.defaultLayers config (default ["aprs"]),
  // but only once a radio is decoding it.
  _aprsControl.setVisible(aprsSourceConfigured.value && landStore.defaultLayers.includes('aprs'))
  // Traffic cameras and repeaters follow the same config, with no receiver gate.
  _trafficCamerasControl.setVisible(landStore.defaultLayers.includes('trafficCameras'))
  _repeatersControl.setVisible(landStore.defaultLayers.includes('repeaters'))
  rangeRingsActive.value = _rangeRingsControl.visible

  const nativeCtrl = m.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-top-right')
  if (nativeCtrl) nativeCtrl.style.display = 'none'

  // Begin resolving the user's location, show its marker, and enable the
  // right-click "set my location" menu.
  startLocation()
  _locationMarker.addTo(m)
  ctxMenu.attach(m)
}

// ── side-menu handlers ─────────────────────────────────────────────────────
function zoomIn() {
  _map?.zoomIn()
}
function zoomOut() {
  _map?.zoomOut()
}
function goToLocation() {
  const location = getUserLocation()
  if (!_map || !location) return
  _map.flyTo({ center: location, zoom: Math.max(_map.getZoom(), LOCATE_ZOOM) })
}
function toggleRangeRings() {
  _rangeRingsControl?.handleClickPublic()
  rangeRingsActive.value = !rangeRingsActive.value
}

onMounted(() => {
  // The backend resumes the persisted APRS radio on startup, so the database is
  // the truth about whether anything is decoding — the store's localStorage
  // cache can be stale on a browser that never opened the SDR panel.
  void sdrStore.hydrateAprsFromDb()

  // Load the default-layers config, then apply it to the APRS layer (and keep it
  // in sync if the config changes, or if the APRS radio is chosen/cleared).
  void landStore.hydrateDefaultLayers()
  void repeatersStore.hydrateFiltersFromDb()
  watch([() => landStore.defaultLayers, aprsSourceConfigured], ([layers, hasSource]) => {
    _aprsControl?.setVisible(hasSource && layers.includes('aprs'))
  })
  watch(
    () => landStore.defaultLayers,
    (layers) => {
      _trafficCamerasControl?.setVisible(layers.includes('trafficCameras'))
      _repeatersControl?.setVisible(layers.includes('repeaters'))
    },
  )
  // Settings › LAND › Map Layers flips the store flags directly; the controls
  // own polling/loading and the rail button state, so each follows its flag
  // (a no-op when the control itself made the change).
  watch(
    () => landStore.aprsLayerVisible,
    (visible) => _aprsControl?.setVisible(aprsSourceConfigured.value && visible),
  )
  watch(
    () => landStore.trafficCamerasLayerVisible,
    (visible) => _trafficCamerasControl?.setVisible(visible),
  )
  watch(
    () => landStore.repeatersLayerVisible,
    (visible) => _repeatersControl?.setVisible(visible),
  )

  // Keep the location marker in sync with the live fix.
  watch(
    userLocation,
    (location) => {
      if (!location) {
        _locationMarker.remove()
        return
      }
      _locationMarker.update(location.lon, location.lat)
    },
    { immediate: true },
  )

  // The rings follow the chosen origin, not the operator. A null origin (no
  // location set, or a pinned Sentry with no position yet) hides them, which is
  // the same rule as before — it just now has three ways of being satisfied.
  watch(ringOrigin, (origin) => _rangeRingsControl?.setOrigin(origin), { immediate: true })

  // Place names are shared across domains, so this map follows the store too —
  // whether the change came from its own rail button, the Air map, or Settings.
  watch(
    () => basemapStore.layers.names,
    (on) => _namesControl?.setVisible(on),
  )
  watch(
    () => basemapStore.layers.terrain,
    (on) => _terrainControl?.setVisible(on),
  )
})

onUnmounted(() => {
  ctxMenu.detach(_map)
  _rangeRingsControl?.onRemove()
  _aprsControl?.onRemove()
  _trafficCamerasControl?.onRemove()
  _repeatersControl?.onRemove()
  _namesControl?.onRemove()
  _roadsControl?.onRemove()
  _terrainControl?.onRemove()
  _sentrySitesControl?.onRemove()
  _sentrySitesControl = null
  _locationMarker.remove()
  _rangeRingsControl = _aprsControl = null
  _trafficCamerasControl = null
  _repeatersControl = null
  _namesControl = _roadsControl = _terrainControl = null
})

function onStyleLoaded(m: Map) {
  const desiredStyle = styleUrl.value
  if (_initialStyleUrl !== null && _initialStyleUrl !== desiredStyle) {
    setMapStyle(m, desiredStyle)
  }
  _initialStyleUrl = null
  // A fresh style ships with its own layer visibilities, so re-assert the
  // base-map toggles every time one loads.
  _namesControl?.applyVisibility()
  _roadsControl?.applyVisibility()
  _terrainControl?.initLayers()
}
</script>
