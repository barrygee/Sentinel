<script setup lang="ts">
import '@/assets/lightIsland.css'
import { onMounted, ref } from 'vue'
import DocsPage from './DocsPage.vue'
import DocsUnavailable from './DocsUnavailable.vue'
import { loadDocsLibrary } from './docsSources'

/**
 * The `/docs/...` route's view: loads the documentation from the docs service,
 * then shows the docs page — or, when the service is left out or down, the
 * "docs unavailable" page. The docs page itself only mounts once the library
 * is there, so it, its search and its composables read it synchronously.
 */
type LoadState = 'loading' | 'ready' | 'unavailable'
const state = ref<LoadState>('loading')

onMounted(async () => {
  try {
    await loadDocsLibrary()
    state.value = 'ready'
  } catch (error) {
    console.error('[sentinel] docs unavailable:', error)
    state.value = 'unavailable'
  }
})
</script>

<template>
  <DocsPage v-if="state === 'ready'" />
  <DocsUnavailable v-else-if="state === 'unavailable'" />
  <!-- Covers the map while the library loads, as the page will. -->
  <div
    v-else
    class="docs-loading theme-light light-island"
    data-testid="docs-loading"
    aria-busy="true"
  >
    <span class="sr-only">Loading the docs</span>
  </div>
</template>

<style scoped>
.docs-loading {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 0;
  right: 0;
  z-index: 10000;
  background-color: var(--canvas);
}
</style>
