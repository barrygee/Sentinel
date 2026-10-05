<template>
  <section class="section-unavailable" aria-labelledby="section-unavailable-heading">
    <h1 id="section-unavailable-heading" class="section-unavailable__heading">
      {{ label }} is unavailable
    </h1>
    <p class="section-unavailable__detail">
      Its code could not be loaded. The other sections keep working; reload the page to try again.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * What a section's route shows when the section could not be loaded (its
 * remote is down or failed to start) — docs/plans/section-containers.md §3.5.
 */
defineProps<{
  /** The section's nav label, e.g. "SEA". */
  label: string
}>()
</script>

<style scoped>
.section-unavailable {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 100%;
  padding: 32px 16px;
  text-align: center;
  background: var(--canvas);
  color: var(--ink);
}

.section-unavailable__heading {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.12em;
  color: var(--ink-strong);
}

.section-unavailable__detail {
  margin: 0;
  max-width: 36ch;
  font-size: 0.875rem;
  line-height: 1.5;
  /* --ink-secondary, not --ink-muted: body text needs AA contrast. */
  color: var(--ink-secondary);
}
</style>
