<template>
  <div class="oma-progress" role="group" :aria-label="`${phaseLabel} progress`">
    <!-- Omitting `value` (rather than binding 0) renders a real indeterminate native
         progress bar until the first bytes arrive, per the plan. -->
    <progress
      class="oma-progress-bar"
      :value="isIndeterminate ? undefined : percent"
      max="100"
      :aria-label="progressAccessibleName"
    >
      {{ percent }}%
    </progress>
    <div class="oma-progress-footer">
      <span v-if="isIndeterminate" class="oma-progress-status">{{ phaseLabel }} — starting…</span>
      <span v-else class="oma-progress-status"
        >{{ phaseLabel }} — {{ percent }}% · {{ formatByteSize(bytesDone) }} /
        {{ formatByteSize(bytesEstimated) }}</span
      >
      <BaseButton type="button" variant="danger" @click="emit('cancel')">CANCEL</BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `DownloadProgress` — a compact inline progress readout for one queued/
 * running region, composed into `RegionListItem` (several jobs can be
 * outstanding at once — see the store's `pollKnownRegions` — so this is a
 * per-row widget, not a single page-level "the active job" area). A native
 * `<progress>` element rather than a styled div, so assistive tech gets the
 * role/value semantics for free; `bytes_estimated` starting at 0 (queued, no
 * bytes yet) reads as an indeterminate 0%, matching the plan's
 * "indeterminate until the first bytes arrive".
 */
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { formatByteSize } from '@/utils/offlineMapEstimate'
import type { OfflineRegionPhase, OfflineRegionStatus } from '@/services/offlineMapsApi'

const props = defineProps<{
  status: OfflineRegionStatus
  phase: OfflineRegionPhase
  bytesDone: number
  bytesEstimated: number
}>()

const emit = defineEmits<{
  cancel: []
}>()

const isIndeterminate = computed(() => props.bytesEstimated <= 0 || props.bytesDone <= 0)

const percent = computed(() => {
  if (props.bytesEstimated <= 0) return 0
  return Math.min(100, Math.round((props.bytesDone / props.bytesEstimated) * 100))
})

const phaseLabel = computed(() => {
  if (props.status === 'queued') return 'QUEUED'
  if (props.phase === 'basemap') return 'DOWNLOADING BASEMAP'
  if (props.phase === 'terrain') return 'DOWNLOADING TERRAIN'
  return props.status.toUpperCase()
})

const progressAccessibleName = computed(() => `${phaseLabel.value} download progress`)
</script>

<style scoped>
.oma-progress {
  display: flex;
  flex-direction: column;
  /* Room between the bar and the status / CANCEL row beneath it. */
  gap: 12px;
  width: 100%;
}

.oma-progress-bar {
  width: 100%;
  height: 6px;
  appearance: none;
}

.oma-progress-bar::-webkit-progress-bar {
  background: var(--surface);
}

.oma-progress-bar::-webkit-progress-value {
  background: var(--color-accent);
}

.oma-progress-bar::-moz-progress-bar {
  background: var(--color-accent);
}

.oma-progress-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Smaller than the group's 12.5px text: a secondary read-out beside the
   CANCEL button, not a label (the group-wide size rule excludes it). */
.oma-progress-footer .oma-progress-status {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
