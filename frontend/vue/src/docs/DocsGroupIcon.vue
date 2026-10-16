<script setup lang="ts">
import { computed } from 'vue'
import SectionIcon from '@/components/shared/SectionIcon.vue'
import type { DocGroupKey } from './docsTypes'

/**
 * The rail icon of one docs group. A group that matches a Settings section
 * (`app` and the five sections) draws that section's Settings icon, so the two
 * rails read the same; the docs' own groups have their own, drawn in the same
 * hand: 24px grid, 1.8 round-capped strokes, no fill, `currentColor`.
 */
const props = defineProps<{ groupKey: DocGroupKey }>()

const SECTION_GROUP_KEYS: readonly DocGroupKey[] = ['app', 'air', 'space', 'sea', 'land', 'sdr']
const isSectionGroup = computed(() => SECTION_GROUP_KEYS.includes(props.groupKey))
</script>

<template>
  <SectionIcon v-if="isSectionGroup" :section-key="groupKey" class="doc-group-icon" />
  <svg
    v-else
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
    <!-- Set up and run: a wrench -->
    <template v-else-if="groupKey === 'set-up-and-run'">
      <path
        d="M14.5 6.5a3.8 3.8 0 0 0 4.6 4.8l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.8 3.8 0 0 0 4.8-4.6l-2.6 2.6-2.2-.4-.4-2.2z"
      />
    </template>
    <!-- Develop: code brackets -->
    <template v-else>
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
      <line x1="13.8" y1="5" x2="10.2" y2="19" />
    </template>
  </svg>
</template>
