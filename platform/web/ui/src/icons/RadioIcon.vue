<template>
  <!-- The app's SDR glyph: a receiver with an antenna, a speaker and two dial
       lines. One component because it marks the SDR domain in four unrelated
       places — the settings rail, the SDR panel's RADIO tab and the Space
       auto-tune buttons — and hand-copied variants had already drifted apart
       (the auto-tune copies mirrored the speaker and lost the dial).
       Decorative: every call site's button carries its own accessible name, so
       this is always aria-hidden. `size` sets width/height; the viewBox stays
       at its native 24x24. -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    stroke-linecap="round"
  >
    <line x1="6" y1="9" x2="18" y2="3" stroke="currentColor" stroke-width="1.6" />
    <rect
      x="3"
      y="9"
      width="18"
      height="12"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="miter"
      fill="none"
    />
    <circle cx="16" cy="15" r="2.6" stroke="currentColor" stroke-width="1.6" />
    <line x1="6" y1="13" x2="11" y2="13" stroke="currentColor" stroke-width="1.6" />
    <line x1="6" y1="17" x2="11" y2="17" stroke="currentColor" stroke-width="1.6" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 19 })
</script>
