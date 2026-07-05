<template>
  <!-- Line-style category glyph for the FILTER rail sub-tabs. Decorative: the
       parent button carries the accessible name, so the SVG is aria-hidden.
       Colour/size follow the rail's other icons via currentColor + 19px. -->
  <!-- ── Air categories ── -->
  <svg
    v-if="category === 'aircraft'"
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

  <!-- ── Space categories ── -->
  <svg
    v-else-if="category === 'space_station'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Matches the space map's ISS marker as it appears on the map: a central
         body with two solar-panel wings on booms, tilted along a diagonal axis. -->
    <g transform="rotate(-32 12 12)">
      <rect x="9.6" y="9.6" width="4.8" height="4.8" fill="currentColor" />
      <line x1="4.6" y1="12" x2="9.6" y2="12" stroke="currentColor" stroke-width="1.3" />
      <line x1="14.4" y1="12" x2="19.4" y2="12" stroke="currentColor" stroke-width="1.3" />
      <rect x="1.2" y="8.8" width="3.4" height="6.4" stroke="currentColor" stroke-width="1.3" />
      <rect x="19.4" y="8.8" width="3.4" height="6.4" stroke="currentColor" stroke-width="1.3" />
    </g>
  </svg>
  <svg
    v-else-if="category === 'active'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Satellite core with radiating signal arcs. -->
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" />
    <path d="M15.5 8.5 A5 5 0 0 1 15.5 15.5" stroke="currentColor" stroke-width="1.5" fill="none" />
    <path d="M18 6 A9 9 0 0 1 18 18" stroke="currentColor" stroke-width="1.5" fill="none" />
    <path d="M8.5 15.5 A5 5 0 0 1 8.5 8.5" stroke="currentColor" stroke-width="1.5" fill="none" />
  </svg>
  <svg
    v-else-if="category === 'weather'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M7 18 a4 4 0 0 1 0 -8 a5 5 0 0 1 9.6 1.2 A3.4 3.4 0 0 1 16.5 18 Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
  <svg
    v-else-if="category === 'navigation'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Navigation arrow (satnav heading marker) for navigation/GNSS satellites. -->
    <path
      d="M12 3 L18.5 20 L12 15.5 L5.5 20 Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
  <svg
    v-else-if="category === 'military'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Star — same glyph as the Air section's military filter. -->
    <polygon
      points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
  <svg
    v-else-if="category === 'amateur'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Handheld ham transceiver (HT): body with a stubby antenna, LCD, and a
         speaker grille. -->
    <rect
      x="7"
      y="5.5"
      width="10"
      height="16.5"
      rx="1.8"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <line
      x1="13.5"
      y1="5.5"
      x2="16"
      y2="2"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <rect x="9" y="8" width="6" height="3.4" stroke="currentColor" stroke-width="1.1" />
    <line x1="9.6" y1="14.6" x2="14.4" y2="14.6" stroke="currentColor" stroke-width="1" />
    <line x1="9.6" y1="16.6" x2="14.4" y2="16.6" stroke="currentColor" stroke-width="1" />
    <line x1="9.6" y1="18.6" x2="14.4" y2="18.6" stroke="currentColor" stroke-width="1" />
  </svg>
  <svg
    v-else-if="category === 'science'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Lab flask. -->
    <path
      d="M10 3 H14 M10.5 3 V9 L5.5 18.5 A1.5 1.5 0 0 0 7 20.5 H17 A1.5 1.5 0 0 0 18.5 18.5 L13.5 9 V3"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      fill="none"
    />
    <line x1="8.2" y1="15" x2="15.8" y2="15" stroke="currentColor" stroke-width="1.4" />
  </svg>
  <svg
    v-else-if="category === 'cubesat'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- 3U CubeSat: a tall three-unit body with deployed solar-panel wings. -->
    <rect
      x="9.5"
      y="3.5"
      width="5"
      height="17"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <line x1="9.5" y1="9.2" x2="14.5" y2="9.2" stroke="currentColor" stroke-width="1" />
    <line x1="9.5" y1="14.8" x2="14.5" y2="14.8" stroke="currentColor" stroke-width="1" />
    <line x1="7.5" y1="12" x2="9.5" y2="12" stroke="currentColor" stroke-width="1.2" />
    <line x1="14.5" y1="12" x2="16.5" y2="12" stroke="currentColor" stroke-width="1.2" />
    <rect x="1.5" y="8" width="6" height="8" stroke="currentColor" stroke-width="1.3" />
    <rect x="16.5" y="8" width="6" height="8" stroke="currentColor" stroke-width="1.3" />
    <line x1="4.5" y1="8" x2="4.5" y2="16" stroke="currentColor" stroke-width="0.9" />
    <line x1="19.5" y1="8" x2="19.5" y2="16" stroke="currentColor" stroke-width="0.9" />
    <line x1="1.5" y1="12" x2="7.5" y2="12" stroke="currentColor" stroke-width="0.9" />
    <line x1="16.5" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="0.9" />
  </svg>
  <svg
    v-else
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Unknown / fallback: a question mark. -->
    <path
      d="M8 8.2 A4 4 0 1 1 12 12.4 V15.5"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      fill="none"
    />
    <circle cx="12" cy="19.5" r="1.15" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
// Renders the line-style glyph for a FILTER rail sub-tab category. Air uses the
// aircraft/airports/mil glyphs (mirroring the map side menu); Space uses one glyph
// per satellite category. Any unrecognised id falls back to the "unknown" glyph.
defineProps<{ category: string }>()
</script>
