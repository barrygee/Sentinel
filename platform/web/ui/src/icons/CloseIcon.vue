<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <line
      x1="2"
      y1="2"
      x2="10"
      y2="10"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line
      x1="10"
      y1="2"
      x2="2"
      y2="10"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * `CloseIcon` — a decorative × for close and dismiss buttons. It draws in
 * `currentColor` and is hidden from assistive tech: the button carries the name.
 */
withDefaults(
  defineProps<{
    /** Rendered width and height in px. */
    size?: number
  }>(),
  { size: 12 },
)
</script>
