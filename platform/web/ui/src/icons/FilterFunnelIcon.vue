<template>
  <!-- Funnel/filter glyph: three shrinking horizontal lines. Decorative — the
       surrounding button (map rail tab or side-menu FILTER control) carries
       its own accessible name. `size` sets width/height (viewBox stays fixed
       so the glyph itself never distorts); call sites size it to match their
       rail's other icons. -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <line
      x1="1"
      y1="3.5"
      x2="14"
      y2="3.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line
      x1="3.5"
      y1="7.5"
      x2="11.5"
      y2="7.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line
      x1="6"
      y1="11.5"
      x2="9"
      y2="11.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 15 })
</script>
