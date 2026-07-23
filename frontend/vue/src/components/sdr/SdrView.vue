<script setup lang="ts">
import SdrWaterfall from './SdrWaterfall.vue'
import SdrDecodeDock from './SdrDecodeDock.vue'
import { useSdrStore } from '@/stores/sdr'

// The decoder dock is shown while EITHER digital-voice or APRS decoding is on
// (the DMR / APRS buttons in SdrPanel toggle store.digitalEnabled / aprsEnabled,
// combined into store.decodeDockOpen). The waterfall raises its own bottom to
// make room (see its CSS).
const sdrStore = useSdrStore()
</script>

<template>
  <div id="sdr-page" data-domain="sdr">
    <h1 class="sr-only">SDR — radio spectrum</h1>
    <SdrWaterfall />
    <SdrDecodeDock v-if="sdrStore.decodeDockOpen" />
  </div>
</template>

<style>
/* Dock height ≈ 1/3 of the waterfall's height: with the dock taking a quarter of
   the available area, the waterfall keeps three quarters (dock = 1/3 of that).
   Defined here so both the dock and the waterfall (#sdr-waterfall.decode-open)
   inherit the same value and stay in lockstep. */
#sdr-page {
  --sdr-dock-height: calc((100vh - var(--nav-height) - var(--footer-height)) / 4);
}
</style>
