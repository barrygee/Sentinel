<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- ALL: the four-square grid every FILTER rail uses for "everything". -->
    <template v-if="category === 'all'">
      <rect x="3" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
      <rect x="13" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
      <rect x="3" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
      <rect x="13" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
    </template>
    <!-- CARGO: a hull stacked with containers. -->
    <template v-else-if="category === 'cargo'">
      <path d="M3 15h18l-2 4H5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <rect x="6" y="11" width="4" height="4" stroke="currentColor" stroke-width="1.5" />
      <rect x="10" y="11" width="4" height="4" stroke="currentColor" stroke-width="1.5" />
      <rect x="14" y="11" width="4" height="4" stroke="currentColor" stroke-width="1.5" />
      <rect x="8" y="7" width="4" height="4" stroke="currentColor" stroke-width="1.5" />
    </template>
    <!-- TANKER: a hull carrying a long cylindrical tank. -->
    <template v-else-if="category === 'tanker'">
      <path d="M3 15h18l-2 4H5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <rect x="5" y="9" width="12" height="5" rx="2.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M18 14V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>
    <!-- PASSENGER: a hull with a tall superstructure of windows. -->
    <template v-else-if="category === 'passenger'">
      <path d="M3 15h18l-2 4H5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M6 15V9h12v6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M9 9V6h6v3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path
        d="M8 12h1M11 12h1M14 12h1"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </template>
    <!-- FISHING: a small hull with a raised mast and a fish beside it. -->
    <template v-else-if="category === 'fishing'">
      <path
        d="M4 15h11l-1.5 4H5.5z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path d="M9 15V6l4 5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path
        d="M16 10c2-2 4-2 5 0-1 2-3 2-5 0z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </template>
    <!-- OTHER: a plain hull with a single mast. -->
    <template v-else>
      <path d="M3 15h18l-2 4H5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M12 15V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M12 6l5 5h-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </template>
  </svg>
</template>

<script setup lang="ts">
/**
 * The rail glyph for one Sea FILTER category — a tiny hull whose deck cargo
 * says which family it stands for. Decorative: the button carries the name.
 */
import type { SeaFilterCategory } from '@/utils/aisShipType'

withDefaults(defineProps<{ category: SeaFilterCategory; size?: number }>(), { size: 16 })
</script>
