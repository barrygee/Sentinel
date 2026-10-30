<template>
  <section class="shell-notice" :aria-labelledby="headingId">
    <h1 :id="headingId" class="shell-notice__heading">{{ heading }}</h1>
    <p class="shell-notice__detail">{{ detail }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * A full-view notice the shell shows in place of a section's map: something
 * could not be loaded, and what the operator can do about it. The specific
 * notices (`SectionUnavailable`, `NoSectionsAvailable`) supply the wording.
 */
defineProps<{
  /** The heading's id, which labels the section; unique on the page. */
  headingId: string
  heading: string
  detail: string
}>()
</script>

<style scoped>
.shell-notice {
  /* Fills the viewport behind the fixed nav and footer, as a section's map
     does (.map-container), padded so the text stays clear of both bars. */
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: calc(var(--nav-height) + 32px) 16px calc(var(--footer-height) + 32px);
  text-align: center;
  background: var(--canvas);
  color: var(--ink);
}

.shell-notice__heading {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.12em;
  color: var(--ink-strong);
}

.shell-notice__detail {
  margin: 0;
  max-width: 36ch;
  font-size: 0.875rem;
  line-height: 1.5;
  /* --ink-secondary, not --ink-muted: body text needs AA contrast. */
  color: var(--ink-secondary);
}
</style>
