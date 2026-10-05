<template>
  <!-- Map-pin ("track") glyph: a teardrop outline with a solid centre dot.
       Purely decorative — every call site places it inside a button that
       already carries its own accessible name (e.g. "Track aircraft" /
       "Track satellite"), so it is always aria-hidden. -->
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
      fill="none"
    />
    <circle cx="12" cy="9" r="2.2" fill="currentColor" />
  </svg>
</template>
