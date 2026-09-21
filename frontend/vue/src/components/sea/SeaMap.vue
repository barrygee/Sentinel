<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="styleUrl"
    region-label="Sea domain map — live vessels"
    region-description="Interactive map of live AIS vessels. The same vessels are also listed, with full details and keyboard access, in the Filter panel of the map sidebar."
    :center="seaStore.mapCenter ?? [-2, 54]"
    :zoom="seaStore.mapZoom ?? 6"
    @map-created="onMapCreated"
    @style-loaded="onStyleLoaded"
  />
</template>

<script setup lang="ts">
// IMPORTANT: the map instance is stored in a plain variable — never in
// ref/reactive — and every IControl receives Pinia stores, never window globals.
// Mirrors AirMap.vue: the same style, connectivity restyle and control wiring,
// so the Sea map reads and behaves exactly like the Air map.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { setMapStyle } from '@/utils/mapStyle'
import { useAppStore } from '@/stores/app'
import { useSeaStore } from '@/stores/sea'
import { useBasemapStore } from '@/stores/basemap'
import { useSettingsStore } from '@/stores/settings'
import { useSentrySitesStore } from '@/stores/sentrySites'
import { useConnectivity } from '@/composables/useConnectivity'
import { useUserLocation } from '@/composables/useUserLocation'
import { useRangeRingOrigin } from '@/composables/useRangeRingOrigin'
import { useMapContextMenu } from '@/composables/useMapContextMenu'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'
import { UserLocationMarker } from '@/components/shared/UserLocationMarker'
import { NamesToggleControl } from '@/components/shared/controls/names/NamesToggleControl'
import { RoadsToggleControl } from '@/components/shared/controls/roads/RoadsToggleControl'
import { TerrainToggleControl } from '@/components/shared/controls/terrain/TerrainToggleControl'
import { SentrySitesControl } from '@/components/shared/controls/sentry-sites/SentrySitesControl'
import { LandRangeRingsControl } from '@/components/land/controls/range-rings/LandRangeRingsControl'
import { AisVesselsControl } from './controls/vessels/AisVesselsControl'
import { FerryRoutesControl } from './controls/ferry-routes/FerryRoutesControl'
import { PortsControl } from './controls/ports/PortsControl'

const appStore = useAppStore()
const seaStore = useSeaStore()
const basemapStore = useBasemapStore()
const settingsStore = useSettingsStore()
const sentrySitesStore = useSentrySitesStore()

const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const STYLE_ONLINE = '/assets/fiord-online.json'
const STYLE_OFFLINE = '/assets/fiord.json'
const styleUrl = computed(() => (appStore.isOnline ? STYLE_ONLINE : STYLE_OFFLINE))

// User location drives the "go to my location" button and the on-map marker.
const { location: userLocation, start: startLocation } = useUserLocation()
const getUserLocation = (): [number, number] | null =>
  userLocation.value ? [userLocation.value.lon, userLocation.value.lat] : null
const _locationMarker = new UserLocationMarker('user-location-marker')

// Where the range rings are centred — shared app-wide with the Air/Land maps.
const { origin: ringOrigin } = useRangeRingOrigin()
const ctxMenu = useMapContextMenu()

let _map: MapLibreGlMap | null = null
let _currentStyleUrl: string | null = null

// Control instances — plain variables, initialised in onStyleLoaded.
let vesselsControl: AisVesselsControl | null = null
let ferryRoutesControl: FerryRoutesControl | null = null
let portsControl: PortsControl | null = null
let rangeRingsControl: LandRangeRingsControl | null = null
let roadsControl: RoadsToggleControl | null = null
let namesControl: NamesToggleControl | null = null
let terrainControl: TerrainToggleControl | null = null
// Sentry sites are plotted on every domain map — no side-menu button.
let sentrySitesControl: SentrySitesControl | null = null

defineExpose({
  getVesselsControl: () => vesselsControl,
  getFerryRoutes: () => ferryRoutesControl,
  getPorts: () => portsControl,
  getRangeRings: () => rangeRingsControl,
  getMap: () => _map,
})

function _reinitAfterStyle(): void {
  roadsControl?.applyVisibility()
  namesControl?.applyVisibility()
  terrainControl?.initLayers()
  rangeRingsControl?._initRings()
  vesselsControl?.initLayers()
  ferryRoutesControl?.initLayers()
  portsControl?.initLayers()
}

useConnectivity((online) => {
  const m = _map
  if (!m) return
  const targetStyle = online ? STYLE_ONLINE : STYLE_OFFLINE
  if (_currentStyleUrl === targetStyle) return
  _currentStyleUrl = targetStyle
  setMapStyle(m, targetStyle)
  m.once('style.load', _reinitAfterStyle)
})

