<template>
  <!-- "Centre on map" glyph: a reticle — a ring with four tick marks breaking
       the edge, read as crosshairs rather than as the ⊙ logo mark that
       MyLocationIcon uses for "go to MY location". Follows currentColor so the
       enclosing button's hover/active tint carries through.
       Decorative — the button around it carries the accessible name. -->
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none" />
    <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="1.8" />
    <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1.8" />
    <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="1.8" />
    <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.8" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The reticle shown on a FILTER pane's "centre the map on this" action.
 *
 * Shared by the AIR aircraft row and the SEA vessel row so the same action
 * cannot end up drawn two different ways.
 */
</script>
