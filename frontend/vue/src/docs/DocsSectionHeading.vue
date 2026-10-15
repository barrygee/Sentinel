<script setup lang="ts">
import { computed } from 'vue'
import DocsHeadingAnchor from './DocsHeadingAnchor.vue'

/**
 * An h2 to h6 inside a page. h2 to h4 get the shareable anchor link. The id is
 * GitHub's slug of the heading text, so links match GitHub's. `tabindex="-1"`
 * lets a `#fragment` jump move keyboard focus here, not just the scroll
 * position.
 */
const props = defineProps<{
  level: 2 | 3 | 4 | 5 | 6
  id: string
  /** Sanitised inline HTML of the heading (code spans, emphasis). */
  html: string
  /** Plain text, for the anchor's accessible name. */
  text: string
}>()

const tag = computed(() => `h${props.level}`)
const hasAnchor = computed(() => props.level <= 4)
</script>

<template>
  <component
    :is="tag"
    :id="id"
    class="doc-section-heading"
    :class="`doc-section-heading--h${level}`"
    tabindex="-1"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify in renderDocument -->
    <span v-html="html"></span>
    <DocsHeadingAnchor v-if="hasAnchor" :heading-id="id" :heading-text="text" />
  </component>
</template>

<style scoped>
.doc-section-heading {
  max-width: var(--doc-measure, 720px);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 600;
  color: var(--ink-strong);
  scroll-margin-top: 72px;
  overflow-wrap: anywhere;
}

/* A target reached by a link or anchor needs a cue that is not colour alone
   (WCAG 2.4.7): a bar on its leading edge instead of the outline. */
.doc-section-heading:focus {
  outline: none !important;
  box-shadow: -4px 0 0 var(--accent-text);
}

.doc-section-heading--h2 {
  margin: 48px 0 14px;
  padding-top: 20px;
  border-top: 1px solid var(--rule);
  font-size: var(--settings-text-title);
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.doc-section-heading--h3 {
  margin: 32px 0 10px;
  font-size: 16px;
  line-height: 1.35;
}

.doc-section-heading--h4,
.doc-section-heading--h5,
.doc-section-heading--h6 {
  margin: 24px 0 8px;
  font-size: var(--settings-text-title);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.doc-section-heading :deep(code) {
  padding: 1px 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.88em;
  text-transform: none;
  letter-spacing: 0;
}

@media (min-width: 769px) {
  .doc-section-heading {
    scroll-margin-top: 24px;
  }
}
</style>
