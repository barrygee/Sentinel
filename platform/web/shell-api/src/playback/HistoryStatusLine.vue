<template>
  <p class="history-status-line" aria-live="polite">{{ text }}</p>
</template>

<script setup lang="ts">
/**
 * What a section has recorded for replay:
 * "Recording · 3.2 days kept · 412 MB of history (790 MB database)".
 * Read when shown and again after APPLY CHANGES or a config-file edit, so it
 * follows the toggle.
 */
import { computed, onMounted, ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { fetchHistoryStatus, type HistoryStatus } from '@sentinel/shell-api/playback/historyApi'
import { DAY_MS, type PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'

const props = defineProps<{ sectionId: PlaybackSectionId }>()

const status = ref<HistoryStatus | null>(null)
const loaded = ref(false)

async function load(): Promise<void> {
  status.value = await fetchHistoryStatus(props.sectionId)
  loaded.value = true
}

onMounted(load)
useDocumentEvent('sentinel:config-uploaded', load)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 KB'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const text = computed(() => {
  if (!loaded.value) return 'Checking what is recorded…'
  const current = status.value
  if (!current) return 'Recording status unavailable (the section service is not answering).'
  const parts = [current.enabled ? 'Recording' : 'Not recording']
  if (current.oldestMs !== null && current.newestMs !== null) {
    const days = (current.newestMs - current.oldestMs) / DAY_MS
    parts.push(days < 0.1 ? 'under 2 hours kept' : `${days.toFixed(1)} days kept`)
  } else {
    parts.push('nothing kept yet')
  }
  if (current.tleVersions !== undefined) parts.push(`${current.tleVersions} orbit versions`)
  // The history's own size is what recording costs; the whole database is
  // shown beside it because a section's other tables can dwarf it (Air's
  // ADS-B cache), and without the split that size reads as history.
  parts.push(
    typeof current.historyBytes === 'number'
      ? `${formatBytes(current.historyBytes)} of history (${formatBytes(current.databaseBytes)} database)`
      : `${formatBytes(current.databaseBytes)} database`,
  )
  return parts.join(' · ')
})
</script>

<style scoped>
.history-status-line {
  margin: 6px 0 0;
  font-size: var(--settings-text-small);
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
