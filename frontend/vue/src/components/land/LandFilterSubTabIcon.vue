<template>
  <!-- Land FILTER rail sub-tab glyphs: the APRS and repeater glyphs its map markers carry. Decorative: the parent rail
       button carries the accessible name, so every glyph is aria-hidden.
       Colour/size follow the rail's other icons via currentColor + 19px. -->
  <svg
    v-if="category === 'aprs'"
    width="19"
    height="19"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Handheld transceiver: antenna, body, display, keypad. -->
    <path d="M5.5 5.5V1.5" />
    <rect x="3.5" y="5.5" width="9" height="9" rx="1" />
    <rect x="5.5" y="7.5" width="5" height="2.5" rx="0.4" />
    <path d="M6 12.2h4" />
  </svg>
  <svg
    v-else-if="category === 'repeaters'"
    width="19"
    height="19"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Mast on splayed legs with RX/TX arcs either side of the antenna. -->
    <path d="M8 1.8v12.7" />
    <path d="M8 7.4l-3.6 7.1M8 7.4l3.6 7.1" />
    <path d="M5.4 1.6a3.4 3.4 0 0 0 0 5.2M10.6 1.6a3.4 3.4 0 0 1 0 5.2" />
  </svg>
  <UnknownCategoryGlyph v-else />
</template>

<script setup lang="ts">
// Registered with the shell's sidebar registry as Land's sub-tab icon
// (components/land/landSidebarFilter.ts).
import UnknownCategoryGlyph from '@/components/shared/UnknownCategoryGlyph.vue'

defineProps<{ category: string }>()
</script>
