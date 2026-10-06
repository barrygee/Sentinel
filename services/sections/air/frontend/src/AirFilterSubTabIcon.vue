<template>
  <!-- Air FILTER rail sub-tab glyphs: all / civil / military aircraft, airports and military bases. Decorative: the parent rail
       button carries the accessible name, so every glyph is aria-hidden.
       Colour/size follow the rail's other icons via currentColor + 19px. -->
  <svg
    v-if="category === 'aircraft'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
    <rect x="13" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
    <rect x="3" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
    <rect x="13" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
  </svg>
  <svg
    v-else-if="category === 'civil'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 2C12.8 2 13.2 3.6 13.2 6.6 L21 11.5 V13.4 L13.2 11 V16.5 L15.5 18.5 V20 L12 19 L8.5 20 V18.5 L10.8 16.5 V11 L3 13.4 V11.5 L10.8 6.6 C10.8 3.6 11.2 2 12 2Z"
      fill="currentColor"
    />
  </svg>
  <svg
    v-else-if="category === 'milAircraft'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <polygon
      points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
  <svg
    v-else-if="category === 'airports'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M6 13 L18 13 L16 7 L8 7 Z"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      fill="none"
    />
    <path
      d="M10 13 L9 21.5 M14 13 L15 21.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line
      x1="4.5"
      y1="21.5"
      x2="19.5"
      y2="21.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line
      x1="12"
      y1="7"
      x2="12"
      y2="2.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
  <svg
    v-else-if="category === 'mil'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <polygon
      points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>

  <UnknownCategoryGlyph v-else />
</template>

<script setup lang="ts">
// Registered with the shell's sidebar registry as Air's sub-tab icon
// (components/air/airSidebarFilter.ts).
import UnknownCategoryGlyph from '@sentinel/ui/icons/UnknownCategoryGlyph.vue'

defineProps<{ category: string }>()
</script>
