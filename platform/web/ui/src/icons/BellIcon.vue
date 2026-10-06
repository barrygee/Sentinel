<template>
  <!-- Notification bell glyph, with an optional diagonal strike-through for
       the "notifications disabled" state. Decorative — every call site's
       button already carries an accessible name describing the current
       enable/disable action, so this is always aria-hidden. `size` sets
       width/height (viewBox stays fixed at its native 13x13). -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 13 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z"
      fill="currentColor"
    />
    <path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none" />
    <line
      v-if="struck"
      x1="1.5"
      y1="1.5"
      x2="11.5"
      y2="11.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="square"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number; struck?: boolean }>(), { size: 13, struck: false })
</script>
