<template>
  <div :class="`${classPrefix}-radio-line`">
    <button
      type="button"
      class="srla-toggle"
      :class="[`${classPrefix}-cell-label`, { 'srla-toggle--expanded': expanded }]"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="expanded = !expanded"
    >
      <span class="srla-title">{{ title }}</span>
      <span class="srla-chevron"><ChevronIcon /></span>
    </button>
    <ul v-show="expanded" :id="bodyId" :class="`${classPrefix}-radio-list`">
      <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * SatRadioLinesAccordion — one collapsible caption + bullet list inside the
 * satellite RADIO section (PACKET / DIGITAL, NOTES). These blobs can run to
 * several long lines, so they start collapsed to keep the frequency cells and
 * the action buttons below them in view; the caption doubles as the toggle.
 *
 * `classPrefix` keeps the caller's existing caption/list CSS family
 * (`sfr-acc` / `spp-acc`) so the open list looks exactly as it did before.
 */
import { ref, useId } from 'vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'

defineProps<{
  /** The caption text, e.g. `NOTES`. */
  title: string
  /** The already-split note lines to list when expanded. */
  lines: string[]
  /** The caller's CSS family prefix for the line/label/list classes. */
  classPrefix: 'sfr-acc' | 'spp-acc'
}>()

const expanded = ref(false)
const bodyId = useId()
</script>

<style scoped>
/* A caption-styled disclosure: the label keeps its grey uppercase look (from
   the caller's -cell-label class) and gains a right-hand chevron that turns
   accent on hover/expanded, like the other in-panel accordions. */
.srla-toggle {
  width: 100%;
  min-height: 24px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  justify-content: space-between;
  text-align: left;
}
.srla-toggle:hover,
.srla-toggle--expanded {
  color: rgba(var(--ink-rgb), 0.6);
}
.srla-toggle:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: 2px;
}
.srla-chevron {
  display: flex;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}
.srla-toggle:hover .srla-chevron,
.srla-toggle--expanded .srla-chevron {
  color: var(--accent-text);
}
.srla-toggle--expanded .srla-chevron {
  transform: rotate(0deg);
}
@media (prefers-reduced-motion: reduce) {
  .srla-chevron {
    transition: none;
  }
}
</style>
