<template>
  <div id="map-wrap" data-domain="land">
    <h1 class="sr-only">Land domain</h1>
    <NoUrlOverlay domain="land" />
    <MapLibreMap
      ref="mapRef"
      :style-url="styleUrl"
      region-label="Land domain map"
      :center="[-2, 54]"
      :zoom="6"
      @map-created="onMapCreated"
      @style-loaded="onStyleLoaded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { Map, IControl } from 'maplibre-gl'
import { useAppStore } from '@/stores/app'
import { useLandStore } from '@/stores/land'
import { useConnectivity } from '@/composables/useConnectivity'
import { useUserLocation } from '@/composables/useUserLocation'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import { UserLocationMarker } from '@/components/shared/UserLocationMarker'
import { AprsStationsControl } from '@/components/land/controls/aprs/AprsStationsControl'
import { LandZoomControl } from '@/components/land/controls/zoom/LandZoomControl'
import { LandLocateControl } from '@/components/land/controls/locate/LandLocateControl'
import { LandRangeRingsControl } from '@/components/land/controls/range-rings/LandRangeRingsControl'

const appStore = useAppStore()
const landStore = useLandStore()
const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

// User location drives the "go to my location" button, the range rings' centre,
// and the on-map location marker (shared app-wide via useUserLocation).
const { location: userLocation, start: startLocation } = useUserLocation()
const getUserLocation = (): [number, number] | null =>
  userLocation.value ? [userLocation.value.lon, userLocation.value.lat] : null
const _locationMarker = new UserLocationMarker('user-location-marker')

let _map: Map | null = null
let _initialStyleUrl: string | null = null
// All added controls, for teardown. The range-rings control is also kept by name
// because the user-location watcher re-centres it live.
let _controls: IControl[] = []
let _rangeRingsControl: LandRangeRingsControl | null = null

const styleUrl = computed(() =>
  appStore.isOnline ? '/assets/fiord-online.json' : '/assets/fiord.json',
)

useConnectivity((online) => {
  _map?.setStyle(online ? '/assets/fiord-online.json' : '/assets/fiord.json')
})

function onMapCreated(m: Map) {
  _map = m
  _initialStyleUrl = styleUrl.value

  // Navigation controls (top-right, stacked): zoom, go-to-my-location, range
  // rings, then the APRS stations overlay toggle. The APRS control owns its own
  // polling + markers + a11y table (the first real Land control).
  _rangeRingsControl = new LandRangeRingsControl(getUserLocation)
  _controls = [
    new LandZoomControl(),
    new LandLocateControl(getUserLocation),
    _rangeRingsControl,
    new AprsStationsControl(landStore),
  ]
  for (const control of _controls) m.addControl(control, 'top-right')

  // Begin resolving the user's location and show its marker.
  startLocation()
  _locationMarker.addTo(m)
}

onMounted(() => {
  // Keep the location marker + range-rings centre in sync with the live fix.
  watch(
    userLocation,
    (location) => {
      if (!location) {
        _locationMarker.remove()
        _rangeRingsControl?.setLocationAvailable(false)
        return
      }
      _locationMarker.update(location.lon, location.lat)
      _rangeRingsControl?.updateCenter(location.lon, location.lat)
      _rangeRingsControl?.setLocationAvailable(true)
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  if (_map) for (const control of _controls) _map.removeControl(control)
  _locationMarker.remove()
  _controls = []
  _rangeRingsControl = null
})

function onStyleLoaded(m: Map) {
  const desiredStyle = styleUrl.value
  if (_initialStyleUrl !== null && _initialStyleUrl !== desiredStyle) {
    m.setStyle(desiredStyle)
  }
  _initialStyleUrl = null
}
</script>
