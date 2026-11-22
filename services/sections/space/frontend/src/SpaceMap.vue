<template>
  <MapLibreMap
    ref="mapRef"
    :style-url="sectionMap.styleUrl.value"
    region-label="Space domain map — satellites"
    region-description="Interactive map of satellites and their ground tracks. Satellites are listed in the Filter panel, and upcoming overhead passes in the Passes panel, of the map sidebar — both keyboard and screen-reader accessible."
    :center="spaceStore.mapCenter ?? [0, 30]"
    :zoom="spaceStore.mapZoom ?? 2"
    @map-created="sectionMap.onMapCreated"
    @style-loaded="sectionMap.onStyleLoaded"
  />
</template>

<script setup lang="ts">
import { useSectionReplay } from '@sentinel/shell-api/playback/useSectionReplay'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'
import { ref, shallowRef, onBeforeUnmount, nextTick } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { useSpaceStore } from './stores/space'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import {
  registerSatelliteClickHandler,
  clearSatelliteClickHandler,
} from './satelliteNotificationTarget'
import { useTrackingStore } from '@sentinel/shell-api/stores/tracking'
import { useSdrManagerSitesStore } from '@sentinel/shell-api/stores/sdrManagerSites'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useSectionMapStyle } from '@sentinel/map-kit/composables/useSectionMapStyle'
import MapLibreMap from '@sentinel/map-kit/MapLibreMap.vue'
import { SatelliteControl } from './controls/satellite/SatelliteControl'
import { DaynightControl } from './controls/daynight/DaynightControl'
import { NamesToggleControl } from '@sentinel/map-kit/controls/names/NamesToggleControl'
import { SdrManagerSitesControl } from '@sentinel/map-kit/controls/sdr-manager-sites/SdrManagerSitesControl'

const spaceStore = useSpaceStore()
const basemapStore = useBasemapStore()
const sdrManagerSitesStore = useSdrManagerSitesStore()
const settingsStore = useSettingsStore()
const notificationsStore = useNotificationsStore()
const trackingStore = useTrackingStore()

const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

const satelliteControlRef = shallowRef<SatelliteControl | null>(null)
let satelliteControl: SatelliteControl | null = null
let daynightControl: DaynightControl | null = null
let namesControl: NamesToggleControl | null = null
// SDR host sites are plotted on every domain map, this one included — see
// SdrManagerSitesControl. Added without a button: the sites are always shown.
let sdrManagerSitesControl: SdrManagerSitesControl | null = null

// The basemap, its reloads on connectivity and theme changes, the operator's
// position marker and the context menu — shared with the Air and Sea maps.
const sectionMap = useSectionMapStyle({
  initOverlays: addControls,
  reinitOverlays: reinitAfterStyleLoad,
  // Roads and borders have no button on this map's rail: Settings › Map is
  // their only switch. Space has no terrain overlay, so no terrain control.
  basemapLayerGroups: ['roads', 'borders'],
  markerClassName: 'space-user-location-marker',
})
const getUserLocation = sectionMap.getUserLocation

/** Re-add the overlays this map owns after a basemap reload. */
function reinitAfterStyleLoad(): void {
  daynightControl?.initLayers()
  namesControl?.applyVisibility()
  satelliteControl?.initLayers()
}

function onGoToLocation(): void {
  const m = sectionMap.getMap()
  const location = getUserLocation()
  if (!m || !location) return
  m.flyTo({ center: location, zoom: Math.max(m.getZoom(), 5) })
}

useDocumentEvent('space-go-to-location', onGoToLocation)

// Replay (Settings › SPACE › History & Replay): positions, ground tracks,
// footprints and the terminator are recomputed for the replayed moment;
// everything else on the map carries on as it is.
const playback = usePlaybackStore()
useSectionReplay('space', {
  enter: () => {
    satelliteControl?.setReplaying(true)
    daynightControl?.setReplaying(true)
  },
  exit: () => {
    satelliteControl?.setReplaying(false)
    daynightControl?.setReplaying(false)
  },
  jumped: () => {
    void satelliteControl?._fetch()
    void daynightControl?._fetch()
  },
})

/** Build and add this map's controls, once, on the first style load. */
function addControls(m: MapLibreGlMap): void {
  satelliteControl = new SatelliteControl(
    spaceStore,
    notificationsStore,
    trackingStore,
    getUserLocation,
    null,
  )
  void nextTick(() => {
    satelliteControlRef.value = satelliteControl
  })
  daynightControl = new DaynightControl(spaceStore)
  namesControl = new NamesToggleControl(basemapStore)

  sdrManagerSitesControl = new SdrManagerSitesControl(sdrManagerSitesStore, settingsStore, {
    // The operator's own position joins the grouping pass, so an SDR host sitting
    // on top of it collapses into a count instead of two marks smearing
    // together; the marker is handed over so the count can stand in for it.
    getUserLocation,
    userMarker: sectionMap.locationMarker,
  })
  sdrManagerSitesControl.onAdd(m)

  m.addControl(satelliteControl, 'top-right')
  m.addControl(daynightControl, 'top-right')
  m.addControl(namesControl, 'top-right')
  // Opened mid-replay (SPACE was left while replaying): start on the replayed moment.
  if (playback.isReplaying('space')) {
    satelliteControl.setReplaying(true)
    daynightControl.setReplaying(true)
  }

  // Clicking a satellite alert centres it in the viewport here (no follow).
  // Registering drains any pending target stashed when the alert was clicked
  // from another section.
  registerSatelliteClickHandler((noradId, name) => {
    satelliteControl?.focusSatellite(noradId, name)
  })

  // Hide the MapLibre native top-right control container — space side menu replaces it
  const ctrlEl = m.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-top-right')
  if (ctrlEl) ctrlEl.style.display = 'none'
}

onBeforeUnmount(() => {
  const m = sectionMap.releaseMap()
  if (m) {
    const center = m.getCenter()
    spaceStore.saveMapState([center.lng, center.lat], m.getZoom())
  }
  sdrManagerSitesControl?.onRemove()
  sdrManagerSitesControl = null
  satelliteControl = null
  daynightControl = null
  namesControl = null
  satelliteControlRef.value = null
  clearSatelliteClickHandler()
})

defineExpose({
  getSatelliteControl: () => satelliteControl,
  get satelliteControlReactive() {
    return satelliteControlRef.value
  },
  getDaynightControl: () => daynightControl,
  getNamesControl: () => namesControl,
  getMap: sectionMap.getMap,
})
</script>

<style>
.iss-label {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(var(--shadow-rgb), 0.5);
  color: var(--overlay-ink);
  font-family: 'Barlow Condensed', 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 10px;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.iss-label.iss-label--tracking {
  pointer-events: auto;
  cursor: pointer;
}

.iss-tracking-badge {
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  transition: color 0.2s;
}

.iss-tracking-badge.iss-tracking-badge--hidden {
  display: none;
}
</style>
