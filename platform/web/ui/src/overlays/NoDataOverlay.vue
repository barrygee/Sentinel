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
 * The `no-url-overlay-*` class names are load-bearing: the e2e specs target them.
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

<style scoped>
/* Fills the space between the nav bar and the footer, above the map. */
.no-url-overlay {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 0;
  right: 0;
  z-index: 500;
  /* Match the darkened contour SVG's background fill so the blurred ::before
     edge doesn't reveal a lighter band as a line below the header. */
  background-color: var(--canvas);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.no-url-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('/assets/sentinel-contour-background.svg');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  filter: blur(0.6px);
  pointer-events: none;
  z-index: 0;
}

.no-url-overlay-box {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  max-width: 640px;
  width: auto;
  text-align: center;
  padding: 28px 40px;
  background: transparent;
}

.no-url-overlay-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  line-height: 0.95;
}

.no-url-overlay-title-accent {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 300;
  font-size: clamp(26px, 3.6vw, 48px);
  color: var(--color-accent);
  letter-spacing: -0.01em;
}

.no-url-overlay-title-main {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 400;
  font-size: clamp(18px, 2.2vw, 30px);
  color: var(--ink-strong);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.no-url-overlay-msg {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: var(--ink-strong);
  line-height: 1.55;
  max-width: 480px;
  margin-top: 0;
}

.no-url-overlay-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  background: var(--color-accent);
  border: none;
  border-radius: 999px;
  padding: 9px 20px;
  color: var(--accent-ink);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.15s;
}

.no-url-overlay-btn-arrow {
  font-size: 13px;
  line-height: 1;
}

.no-url-overlay-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .no-url-overlay-box {
    padding: 20px;
    gap: 14px;
  }

  .no-url-overlay-msg {
    font-size: 12px;
    max-width: 90vw;
  }
}

/* While an overlay is up the section has nothing to show, so the surrounding
   map chrome is suppressed: the sidebar rail + panel, the footer's panel
   toggle, and the MapLibre controls. display:none (not just paint over) also
   pulls them out of the tab order, so nothing is focusable behind the overlay.
   The flag is the ref-counted body[data-no-data] set below. */
:global(body[data-no-data] #map-sidebar-rail),
:global(body[data-no-data] #map-sidebar),
:global(body[data-no-data] #map-sidebar-btn),
:global(body[data-no-data] .maplibregl-control-container) {
  display: none !important;
}
</style>
