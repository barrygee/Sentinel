<script setup lang="ts">
/**
 * The GLOBE page: the 3D globe (a port of the sentinel-site header globe)
 * with the live aircraft, vessels and APRS stations on it, its layer toggles,
 * the selected object's details, notices for empty layers, and zoom buttons.
 * It starts over the operator's location, and sits beside the shell's left
 * rail, between the nav and the footer.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import BaseZoomButtons from '@sentinel/ui/base/BaseZoomButtons.vue'
import GlobeDetailsPanel from './components/GlobeDetailsPanel.vue'
import GlobeLayerBar from './components/GlobeLayerBar.vue'
import GlobeLayerNotices from './components/GlobeLayerNotices.vue'
import GlobeStage from './components/GlobeStage.vue'
import GlobeUnavailableNotice from './components/GlobeUnavailableNotice.vue'
import { useGlobeLiveLayers } from './composables/useGlobeLiveLayers'
import { useHomeLocation } from './composables/useHomeLocation'
import type { GlobeStatus } from './composables/useGlobeScene'
import type { Bbox } from './feeds/globeFeedTypes'
import { objectDetails } from './feeds/objectDetails'

const home = useHomeLocation()
const status = ref<GlobeStatus>('loading')
const stage = ref<InstanceType<typeof GlobeStage> | null>(null)
const viewBbox = shallowRef<Bbox | null>(null)
const live = useGlobeLiveLayers(home, viewBbox)
const selectedKey = ref<string | null>(null)

const selected = computed(() => (selectedKey.value ? live.findItem(selectedKey.value) : null))
const details = computed(() =>
  selected.value ? objectDetails(selected.value.layer, selected.value.item, Date.now()) : null,
)

// The selected object left the feed (out of range, timed out, layer off):
// close its details rather than show stale data.
watch(live.objects, () => {
  if (selectedKey.value && !selected.value) selectedKey.value = null
})
</script>

<template>
  <div id="globe-page" class="theme-dark" data-domain="globe">
    <h1 class="sr-only">Globe — live aircraft, satellites, vessels and APRS stations</h1>
    <GlobeStage
      ref="stage"
      :home="home"
      :objects="live.objects.value"
      :visible-kinds="live.visible.value"
      :selected-key="selectedKey"
      @status-change="status = $event"
      @select="selectedKey = $event"
      @view-bounds-change="viewBbox = $event"
    />
    <GlobeUnavailableNotice
      v-if="status === 'unavailable'"
      message="The 3D globe needs WebGL, which this browser or device doesn't provide."
    />
    <template v-else>
      <div class="globe-top-left">
        <GlobeLayerBar
          :visible="live.visible.value"
          :counts="live.counts.value"
          @toggle="live.setLayer"
        />
        <GlobeLayerNotices :notices="live.notices.value" />
      </div>
      <BaseZoomButtons
        class="globe-zoom"
        group-label="Globe zoom"
        @zoom-in="stage?.zoomIn()"
        @zoom-out="stage?.zoomOut()"
      />
      <GlobeDetailsPanel
        v-if="details && selectedKey"
        :details="details"
        @close="selectedKey = null"
        @centre="stage?.flyToObject(selectedKey)"
      />
    </template>
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

/* Layer toggles with any notices under them, top left over the globe. */
.globe-top-left {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 64px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}

.globe-top-left > * {
  pointer-events: auto;
}

/* Top right on phones, clear of the details sheet that rises from the bottom. */
.globe-zoom {
  position: absolute;
  top: 12px;
  right: 12px;
}

/* Above phone width the rail is always shown (≤480 it hides with the drawer). */
@media (min-width: 481px) {
  #globe-page {
    left: 44px;
  }
}

/* Wide screens: bottom right, like the flat maps' zoom controls (the details
   panel floats top right); clear of the iOS home bar. */
@media (min-width: 900px) {
  .globe-zoom {
    top: auto;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .globe-top-left {
    right: 330px;
  }
}
</style>
