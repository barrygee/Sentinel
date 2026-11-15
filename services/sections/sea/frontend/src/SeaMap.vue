<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="sectionMap.styleUrl.value"
    region-label="Sea domain map — live vessels"
    region-description="Interactive map of live AIS vessels. The same vessels are also listed, with full details and keyboard access, in the Filter panel of the map sidebar."
    :center="seaStore.mapCenter ?? [-2, 54]"
    :zoom="seaStore.mapZoom ?? 6"
    @map-created="sectionMap.onMapCreated"
    @style-loaded="sectionMap.onStyleLoaded"
  />
</template>

<script setup lang="ts">
// IMPORTANT: the map instance is stored in a plain variable — never in
// ref/reactive — and every IControl receives Pinia stores, never window globals.
// Shares the style lifecycle with AirMap.vue (useSectionMapStyle), so the Sea
// map reads and behaves exactly like the Air map.
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { useSeaStore } from './stores/sea'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useSdrManagerSitesStore } from '@sentinel/shell-api/stores/sdrManagerSites'
import { useSectionMapStyle } from '@sentinel/map-kit/composables/useSectionMapStyle'
import { useRangeRingOrigin } from '@sentinel/map-kit/composables/useRangeRingOrigin'
import { useOfflineMapsStore } from '@sentinel/shell-api/stores/offlineMaps'
import MapLibreMap from '@sentinel/map-kit/MapLibreMap.vue'
import { NamesToggleControl } from '@sentinel/map-kit/controls/names/NamesToggleControl'
import { RoadsToggleControl } from '@sentinel/map-kit/controls/roads/RoadsToggleControl'
import { TerrainToggleControl } from '@sentinel/map-kit/controls/terrain/TerrainToggleControl'
import { SdrManagerSitesControl } from '@sentinel/map-kit/controls/sdr-manager-sites/SdrManagerSitesControl'
import { LandRangeRingsControl } from '@sentinel/map-kit/controls/range-rings/LandRangeRingsControl'
import { AisVesselsControl } from './controls/vessels/AisVesselsControl'
import { FerryRoutesControl } from './controls/ferry-routes/FerryRoutesControl'
import { PortsControl } from './controls/ports/PortsControl'

const seaStore = useSeaStore()
const basemapStore = useBasemapStore()
const settingsStore = useSettingsStore()
const sdrManagerSitesStore = useSdrManagerSitesStore()
const offlineMapsStore = useOfflineMapsStore()

const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

// Where the range rings are centred — shared app-wide with the Air/Land maps.
const { origin: ringOrigin } = useRangeRingOrigin()

// Control instances — plain variables, initialised in onStyleLoaded.
let vesselsControl: AisVesselsControl | null = null
let ferryRoutesControl: FerryRoutesControl | null = null
let portsControl: PortsControl | null = null
let rangeRingsControl: LandRangeRingsControl | null = null
let roadsControl: RoadsToggleControl | null = null
let namesControl: NamesToggleControl | null = null
let terrainControl: TerrainToggleControl | null = null
// SDR host sites are plotted on every domain map — no side-menu button.
let sdrManagerSitesControl: SdrManagerSitesControl | null = null

// The basemap, its reloads on connectivity and theme changes, the operator's
// position marker and the context menu — shared with the Air map.
const sectionMap = useSectionMapStyle({
  initOverlays: addControls,
  reinitOverlays: reinitAfterStyleLoad,
  getTerrainControl: () => terrainControl,
})

defineExpose({
  getVesselsControl: () => vesselsControl,
  getFerryRoutes: () => ferryRoutesControl,
  getPorts: () => portsControl,
  getRangeRings: () => rangeRingsControl,
  getMap: sectionMap.getMap,
})

/** Re-add everything this map draws on top of the basemap after a style reload. */
function reinitAfterStyleLoad(): void {
  roadsControl?.applyVisibility()
  namesControl?.applyVisibility()
  terrainControl?.initLayers()
  rangeRingsControl?._initRings()
  vesselsControl?.initLayers()
  ferryRoutesControl?.initLayers()
  portsControl?.initLayers()
}

/** Build and add this map's controls, once, on the first style load. */
function addControls(m: MapLibreGlMap): void {
  vesselsControl = new AisVesselsControl(seaStore)
  ferryRoutesControl = new FerryRoutesControl(seaStore)
  portsControl = new PortsControl(seaStore)
  rangeRingsControl = new LandRangeRingsControl(ringOrigin.value)
  roadsControl = new RoadsToggleControl(basemapStore)
  namesControl = new NamesToggleControl(basemapStore)
  terrainControl = new TerrainToggleControl(basemapStore, offlineMapsStore)
  sdrManagerSitesControl = new SdrManagerSitesControl(sdrManagerSitesStore, settingsStore, {
    getUserLocation: sectionMap.getUserLocation,
    userMarker: sectionMap.locationMarker,
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
  sdrManagerSitesControl.onAdd(m)

  const nativeCtrl = m.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-top-right')
  if (nativeCtrl) nativeCtrl.style.display = 'none'
}

// Re-seed the default layers when the settings change under the app (APPLY
// CHANGES, a config upload or file edit), as the page reload that once followed did.
useDocumentEvent('sentinel:config-uploaded', () => void seaStore.hydrateDefaultLayers())

onMounted(() => {
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
  // Terrain contours are a shared base-map layer, so this map follows
  // the basemap store — whether flipped on its own rail, another map, or Settings.
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
  // Seed the overlays from the default-layers config once it is known (and
  // again when the settings change under the app — APPLY CHANGES, a config
  // upload). The store only honours it until the operator has made a choice
  // of their own.
  void seaStore.hydrateDefaultLayers()
  watch(
    () => seaStore.defaultLayers,
    (layers) => seaStore.applyDefaultLayers(layers),
  )
})

onBeforeUnmount(() => {
  const m = sectionMap.releaseMap()
  if (m) {
    const center = m.getCenter()
    seaStore.saveMapState([center.lng, center.lat], m.getZoom())
  }
  vesselsControl?.onRemove()
  ferryRoutesControl?.onRemove()
  portsControl?.onRemove()
  rangeRingsControl?.onRemove()
  roadsControl?.onRemove()
  namesControl?.onRemove()
  terrainControl?.onRemove()
  sdrManagerSitesControl?.onRemove()
  sectionMap.locationMarker.remove()
  vesselsControl = null
  ferryRoutesControl = null
  rangeRingsControl = null
  roadsControl = null
  namesControl = null
  terrainControl = null
  sdrManagerSitesControl = null
})
</script>
