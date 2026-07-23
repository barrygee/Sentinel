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
import { ref, computed, onUnmounted } from 'vue'
import type { Map } from 'maplibre-gl'
import { useAppStore } from '@/stores/app'
import { useLandStore } from '@/stores/land'
import { useConnectivity } from '@/composables/useConnectivity'
import MapLibreMap from '@/components/shared/MapLibreMap.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import { AprsStationsControl } from '@/components/land/controls/aprs/AprsStationsControl'

const appStore = useAppStore()
const landStore = useLandStore()
const mapRef = ref<InstanceType<typeof MapLibreMap> | null>(null)

let _map: Map | null = null
let _initialStyleUrl: string | null = null
let _aprsControl: AprsStationsControl | null = null

const styleUrl = computed(() =>
  appStore.isOnline ? '/assets/fiord-online.json' : '/assets/fiord.json',
)

useConnectivity((online) => {
  _map?.setStyle(online ? '/assets/fiord-online.json' : '/assets/fiord.json')
})

function onMapCreated(m: Map) {
  _map = m
  _initialStyleUrl = styleUrl.value
  // Plot APRS stations heard by the SDR APRS decoder (the first real Land
  // control). The control owns its polling + markers + a11y table.
  _aprsControl = new AprsStationsControl(landStore)
  m.addControl(_aprsControl, 'top-right')
}

onUnmounted(() => {
  if (_map && _aprsControl) _map.removeControl(_aprsControl)
  _aprsControl = null
})
function onStyleLoaded(m: Map) {
  const desiredStyle = styleUrl.value
  if (_initialStyleUrl !== null && _initialStyleUrl !== desiredStyle) {
    m.setStyle(desiredStyle)
  }
  _initialStyleUrl = null
}
</script>
