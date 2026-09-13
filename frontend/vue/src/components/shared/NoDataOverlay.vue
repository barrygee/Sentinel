<template>
  <div class="no-url-overlay">
    <div class="no-url-overlay-box">
      <div class="no-url-overlay-title">
        <span class="no-url-overlay-title-accent">{{ domain.toUpperCase() }}</span>
        <span class="no-url-overlay-title-main">{{ title }}</span>
      </div>
      <div class="no-url-overlay-msg">{{ message }}</div>
      <button class="no-url-overlay-btn" @click="emit('openSettings')">
        <span>OPEN SETTINGS</span>
        <span class="no-url-overlay-btn-arrow">&rarr;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The full-screen "this section has nothing to show" card: domain accent, a
 * one-line title, an explanation and an OPEN SETTINGS action.
 *
 * Purely presentational — the caller decides *when* it shows (NoUrlOverlay
 * gates on a configured source URL; SeaSourceNotice on the AIS feed's blocking
 * states). While any instance is mounted the surrounding map chrome (sidebar
 * rail + panel, footer toggle, MapLibre controls) is suppressed through the
 * `body[data-no-data]` flag, so nothing peeks through or takes focus behind it.
 * Instances are counted so two overlapping gates never clear each other's flag.
 *
 * The `no-url-overlay-*` class names are load-bearing: the global stylesheet
 * (`frontend/assets/template.css`) and the e2e specs target them.
 */
import { onMounted, onUnmounted } from 'vue'

defineProps<{ domain: string; title: string; message: string }>()
const emit = defineEmits<{ openSettings: [] }>()

onMounted(acquireNoDataChrome)
onUnmounted(releaseNoDataChrome)
</script>

<script lang="ts">
let mountedOverlays = 0

/** Raise the body flag that hides the map chrome (ref-counted). */
export function acquireNoDataChrome(): void {
  mountedOverlays += 1
  document.body.dataset.noData = 'true'
}

/** Drop the body flag once the last overlay has gone. Removing the attribute
 *  (vs setting 'false') keeps the `body[data-no-data]` selector accurate. */
export function releaseNoDataChrome(): void {
  mountedOverlays = Math.max(0, mountedOverlays - 1)
  if (mountedOverlays === 0) delete document.body.dataset.noData
}
</script>
