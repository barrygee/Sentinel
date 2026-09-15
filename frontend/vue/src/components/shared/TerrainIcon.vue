<template>
  <!-- Terrain glyph: two nested contour arcs over a baseline. Decorative — the
       surrounding button carries the "Terrain relief and contour lines"
       accessible name. currentColor so it takes the rail's hover/active tint. -->
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M2 18 C6 8, 9 6, 12 6 S18 8, 22 18"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <path
      d="M6.5 18 C8.5 12.5, 10.5 11, 12 11 S15.5 12.5, 17.5 18"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    <line x1="2" y1="21" x2="22" y2="21" stroke="currentColor" stroke-width="1.6" />
  </svg>
</template>
