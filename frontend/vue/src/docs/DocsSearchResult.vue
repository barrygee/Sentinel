<script setup lang="ts">
import { computed } from 'vue'
import type { DocsSearchHit } from './search/docsSearchEngine'
import { highlightSegments } from './search/highlight'

/**
 * One search result: a link to the matching heading of a page, with the page
 * title, the heading and an excerpt. Matches are wrapped in `<mark>`, so they
 * are not shown by colour alone.
 */
const props = defineProps<{ hit: DocsSearchHit; pageUrl: string }>()

const target = computed(() => ({
  path: props.pageUrl,
  hash: props.hit.section.headingId ? `#${props.hit.section.headingId}` : '',
}))
const titleSegments = computed(() =>
  highlightSegments(props.hit.section.pageTitle, props.hit.matchedTerms),
)
const headingSegments = computed(() =>
  highlightSegments(props.hit.section.heading, props.hit.matchedTerms),
)
const snippetSegments = computed(() => highlightSegments(props.hit.snippet, props.hit.matchedTerms))
const showHeading = computed(() => props.hit.section.headingId !== '')
</script>

<template>
  <li class="doc-search-result">
    <RouterLink class="doc-search-result__link" :to="target">
      <span class="doc-search-result__line">
        <span class="doc-search-result__title"
          ><template v-for="(segment, index) in titleSegments" :key="index"
            ><mark v-if="segment.match">{{ segment.text }}</mark
            ><template v-else>{{ segment.text }}</template></template
          ></span
        >
        <template v-if="showHeading">
          <span class="doc-search-result__separator" aria-hidden="true"> &#8250; </span>
          <span class="sr-only"> section </span>
          <span class="doc-search-result__heading"
            ><template v-for="(segment, index) in headingSegments" :key="index"
              ><mark v-if="segment.match">{{ segment.text }}</mark
              ><template v-else>{{ segment.text }}</template></template
            ></span
          >
        </template>
      </span>
      <span v-if="hit.snippet" class="doc-search-result__snippet"
        ><template v-for="(segment, index) in snippetSegments" :key="index"
          ><mark v-if="segment.match">{{ segment.text }}</mark
          ><template v-else>{{ segment.text }}</template></template
        ></span
      >
    </RouterLink>
  </li>
</template>

<style scoped>
.doc-search-result {
  border-bottom: 1px solid var(--border);
}

.doc-search-result__link {
  display: block;
  min-height: 56px;
  padding: 12px 16px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  color: var(--ink);
  text-decoration: none;
}

.doc-search-result__link:hover,
.doc-search-result__link:focus-visible {
  background: var(--hover-surface);
}

.doc-search-result__title {
  font-size: var(--settings-text-value);
  font-weight: 600;
  color: var(--ink-strong);
}

.doc-search-result__heading {
  font-size: var(--settings-text-value);
  font-weight: 500;
  color: var(--ink);
}

.doc-search-result__snippet {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  font-size: var(--settings-text-body);
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.7);
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* The match is marked by background AND weight, so it does not rely on colour. */
.doc-search-result mark {
  background: var(--accent-soft);
  color: var(--ink-strong);
  font-weight: 600;
}
</style>
