<script setup lang="ts">
/**
 * A small patch of dark map an Aircraft Icons example is drawn on, so each
 * option shows what it looks like on the map whatever the settings theme or
 * the option's selected colour.
 *
 * Purely visual: hidden from assistive tech, so the option's accessible name
 * stays its label (ARROW, SILHOUETTE) rather than the example's callsigns.
 */
</script>

<template>
  <span class="aircraft-icon-example-tile" aria-hidden="true">
    <slot />
  </span>
</template>

<style scoped>
.aircraft-icon-example-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 148px;
  height: 64px;
  /* The dark basemap's land colour, so the example reads as the map does. */
  background: #283041;
  overflow: hidden;
}
</style>
