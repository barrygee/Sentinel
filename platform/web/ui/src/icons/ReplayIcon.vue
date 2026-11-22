<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <!-- A clock face with an anticlockwise arrow: going back in time. -->
    <path
      d="M4 12a8 8 0 1 0 2.3-5.6"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <path d="M3.5 3.5v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
/** The replay glyph: a clock with an anticlockwise arrow. Decorative; the control carries the name. */
withDefaults(defineProps<{ size?: number }>(), { size: 18 })
</script>
