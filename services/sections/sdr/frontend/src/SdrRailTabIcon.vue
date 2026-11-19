<template>
  <!-- radio (receiver with antenna and dial) -->
  <RadioIcon v-if="tabId === 'radio'" />
  <!-- frequency manager (bookmark) -->
  <svg
    v-else-if="tabId === 'frequency-manager'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M6 3h12v18l-6-4-6 4V3Z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="miter"
      fill="none"
    />
  </svg>
  <!-- search ranges (range brackets with sweep) -->
  <svg
    v-else-if="tabId === 'search-ranges'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    stroke-linecap="round"
  >
    <path d="M5 7v10M5 7h3M5 17h3" stroke="currentColor" stroke-width="1.8" />
    <path d="M19 7v10M19 7h-3M19 17h-3" stroke="currentColor" stroke-width="1.8" />
    <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.8" />
  </svg>
  <!-- groups (stacked tags) -->
  <svg
    v-else-if="tabId === 'groups'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    stroke-linejoin="miter"
  >
    <path d="M4 7h10l4 4-4 4H4V7Z" stroke="currentColor" stroke-width="1.8" fill="none" />
    <circle cx="7" cy="11" r="1.1" fill="currentColor" />
  </svg>
  <!-- recordings -->
  <svg
    v-else-if="tabId === 'recordings'"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The glyph for one SDR side-rail tab. Decorative: the rail button carries the
 * tab's accessible name, so every icon is hidden from assistive tech.
 */
import RadioIcon from '@sentinel/ui/icons/RadioIcon.vue'
import type { SdrTab } from './stores/sdr'

defineProps<{ tabId: SdrTab }>()
</script>
