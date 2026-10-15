<script setup lang="ts">
import { useDocsStore } from './docsStore'

/**
 * The docs page's single, visually hidden live region. Everything the page
 * announces (search result counts, "Copied to clipboard") goes through
 * `docsStore.announce` into this one element, so a screen reader hears one
 * calm voice and the e2e suite never meets a second `role="status"` on the page.
 */
const docsStore = useDocsStore()
</script>

<template>
  <div
    id="docs-live-status"
    class="sr-only"
    role="status"
    aria-live="polite"
    data-testid="docs-live-status"
  >
    {{ docsStore.announcement }}
  </div>
</template>
