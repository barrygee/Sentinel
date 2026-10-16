<script setup lang="ts">
import { computed, ref } from 'vue'
import DocsDisclosure from './DocsDisclosure.vue'
import { useActiveHeading } from './composables/useActiveHeading'
import type { OutlineEntry } from './markdown/docBlocks'

/**
 * "On this page": the h2 and h3 of the current page as in-page links. Always
 * shown beside the article on wide screens (sticky), and behind a disclosure
 * button under the heading everywhere else. The heading being read carries
 * `aria-current="location"`.
 */
const props = defineProps<{
  entries: readonly OutlineEntry[]
  /** The page's URL, which the in-page links add their `#fragment` to. */
  pageUrl: string
}>()

const open = ref(false)
const headingIds = computed(() => props.entries.map((entry) => entry.id))
const activeId = useActiveHeading(headingIds)
</script>

<template>
  <nav v-if="entries.length > 0" class="doc-toc" aria-label="On this page">
    <DocsDisclosure v-model:open="open" label="On this page" collapse-below="wide">
      <p class="doc-toc__label" aria-hidden="true">ON THIS PAGE</p>
      <ol class="doc-toc__list">
        <li v-for="entry in entries" :key="entry.id" :class="`doc-toc__item--h${entry.level}`">
          <RouterLink
            class="doc-toc__link"
            :class="{ 'doc-toc__link--current': entry.id === activeId }"
            :to="{ path: pageUrl, hash: `#${entry.id}` }"
            :aria-current="entry.id === activeId ? 'location' : undefined"
            >{{ entry.text }}</RouterLink
          >
        </li>
      </ol>
    </DocsDisclosure>
  </nav>
</template>

<style scoped>
.doc-toc {
  margin-bottom: 8px;
}

.doc-toc__label {
  margin: 0;
  padding: 0 0 8px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.62);
}

/* The label repeats the button's text; show it only once the button is gone. */
@media (max-width: 1279px) {
  .doc-toc__label {
    display: none;
  }
}

.doc-toc__list {
  margin: 0;
  padding: 8px 0;
  list-style: none;
}

.doc-toc__item--h3 {
  padding-left: 12px;
}

.doc-toc__link {
  display: block;
  padding: 5px 12px;
  border-left: 2px solid transparent;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  line-height: 1.4;
  color: var(--ink);
  text-decoration: none;
}

.doc-toc__link:hover {
  background: var(--hover-surface);
}

.doc-toc__link--current {
  font-weight: 600;
  color: var(--ink-strong);
  border-left-color: var(--accent-text);
}
</style>
