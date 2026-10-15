<script setup lang="ts">
import type { DocGroupKey } from './docsTypes'

/**
 * The rail icon of one docs group, drawn in the same hand as the Settings
 * icons: 24px grid, 1.8 round-capped strokes, no fill, `currentColor`.
 */
defineProps<{ groupKey: DocGroupKey }>()
</script>

<template>
  <svg
    class="doc-group-icon"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Get started: a flag on a pole -->
    <template v-if="groupKey === 'get-started'">
      <line x1="6" y1="3" x2="6" y2="21" />
      <path d="M6 4.5h11.5L15 9l2.5 4.5H6" />
    </template>
    <!-- Things you can do: a checklist -->
    <template v-else-if="groupKey === 'things-you-can-do'">
      <path d="M3.5 6.5l1.6 1.6 3-3.2" />
      <line x1="12" y1="6.5" x2="20.5" y2="6.5" />
      <rect x="3.5" y="10" width="4.6" height="4.6" />
      <line x1="12" y1="12.3" x2="20.5" y2="12.3" />
      <rect x="3.5" y="16" width="4.6" height="4.6" />
      <line x1="12" y1="18.3" x2="18" y2="18.3" />
    </template>
    <!-- Use Sentinel: a pointer with a click mark -->
    <template v-else-if="groupKey === 'use-sentinel'">
      <path d="M5 4l12 6.4-5.2 1.7-1.9 5.4z" />
      <path d="M15.5 15.5l4 4" />
      <path d="M18.5 12.5l2 .6" />
    </template>
    <!-- Set up and run: a wrench -->
    <template v-else-if="groupKey === 'set-up-and-run'">
      <path
        d="M14.5 6.5a3.8 3.8 0 0 0 4.6 4.8l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.8 3.8 0 0 0 4.8-4.6l-2.6 2.6-2.2-.4-.4-2.2z"
      />
    </template>
    <!-- How it works: three nodes in a small flow graph -->
    <template v-else-if="groupKey === 'how-it-works'">
      <circle cx="5.5" cy="12" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
      <line x1="7.8" y1="10.9" x2="16.2" y2="6.6" />
      <line x1="7.8" y1="13.1" x2="16.2" y2="17.4" />
    </template>
    <!-- Develop: code brackets -->
    <template v-else-if="groupKey === 'develop'">
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
      <line x1="13.8" y1="5" x2="10.2" y2="19" />
    </template>
    <!-- Reference: a closed book with a ribbon -->
    <template v-else>
      <path d="M5 19.5V5A2 2 0 0 1 7 3h12v15H7a2 2 0 0 0-2 1.5 2 2 0 0 0 2 1.5h12" />
      <path d="M14 3v7l-2-1.5L10 10V3" />
    </template>
  </svg>
</template>
