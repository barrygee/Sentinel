<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Wraps a table in a scroll region that can be reached and scrolled by
 * keyboard (`tabindex="0"`, named by its nearest heading). A wide table scrolls
 * inside its wrapper rather than widening the page. While there is more to
 * scroll to, a fade on the trailing edge hints at it (phones only).
 */
defineProps<{
  /** Sanitised table HTML from the renderer. */
  html: string
  /** Accessible name of the region, e.g. "Environment variables table". */
  label: string
}>()

const regionRef = ref<HTMLElement | null>(null)
const hasMoreToScroll = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure(): void {
  const region = regionRef.value
  /* v8 ignore start -- measure only runs once mounted (and from the region's own scroll), when the ref is set */
  if (!region) return
  /* v8 ignore stop */
  hasMoreToScroll.value = region.scrollLeft + region.clientWidth < region.scrollWidth - 1
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined' || !regionRef.value) return
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(regionRef.value)
  const table = regionRef.value.querySelector('table')
  if (table) resizeObserver.observe(table)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div
    ref="regionRef"
    class="doc-table-scroll"
    :class="{ 'doc-table-scroll--more': hasMoreToScroll }"
    role="region"
    tabindex="0"
    :aria-label="label"
    @scroll.passive="measure"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify in renderDocument -->
    <div v-html="html"></div>
  </div>
</template>

<style scoped>
.doc-table-scroll {
  max-width: 960px;
  margin: 0 0 18px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.doc-table-scroll :deep(table) {
  min-width: 100%;
  border-collapse: collapse;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
}

.doc-table-scroll :deep(th),
.doc-table-scroll :deep(td) {
  padding: 10px 14px;
  vertical-align: top;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}

.doc-table-scroll :deep(th) {
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
  white-space: nowrap;
}

.doc-table-scroll :deep(td code) {
  white-space: nowrap;
}

.doc-table-scroll :deep(a) {
  color: var(--accent-text-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.doc-table-scroll :deep(code) {
  padding: 1px 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.88em;
  color: var(--ink-strong);
}

@media (max-width: 768px) {
  /* Only while there is more to see: a fixed fade would dim a table that fits. */
  .doc-table-scroll--more {
    mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
  }
}
</style>
