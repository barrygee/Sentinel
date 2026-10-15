<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { copyTextToClipboard } from './composables/useClipboardCopy'
import { useDocsStore } from './docsStore'

/**
 * The little link glyph after a heading. Following it moves to the heading
 * (the URL gains the `#fragment`) and copies that URL, so a reader can share a
 * link to a section. Shown on hover or focus; always shown on touch screens.
 */
const props = defineProps<{ headingId: string; headingText: string }>()

const route = useRoute()
const router = useRouter()
const docsStore = useDocsStore()

async function followAndCopy(event: MouseEvent): Promise<void> {
  event.preventDefault()
  const target = { path: route.path, query: route.query, hash: `#${props.headingId}` }
  const resolved = router.resolve(target)
  void router.replace(target)
  const copied = await copyTextToClipboard(new URL(resolved.href, window.location.origin).href)
  if (copied) docsStore.announce('Link to section copied')
}
</script>

<template>
  <a
    class="doc-anchor"
    :href="`#${headingId}`"
    :aria-label="`Link to section: ${headingText}`"
    @click="followAndCopy"
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M6 8a2.4 2.4 0 0 0 3.4 0l2-2A2.4 2.4 0 0 0 8 2.6L7.2 3.4M8 6a2.4 2.4 0 0 0-3.4 0l-2 2A2.4 2.4 0 0 0 6 11.4l.8-.8"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </a>
</template>

<style scoped>
.doc-anchor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* A 24x24 target around the 14px glyph (WCAG 2.5.8). */
  width: 24px;
  height: 24px;
  margin-left: 6px;
  vertical-align: middle;
  color: rgba(var(--ink-rgb), 0.62);
  opacity: 0;
  transition: opacity 0.15s;
}

:is(h2, h3, h4):hover > .doc-anchor,
.doc-anchor:focus-visible {
  opacity: 1;
}

.doc-anchor:hover {
  color: var(--ink-strong);
}

/* No hover on touch screens, so the anchor would be undiscoverable. */
@media (hover: none) {
  .doc-anchor {
    opacity: 0.5;
  }
}
</style>
