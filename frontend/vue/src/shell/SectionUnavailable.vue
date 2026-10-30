<template>
  <ShellNotice
    heading-id="section-unavailable-heading"
    :heading="`${label} is unavailable`"
    detail="Its code could not be loaded. The other sections keep working; reload the page to try again."
  />
</template>

<script setup lang="ts">
/**
 * What a section's route shows when the section could not be loaded (its
 * remote is down or failed to start) — docs/plans/section-containers.md §3.5.
 */
import ShellNotice from './ShellNotice.vue'

defineProps<{
  /** The section's nav label, e.g. "SEA". */
  label: string
}>()
</script>
