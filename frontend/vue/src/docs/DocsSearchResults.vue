<script setup lang="ts">
import { computed, ref } from 'vue'
import DocsSearchResult from './DocsSearchResult.vue'
import type { DocsLibrary } from './docsTypes'
import type { DocsSearchHit, DocsSearchOutcome } from './search/docsSearchEngine'

/**
 * The search results page body (the page's heading, "SEARCH RESULTS", is
 * drawn by the caller). Results replace the article, grouped by docs group.
 * It is a heading, a summary and lists of links, not a combobox: Down/Up move
 * between results, and Up on the first returns to the search field.
 */
const props = defineProps<{
  query: string
  outcome: DocsSearchOutcome | null
  library: DocsLibrary
}>()

const emit = defineEmits<{ 'focus-field': [] }>()

const rootRef = ref<HTMLElement | null>(null)

interface ResultGroup {
  key: string
  title: string
  hits: DocsSearchHit[]
}

const groups = computed<ResultGroup[]>(() => {
  /* v8 ignore start -- groups is only read once there are hits, so the outcome exists */
  const hits = props.outcome?.hits ?? []
  /* v8 ignore stop */
  return props.library.groups
    .map((group) => ({
      key: group.key,
      title: group.title,
      hits: hits.filter((hit) => hit.section.groupKey === group.key),
    }))
    .filter((group) => group.hits.length > 0)
})

const hitCount = computed(() => props.outcome?.hits.length ?? 0)
/* v8 ignore start -- only read for a summary (so the outcome exists), and expandSynonyms never yields an expansion without terms */
const alsoSearching = computed(() =>
  (props.outcome?.expansions ?? []).map((expansion) => expansion.alsoSearching[0] ?? ''),
)
/* v8 ignore stop */
const summary = computed(() => {
  const noun = hitCount.value === 1 ? 'result' : 'results'
  /* v8 ignore start -- the summary is only shown once there are hits, so the outcome exists */
  const total = props.outcome?.totalHits ?? 0
  /* v8 ignore stop */
  const count =
    total > hitCount.value ? `Showing ${hitCount.value} of ${total}` : `${hitCount.value}`
  const synonymNote =
    alsoSearching.value.length > 0 ? ` · also searching ${alsoSearching.value.join(', ')}` : ''
  return `${count} ${noun} for “${props.query.trim()}”${synonymNote}`
})

function pageUrlOf(hit: DocsSearchHit): string {
  return props.library.pageByPath.get(hit.section.pagePath)?.url ?? '/doc/'
}

function resultLinks(): HTMLAnchorElement[] {
  /* v8 ignore start -- the root is mounted whenever a key is pressed or focusFirst is called */
  return Array.from(
    rootRef.value?.querySelectorAll<HTMLAnchorElement>('.doc-search-result a') ?? [],
  )
  /* v8 ignore stop */
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const links = resultLinks()
  const currentIndex = links.findIndex((link) => link === document.activeElement)
  if (currentIndex === -1) return
  event.preventDefault()
  if (event.key === 'ArrowDown') {
    links[Math.min(currentIndex + 1, links.length - 1)]?.focus()
  } else if (currentIndex === 0) {
    emit('focus-field')
  } else {
    links[currentIndex - 1]?.focus()
  }
}

defineExpose({
  /** Moves focus to the first result, if there is one. */
  focusFirst: (): void => resultLinks()[0]?.focus(),
})
</script>

<template>
  <div ref="rootRef" class="doc-search-results" @keydown="onKeydown">
    <template v-if="hitCount === 0">
      <p class="doc-search-results__empty">
        NO RESULTS FOR &ldquo;{{ query.trim().toUpperCase() }}&rdquo;
      </p>
      <p class="doc-search-results__hint">Try other words, or browse the sections on the left.</p>
    </template>
    <template v-else>
      <p class="doc-search-results__summary">{{ summary }}</p>
      <section v-for="group in groups" :key="group.key" class="doc-search-results__group">
        <h2 class="doc-search-results__group-title">{{ group.title }}</h2>
        <ol class="doc-search-results__list">
          <DocsSearchResult
            v-for="hit in group.hits"
            :key="hit.section.id"
            :hit="hit"
            :page-url="pageUrlOf(hit)"
          />
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped>
.doc-search-results {
  max-width: var(--doc-measure, 720px);
  padding-top: 18px;
}

.doc-search-results__empty {
  margin: 0;
  padding: 22px 0 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  font-weight: 600;
  letter-spacing: 0.16em;
  /* Readable, not decorative: this is the page's only content. */
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-search-results__hint,
.doc-search-results__summary {
  margin: 0 0 18px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-search-results__group-title {
  margin: 28px 0 6px;
  padding: 0 16px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-search-results__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
