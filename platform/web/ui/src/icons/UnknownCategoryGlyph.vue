<template>
  <!-- Fallback glyph (a question mark) for a FILTER rail sub-tab category no
       icon knows — e.g. a satellite category added upstream before Sentinel
       has a glyph for it. Decorative: the rail button carries the name. -->
  <svg
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
