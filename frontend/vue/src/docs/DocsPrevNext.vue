<script setup lang="ts">
import type { DocsPage } from './docsTypes'

/**
 * Previous and next page links under the article, following the manifest's
 * reading order across groups. Each whole cell is the link.
 */
defineProps<{ previous: DocsPage | null; next: DocsPage | null }>()
</script>

<template>
  <nav v-if="previous || next" class="doc-prev-next" aria-label="Previous and next page">
    <RouterLink v-if="previous" class="doc-prev-next__cell" :to="previous.url" rel="prev">
      <span class="doc-prev-next__direction">&#8249; PREVIOUS</span>
      <span class="doc-prev-next__title">{{ previous.title }}</span>
    </RouterLink>
    <span v-else></span>
    <RouterLink
      v-if="next"
      class="doc-prev-next__cell doc-prev-next__cell--next"
      :to="next.url"
      rel="next"
    >
      <span class="doc-prev-next__direction">NEXT &#8250;</span>
      <span class="doc-prev-next__title">{{ next.title }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.doc-prev-next {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-width: var(--doc-measure, 720px);
  margin-top: 56px;
}

.doc-prev-next__cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-height: 64px;
  padding: 12px 16px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  color: var(--ink-strong);
  text-decoration: none;
}

.doc-prev-next__cell:hover {
  background: var(--hover-surface);
}

.doc-prev-next__cell--next {
  text-align: right;
}

.doc-prev-next__direction {
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-prev-next__title {
  font-size: var(--settings-text-value);
  font-weight: 600;
}

@media (min-width: 769px) {
  .doc-prev-next {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
