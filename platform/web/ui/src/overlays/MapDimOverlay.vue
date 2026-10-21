<template>
  <div class="map-dim-overlay" aria-hidden="true"></div>
</template>

<script setup lang="ts">
/**
 * Dims a full-screen map whose live data has stopped — the darkened look the
 * SDR waterfall has while a group scan runs. Purely visual: the caller says why
 * (a `MapNoticeBanner`, which sits above it), so it is hidden from assistive
 * tech.
 *
 * Click-through (`pointer-events: none`): the map stays pannable and the
 * sidebar usable underneath. It covers the page below the nav bar — where the
 * full-screen maps sit — like `MapNoticeBanner`, so it needs no positioned
 * ancestor, and stays under the sidebar and the map notices.
 */
</script>

<style scoped>
.map-dim-overlay {
  position: fixed;
  inset: var(--nav-height) 0 0 0;
  /* Over the map and its markers, under the sidebar (1002) and notices (1004). */
  z-index: 10;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.55);
}
</style>
