<script setup lang="ts">
/**
 * The GLOBE page: the 3D globe (a port of the sentinel-site header globe) with
 * its zoom buttons, starting over the operator's location. It sits beside the
 * shell's left rail, between the nav and the footer. The live layers (aircraft,
 * vessels, APRS, satellites) are added on top in later steps.
 */
import { ref } from 'vue'
import BaseZoomButtons from '@sentinel/ui/base/BaseZoomButtons.vue'
import GlobeStage from './components/GlobeStage.vue'
import GlobeUnavailableNotice from './components/GlobeUnavailableNotice.vue'
import { useHomeLocation } from './composables/useHomeLocation'
import type { GlobeStatus } from './composables/useGlobeScene'

const home = useHomeLocation()
const status = ref<GlobeStatus>('loading')
const stage = ref<InstanceType<typeof GlobeStage> | null>(null)
</script>

<template>
  <div id="globe-page" class="theme-dark" data-domain="globe">
    <h1 class="sr-only">Globe — live aircraft, satellites, vessels and APRS stations</h1>
    <GlobeStage ref="stage" :home="home" @status-change="status = $event" />
    <GlobeUnavailableNotice
      v-if="status === 'unavailable'"
      message="The 3D globe needs WebGL, which this browser or device doesn't provide."
    />
    <BaseZoomButtons
      v-else
      class="globe-zoom"
      group-label="Globe zoom"
      @zoom-in="stage?.zoomIn()"
      @zoom-out="stage?.zoomOut()"
    />
  </div>
</template>

<style scoped>
/* Fills the space between the nav and the footer, and starts beside the shell's
   44px left rail (MapSidebar) rather than under it. The globe's own space
   colour, so the page matches the globe in both themes. */
#globe-page {
  position: fixed;
  inset: var(--nav-height) 0 var(--footer-height) 0;
  overflow: hidden;
  background: #0d0f14;
}

/* Bottom-right, like the flat maps' zoom controls; clear of the iOS home bar. */
.globe-zoom {
  position: absolute;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

/* Above phone width the rail is always shown (≤480 it hides with the drawer). */
@media (min-width: 481px) {
  #globe-page {
    left: 44px;
  }
}
</style>
