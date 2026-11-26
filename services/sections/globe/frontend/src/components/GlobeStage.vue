<script setup lang="ts">
/**
 * The globe itself: the WebGL canvas and the HTML label layer laid over it.
 *
 * The canvas is one keyboard stop (arrows turn the globe, + and − zoom, Home
 * returns to the start view), described for screen readers by the hidden
 * instructions. The labels are decoration, hidden from assistive tech.
 *
 * Exposes `zoomIn`/`zoomOut` for the zoom buttons beside it, and reports its
 * start-up state with `status-change`.
 */
import { ref, toRef, watch } from 'vue'
import { useGlobeScene, type GlobeStatus } from '../composables/useGlobeScene'
import type { LatLon } from '../globe/geo'

const props = defineProps<{
  /** The operator's location: the start view and home marker (null while unknown). */
  home: LatLon | null
}>()

const emit = defineEmits<{
  /** The globe finished loading (`ready`) or can't run here (`unavailable`). */
  'status-change': [status: GlobeStatus]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLElement | null>(null)
const globe = useGlobeScene(canvas, overlay, toRef(props, 'home'))

watch(globe.status, (status) => emit('status-change', status))

function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (globe.handleKey(event.key)) event.preventDefault()
}

defineExpose({ zoomIn: globe.zoomIn, zoomOut: globe.zoomOut })
</script>

<template>
  <div class="globe-stage" :class="{ 'globe-stage--ready': globe.status.value === 'ready' }">
    <canvas
      ref="canvas"
      class="globe-canvas"
      tabindex="0"
      role="application"
      aria-roledescription="3D globe"
      aria-label="Globe"
      aria-describedby="globe-keyboard-help"
      @keydown="onKeydown"
    />
    <p id="globe-keyboard-help" class="sr-only">
      Arrow keys turn the globe. Plus and minus zoom in and out. Home returns to your location.
    </p>
    <div ref="overlay" class="globe-overlay" aria-hidden="true" />
  </div>
</template>

<style scoped>
.globe-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Fades in once the map is painted, so the globe never flashes half-drawn. */
  opacity: 0;
  transition: opacity 0.6s ease;
}

.globe-stage--ready {
  opacity: 1;
}

.globe-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  /* The globe handles its own drag and pinch. */
  touch-action: none;
}

/* The global focus ring (a11y.css) sits 2px outside its element, which the
   stage's overflow would clip on a full-bleed canvas: draw it just inside.
   !important because the global rule is !important. */
.globe-canvas:focus-visible {
  outline-offset: -2px !important;
}

.globe-canvas.globe-canvas--dragging {
  cursor: grabbing;
}

.globe-overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* The label elements are created by the globe's TypeScript, so they're reached
   with :deep(). Positions come from inline transforms set every frame. */
.globe-overlay :deep(> div) {
  position: absolute;
  top: 0;
  left: 0;
  white-space: nowrap;
  will-change: transform;
}

.globe-overlay :deep(.globe-overlay--hidden) {
  display: none;
}

/* Country names as the dark basemap sets them (dimmed with the map). */
.globe-overlay :deep(.globe-country-label) {
  font:
    400 12px 'Noto Sans',
    sans-serif;
  text-transform: uppercase;
  color: #676e72;
  text-shadow:
    0 0 1px rgba(9, 14, 35, 0.7),
    0 0 2px rgba(9, 14, 35, 0.5);
}

.globe-overlay :deep(.globe-home-marker) {
  width: 60px;
  height: 60px;
  margin: -30px 0 0 -30px;
}

.globe-overlay :deep(.globe-home-marker svg) {
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .globe-stage {
    transition: none;
  }
}
</style>
