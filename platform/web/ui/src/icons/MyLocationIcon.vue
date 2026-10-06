<template>
  <!-- "Go to my location" glyph: the SENTINEL ⊙ logo mark (thick ring around a
       solid centre dot, same proportions as frontend/assets/logo.svg). Fixed
       white in every state, matching the logo mark — deliberately NOT
       currentColor, so the button's hover/active tint leaves it unchanged.
       Decorative — the surrounding button carries the "Go to my location"
       accessible name. -->
  <svg
    width="15"
    height="15"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="7.4" stroke="#ffffff" stroke-width="2.1" />
    <circle cx="10" cy="10" r="2.9" fill="#ffffff" />
  </svg>
</template>
