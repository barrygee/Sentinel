<script setup lang="ts">
import { useRouter } from 'vue-router'
import DocsCallout from './DocsCallout.vue'
import DocsCodeBlock from './DocsCodeBlock.vue'
import DocsDiagram from './DocsDiagram.vue'
import DocsSectionHeading from './DocsSectionHeading.vue'
import DocsTableScroll from './DocsTableScroll.vue'
import type { DocBlock } from './markdown/docBlocks'

/**
 * Renders a page's blocks in order: prose as sanitised HTML, and each block
 * that needs behaviour (headings, code, tables, callouts, diagrams) as its own
 * small component.
 *
 * Links the renderer marked `data-doc-link` point at other docs pages (or at a
 * heading on this one); plain clicks on them are handled by the router so the
 * page does not reload, while modified clicks (new tab, download) keep their
 * browser behaviour.
 */
defineProps<{ blocks: readonly DocBlock[] }>()

const router = useRouter()

function onArticleClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-doc-link]')
  const href = link?.getAttribute('href')
  if (!href) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <article class="doc-article" @click="onArticleClick">
    <template v-for="(block, index) in blocks" :key="index">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify in renderDocument -->
      <div v-if="block.kind === 'html'" class="doc-prose" v-html="block.html"></div>
      <DocsSectionHeading
        v-else-if="block.kind === 'heading'"
        :id="block.id"
        :level="block.level"
        :html="block.html"
        :text="block.text"
      />
      <DocsCodeBlock
        v-else-if="block.kind === 'code'"
        :code="block.code"
        :language="block.language"
      />
      <DocsTableScroll v-else-if="block.kind === 'table'" :html="block.html" :label="block.label" />
      <DocsCallout v-else-if="block.kind === 'callout'" :variant="block.variant">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify in renderDocument -->
        <div v-html="block.html"></div>
      </DocsCallout>
      <DocsDiagram
        v-else
        :source="block.source"
        :caption="block.caption"
        :text-html="block.textHtml"
      />
    </template>
  </article>
</template>

<style scoped>
.doc-article {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--doc-text-body, 15px);
  line-height: var(--doc-line, 1.65);
  color: var(--ink);
}

/* Prose is the v-html content, so its elements are reached with :deep(). */
.doc-prose {
  max-width: var(--doc-measure, 720px);
}

.doc-prose :deep(p),
.doc-prose :deep(ul),
.doc-prose :deep(ol),
.doc-prose :deep(blockquote),
.doc-prose :deep(hr) {
  margin: 0 0 14px;
}

.doc-prose :deep(ul),
.doc-prose :deep(ol) {
  padding-left: 22px;
}

.doc-prose :deep(li > ul),
.doc-prose :deep(li > ol) {
  margin-top: 6px;
  margin-bottom: 0;
}

.doc-prose :deep(li) {
  margin-bottom: 6px;
}

.doc-prose :deep(ol > li::marker) {
  font-weight: 600;
  color: var(--ink-strong);
}

.doc-prose :deep(strong) {
  font-weight: 600;
}

.doc-prose :deep(a) {
  color: var(--accent-text-deep);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
}

.doc-prose :deep(a:hover) {
  text-decoration-thickness: 2px;
}

.doc-prose :deep(code) {
  padding: 1px 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.88em;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}

.doc-prose :deep(.doc-nested-scroll) {
  max-width: 100%;
  margin: 8px 0 14px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.doc-prose :deep(.doc-nested-scroll pre) {
  margin: 0;
  padding: 10px 14px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre;
}

.doc-prose :deep(.doc-nested-scroll pre code) {
  padding: 0;
  background: none;
  font: inherit;
}

.doc-prose :deep(.doc-nested-scroll table) {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  line-height: 1.5;
}

.doc-prose :deep(.doc-nested-scroll th),
.doc-prose :deep(.doc-nested-scroll td) {
  padding: 8px 12px;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--rule);
}

.doc-prose :deep(blockquote) {
  padding-left: 16px;
  border-left: 2px solid var(--rule);
}

.doc-prose :deep(hr) {
  border: none;
  border-top: 1px solid var(--rule);
}

.doc-prose :deep(img) {
  max-width: 100%;
  height: auto;
}

.doc-prose :deep(.doc-figure) {
  margin: 0 0 18px;
}

.doc-prose :deep(.doc-figure img) {
  display: block;
  border: 1px solid var(--border);
}

.doc-prose :deep(.doc-figure figcaption) {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.62);
}
</style>
