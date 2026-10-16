<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import DocsCallout from './DocsCallout.vue'
import DocsCodeBlock from './DocsCodeBlock.vue'
import { renderMermaidDiagram } from './renderMermaid'

/**
 * A Mermaid diagram: drawn lazily as one image with the caption as its name,
 * inside a scroll region (so a wide diagram scrolls inside itself on a phone),
 * with the caption beneath and the "In words" text equivalent always visible
 * after it. If Mermaid cannot draw it, the source is shown as code with a
 * warning and the text version still follows, so the information is never lost.
 */
const props = defineProps<{
  source: string
  /** Becomes the figure's caption and the image's accessible name (the scroll region is just "Diagram", so the two do not repeat). */
  caption: string
  /** Sanitised HTML of the text equivalent; empty if the page has none. */
  textHtml: string
}>()

type DrawState = 'loading' | 'ready' | 'failed'

const drawState = ref<DrawState>('loading')
const canvasRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  try {
    const svgElement = await renderMermaidDiagram(props.source, props.caption || 'Diagram')
    drawState.value = 'ready'
    // The canvas only exists once the draw state is "ready".
    await nextTick()
    canvasRef.value?.replaceChildren(svgElement)
  } catch {
    drawState.value = 'failed'
  }
})
</script>

<template>
  <div class="doc-diagram-block">
    <figure class="doc-diagram">
      <div v-if="drawState === 'loading'" class="doc-diagram__loading" aria-busy="true">
        LOADING DIAGRAM
      </div>
      <div
        v-else-if="drawState === 'ready'"
        class="doc-diagram__scroll"
        role="region"
        tabindex="0"
        aria-label="Diagram"
      >
        <div ref="canvasRef" class="doc-diagram__canvas"></div>
      </div>
      <template v-else>
        <DocsCallout variant="warning">
          <p>This diagram couldn't be drawn; its text version follows.</p>
        </DocsCallout>
        <DocsCodeBlock language="mermaid" :code="source" />
      </template>
      <figcaption v-if="caption" class="doc-diagram__caption">{{ caption }}</figcaption>
    </figure>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify in renderDocument -->
    <div v-if="textHtml" class="doc-diagram-text" v-html="textHtml"></div>
  </div>
</template>

<style scoped>
.doc-diagram-block {
  max-width: 960px;
  margin: 0 0 24px;
}

.doc-diagram {
  margin: 0;
}

.doc-diagram__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  background: var(--surface);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-diagram__scroll {
  overflow-x: auto;
  padding: 16px;
  background: var(--canvas);
  border: 1px solid var(--border);
}

.doc-diagram__canvas :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.doc-diagram__caption {
  margin-top: 8px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  color: var(--ink);
}

/* The text equivalent: always visible, set off by a rule, led by a caption. */
.doc-diagram-text {
  margin-top: 14px;
  padding-left: 16px;
  border-left: 2px solid var(--rule);
  font-size: var(--doc-text-body);
  line-height: var(--doc-line);
  color: var(--ink);
}

.doc-diagram-text::before {
  content: 'IN WORDS';
  display: block;
  margin-bottom: 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-diagram-text :deep(ul),
.doc-diagram-text :deep(ol) {
  margin: 0;
  padding-left: 22px;
}

.doc-diagram-text :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.doc-diagram-text :deep(li) {
  margin-bottom: 6px;
}

@media (max-width: 768px) {
  /* Keep labels legible: the diagram keeps a readable minimum width and the
     scroll region scrolls instead of shrinking the text to nothing. */
  .doc-diagram__canvas :deep(svg) {
    width: max(100%, 560px);
    max-width: none !important;
  }
}
</style>