function onMapCreated(m: MapLibreGlMap) {
  _map = m
  _currentStyleUrl = styleUrl.value
  startLocation()
  _locationMarker.addTo(m)
  ctxMenu.attach(m)
}

function onStyleLoaded(m: MapLibreGlMap) {
  if (vesselsControl) return // already initialised (style reload handled above)

  vesselsControl = new AisVesselsControl(seaStore)
  ferryRoutesControl = new FerryRoutesControl(seaStore)
  portsControl = new PortsControl(seaStore)
  rangeRingsControl = new LandRangeRingsControl(ringOrigin.value)
  roadsControl = new RoadsToggleControl(basemapStore)
  namesControl = new NamesToggleControl(basemapStore)
  terrainControl = new TerrainToggleControl(basemapStore)
  sentrySitesControl = new SentrySitesControl(sentrySitesStore, settingsStore, {
    getUserLocation,
    userMarker: _locationMarker,
  })

  // onAdd wires each control to the map; the returned buttons are discarded —
  // SeaSideMenu owns the visible controls.
  vesselsControl.onAdd(m)
  // After the vessel layers exist, so the routes slot in beneath them.
  ferryRoutesControl.onAdd(m)
  portsControl.onAdd(m)
  rangeRingsControl.onAdd(m)
  roadsControl.onAdd(m)
  namesControl.onAdd(m)
  // Place names are always on at sea — a chart without them is hard to read
  // and the rail has no toggle — whatever the shared basemap choice says.
  namesControl.setVisible(true)
  terrainControl.onAdd(m)
  sentrySitesControl.onAdd(m)

  const nativeCtrl = m.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-top-right')
  if (nativeCtrl) nativeCtrl.style.display = 'none'

  // The connectivity probe may have flipped before _map was set; correct the
  // style now that the controls exist to re-init on it.
  const desiredStyle = styleUrl.value
  if (_currentStyleUrl !== desiredStyle) {
    _currentStyleUrl = desiredStyle
    setMapStyle(m, desiredStyle)
    m.once('style.load', _reinitAfterStyle)
  }
}

function _clearLocationVisuals(): void {
  _locationMarker.remove()
}

onMounted(() => {
  window.addEventListener('sentinel:userLocationCleared', _clearLocationVisuals)
  watch(
    userLocation,
    (loc) => {
      if (!loc) {
        _clearLocationVisuals()
        return
      }
      _locationMarker.update(loc.lon, loc.lat)
    },
    { immediate: true },
  )
  watch(ringOrigin, (origin) => rangeRingsControl?.setOrigin(origin), { immediate: true })
  // The store is the truth for every overlay, so a Settings toggle, the rail,
  // or a default-layers hydrate all reach the map the same way.
  watch(
    () => seaStore.overlayStates.rangeRings,
    (on) => {
      if (rangeRingsControl && rangeRingsControl.visible !== on) {
        rangeRingsControl.handleClickPublic()
      }
    },
  )
  watch(
    () => seaStore.overlayStates.ferryRoutes,
    () => ferryRoutesControl?.applyVisibility(),
  )
  watch(
    () => seaStore.overlayStates.ports,
    () => portsControl?.applyVisibility(),
  )
  // Terrain relief/contours are a shared base-map layer, so this map follows
  // the basemap store — whether flipped on its own rail, another map, or Settings.
  watch(
    () => basemapStore.layers.terrain,
    (on) => terrainControl?.setVisible(on),
  )
  // Seed the overlays from the default-layers config once it is known. The
  // store only honours it until the operator has made a choice of their own.
  void seaStore.hydrateDefaultLayers()
  watch(
    () => seaStore.defaultLayers,
    (layers) => seaStore.applyDefaultLayers(layers),
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('sentinel:userLocationCleared', _clearLocationVisuals)
  const m = _map
  ctxMenu.detach(m)
  if (m) {
    const center = m.getCenter()
    seaStore.saveMapState([center.lng, center.lat], m.getZoom())
  }
  _map = null
  vesselsControl?.onRemove()
  ferryRoutesControl?.onRemove()
  portsControl?.onRemove()
  rangeRingsControl?.onRemove()
  roadsControl?.onRemove()
  namesControl?.onRemove()
  terrainControl?.onRemove()
  sentrySitesControl?.onRemove()
  _locationMarker.remove()
  vesselsControl = null
  ferryRoutesControl = null
  rangeRingsControl = null
  roadsControl = null
  namesControl = null
  terrainControl = null
  sentrySitesControl = null
})
</script>
