<template>
  <svg v-if="pause" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <rect x="1.5" y="1" width="2.6" height="8" fill="currentColor" />
    <rect x="5.9" y="1" width="2.6" height="8" fill="currentColor" />
  </svg>
  <svg v-else-if="stop" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="8" height="8" fill="currentColor" />
  </svg>
  <svg v-else width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <polygon points="2,1 11,6 2,11" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The 10px transport glyph: a play triangle, a stop square while the thing it
 * starts is running (SDR scans and sweeps), or a pause bar pair while
 * something plays that can be resumed (map replay). Decorative: the button
 * around it carries the accessible name.
 */
withDefaults(
  defineProps<{
    /** Show the stop square instead of play. */
    stop?: boolean
    /** Show the pause bars instead of play; wins over `stop`. */
    pause?: boolean
  }>(),
  { stop: false, pause: false },
)
</script>
