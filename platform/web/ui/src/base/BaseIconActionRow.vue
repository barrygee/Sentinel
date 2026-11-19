<template>
  <div class="ba-icon-action-row">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * `BaseIconActionRow` — lays out a run of `BaseIconAction variant="accessory"`
 * controls (an expanded map-list accordion's track / alert / centre buttons):
 * left-aligned, 8px apart, every button stretched to the row's height. The
 * caller owns the padding around the row, which differs per accordion.
 */
</script>

<style scoped>
.ba-icon-action-row {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
}
</style>
