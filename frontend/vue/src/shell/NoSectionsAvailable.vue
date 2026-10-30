<template>
  <ShellNotice
    heading-id="no-sections-available-heading"
    heading="No sections are available"
    detail="The list of sections could not be loaded, or this deployment runs none. Check the server is up, then reload the page to try again."
  />
</template>

<script setup lang="ts">
/**
 * What the app shows when no section registered at all — `GET
 * /api/app/sections` failed (core down, the gateway answering 503) or listed
 * nothing. Every non-Settings, non-Docs URL lands here (`createAppRouter`).
 */
import ShellNotice from './ShellNotice.vue'
</script>
