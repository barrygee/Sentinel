<template>
  <p v-if="!loaded" class="history-summary-note">Checking what is recorded…</p>
  <p v-else-if="!status" class="history-summary-note">
    Recording status unavailable (the section service is not answering).
  </p>
  <dl v-else class="history-summary" aria-live="polite">
    <div class="history-summary-row">
      <dt>STATUS</dt>
      <dd>{{ status.enabled ? 'Recording' : 'Not recording' }}</dd>
    </div>
    <div class="history-summary-row history-summary-row--stacked">
      <dt>RECORDED</dt>
      <dd>
        <HistoryRecordedPeriods v-if="hasCoverage" :periods="periods" />
        <template v-else-if="status.oldestMs !== null && status.newestMs !== null">
          {{ status.tleVersions }} orbit versions,
          {{ formatPeriod(status.oldestMs, status.newestMs) }}
        </template>
        <template v-else>Nothing recorded yet</template>
      </dd>
    </div>
    <div class="history-summary-row">
      <dt>SIZE</dt>
      <dd>{{ sizeText }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
/**
 * What a section has recorded for replay: whether it is recording, the time
 * frames recorded so far, and the file size — the history's own and, beside
 * it, the section's whole database (Air's also holds its ADS-B cache, so on
 * its own that size would read as history). Read when shown and again after
 * APPLY CHANGES or a config-file edit, so it follows the toggle.
 */
import { computed, onMounted, ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import HistoryRecordedPeriods from '@sentinel/shell-api/playback/HistoryRecordedPeriods.vue'
import {
  fetchHistoryCoverage,
  fetchHistoryStatus,
  type HistoryStatus,
} from '@sentinel/shell-api/playback/historyApi'
import {
  formatBytes,
  formatPeriod,
  mergeCoveragePeriods,
  type RecordedPeriod,
} from '@sentinel/shell-api/playback/historySummary'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'

const props = defineProps<{ sectionId: PlaybackSectionId }>()

/** Space keeps orbit versions, not positions: it has no recorded stretches to list. */
const hasCoverage = computed(() => props.sectionId !== 'space')

const status = ref<HistoryStatus | null>(null)
const periods = ref<RecordedPeriod[]>([])
const loaded = ref(false)

async function load(): Promise<void> {
  const [statusReply, coverage] = await Promise.all([
    fetchHistoryStatus(props.sectionId),
    hasCoverage.value ? fetchHistoryCoverage(props.sectionId) : Promise.resolve(null),
  ])
  status.value = statusReply
  periods.value = coverage ? mergeCoveragePeriods(coverage.buckets, coverage.bucketMs) : []
  loaded.value = true
}

onMounted(load)
useDocumentEvent('sentinel:config-uploaded', load)

const sizeText = computed(() => {
  const current = status.value!
  return typeof current.historyBytes === 'number'
    ? `${formatBytes(current.historyBytes)} history · ${formatBytes(current.databaseBytes)} database`
    : `${formatBytes(current.databaseBytes)} database`
})
</script>

<style scoped>
.history-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 0 0;
}
.history-summary-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.history-summary-row--stacked {
  flex-direction: column;
  gap: 6px;
}
.history-summary dt {
  min-width: 70px;
  font-family: var(--font-primary);
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgba(var(--ink-rgb), 0.6);
}
.history-summary dd {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--settings-text-small);
  color: var(--ink-strong);
}
.history-summary-row--stacked dd {
  width: 100%;
}
.history-summary-note {
  margin: 6px 0 0;
  font-size: var(--settings-text-small);
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
