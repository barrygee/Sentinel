<template>
  <AppNavBar />
</template>

<script setup lang="ts">
/**
 * `SdrManagerOnlyHeader` — the nav bar of SDR Manager-only mode: just the
 * logo, where the full app lists its sections. It is the same `AppNavBar` the
 * full app uses, so both modes have the same bar.
 */
import AppNavBar from '@/components/shared/AppNavBar.vue'
</script>
