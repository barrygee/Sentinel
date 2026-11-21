<template>
  <svg v-if="stop" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="8" height="8" fill="currentColor" />
  </svg>
  <svg v-else width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <polygon points="2,1 11,6 2,11" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The 10px play triangle, or a stop square while the thing it starts is running.
 * Decorative: the button around it carries the accessible name.
 */
defineProps<{ stop: boolean }>()
</script>
