<script setup lang="ts">
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import { useDocsReturn } from './composables/useDocsReturn'

/** The x that closes Docs and returns to where it was opened from. */
const { closeDocs } = useDocsReturn()
</script>

<template>
  <BaseIconAction
    class="doc-close"
    accessible-name="Close docs"
    tooltip="CLOSE"
    tooltip-side="left"
    @click="closeDocs"
  >
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <line
        x1="3"
        y1="3"
        x2="15"
        y2="15"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <line
        x1="15"
        y1="3"
        x2="3"
        y2="15"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  </BaseIconAction>
</template>

<style scoped>
.doc-close {
  position: relative;
  /* 40x40 hit area around the 18px glyph (WCAG 2.5.8). */
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: rgba(var(--ink-rgb), 0.72);
  transition: color 0.15s;
}

.doc-close:hover {
  color: var(--ink-strong);
}
</style>
