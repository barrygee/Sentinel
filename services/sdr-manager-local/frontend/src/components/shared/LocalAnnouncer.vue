<template>
  <p class="sr-only" aria-live="polite">{{ store.announcement }}</p>
</template>

<script setup lang="ts">
/**
 * `LocalAnnouncer` — the one polite live region the THIS MACHINE screens
 * speak through: a device plugged in or unplugged, an edit saved, a hotspot
 * started. Mounted once, by the devices card, which is always on the page.
 * Not `role="status"`: other cards in Settings already carry that role.
 */
import { useLocalSdrStore } from '../../stores/localSdrStore'

const store = useLocalSdrStore()
</script>
