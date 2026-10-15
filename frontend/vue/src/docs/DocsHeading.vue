<script setup lang="ts">
/**
 * The page's one h1, with the accent dot the Settings heading has. It is the
 * focus target when a page opens (`tabindex="-1"`, no ring: it is not a
 * control), and takes the markdown title's anchor id so `#the-title` links land.
 */
defineProps<{
  /** Anchor id of the heading; empty for views whose title has no anchor. */
  id?: string
}>()
</script>

<template>
  <h1 :id="id || undefined" class="doc-heading" tabindex="-1">
    <span class="doc-heading__dot" aria-hidden="true"></span>
    <span><slot /></span>
  </h1>
</template>

<style scoped>
.doc-heading {
  margin: 0;
  padding: 22px 0 6px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-heading);
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.25;
  text-transform: uppercase;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
  scroll-margin-top: 72px;
}

/* A programmatic focus target, not a control: no ring (Settings' heading is
   the same). The global focus-visible rule is !important, so this is too. */
.doc-heading:focus {
  outline: none !important;
}

.doc-heading__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
}

@media (min-width: 769px) {
  .doc-heading {
    padding-top: 34px;
    scroll-margin-top: 24px;
  }
}
</style>
