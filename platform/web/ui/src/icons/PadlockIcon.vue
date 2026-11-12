<template>
  <svg :width="size" :height="size" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M4 6V4.5a3 3 0 0 1 6 0V6m-7 0h8v6H3V6Z"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * `PadlockIcon` — a decorative padlock for anything locked or in use
 * elsewhere. It draws in `currentColor` and is hidden from assistive tech, so
 * the surrounding text must say why the thing is locked.
 */
withDefaults(
  defineProps<{
    /** Rendered width and height in px. */
    size?: number
  }>(),
  { size: 12 },
)
</script>
