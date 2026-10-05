<template>
  <!-- Small down-chevron used by "scroll for more" hints and disclosure
       triggers. Decorative — the surrounding control always has a visible
       label or its own accessible name. Any open/closed rotation is applied
       by the parent wrapper (not this icon), matching each call site's
       existing CSS. -->
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <polyline
      points="1,2.5 4,5.5 7,2.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
