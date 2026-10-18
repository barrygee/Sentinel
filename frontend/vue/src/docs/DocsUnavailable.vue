<script setup lang="ts">
import '@/assets/lightIsland.css'
import './docTokens.css'
import { onMounted, ref } from 'vue'
import DocsHeading from './DocsHeading.vue'
import { useDocsReturn } from './composables/useDocsReturn'

/**
 * What `/docs/...` shows when the documentation cannot be loaded: the optional
 * docs service is left out of this deployment, or is down. Sits where the docs
 * page does, between the header and footer; Escape closes it the same way.
 * Its heading takes focus on arrival, as the docs page's does (App leaves
 * focus on docs routes to the view).
 */
const { closeDocs } = useDocsReturn()
const rootRef = ref<HTMLElement | null>(null)

onMounted(() => {
  rootRef.value?.querySelector<HTMLElement>('h1')?.focus()
})
</script>

<template>
  <section
    ref="rootRef"
    class="docs-unavailable theme-light light-island"
    data-testid="docs-unavailable"
    aria-labelledby="docs-unavailable-heading"
    @keydown.esc="closeDocs"
  >
    <div class="docs-unavailable__body">
      <DocsHeading id="docs-unavailable-heading">DOCS UNAVAILABLE</DocsHeading>
      <p class="docs-unavailable__detail">
        The documentation service is not running. The rest of Sentinel keeps working; start the
        <code>docs</code> service and reload the page to read the docs.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Same place and layer as the docs page (and the Settings panel). */
.docs-unavailable {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 0;
  right: 0;
  z-index: 10000;
  overflow-y: auto;
  background-color: var(--canvas);
  color: var(--ink);
}

.docs-unavailable__body {
  max-width: var(--doc-measure, 720px);
  padding: 12px 16px 80px;
}

.docs-unavailable__detail {
  margin: 26px 0 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--doc-text-body);
  line-height: var(--doc-line);
  /* --ink-secondary, not --ink-muted: body text needs AA contrast. */
  color: var(--ink-secondary);
}

@media (min-width: 769px) {
  .docs-unavailable__body {
    padding: 12px 24px 90px;
  }
}

@media (min-width: 1025px) {
  .docs-unavailable__body {
    padding: 12px 44px 110px;
  }
}
</style>
