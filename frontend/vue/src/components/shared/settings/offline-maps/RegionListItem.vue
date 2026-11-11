<template>
  <li class="sdr-device-item oma-region-item">
    <div class="sdr-device-row oma-region-row">
      <div class="oma-region-summary" :class="{ 'oma-region-summary--dimmed': confirming }">
        <button
          ref="selectButtonRef"
          type="button"
          class="sdr-device-info oma-region-select"
          :disabled="confirming"
          :aria-label="`Show ${region.label} on map`"
          @click="emit('select')"
        >
          {{ region.label }}
        </button>
        <span class="oma-region-meta">
          z{{ region.max_zoom }} · {{ contentsSummary }} · {{ metaTail }}
        </span>
        <p
          v-if="region.status === 'failed' && region.error"
          class="oma-region-error"
          :role="failedThisSession ? 'alert' : undefined"
        >
          {{ region.error }}
        </p>
        <DownloadProgress
          v-if="isActive"
          class="oma-region-progress"
          :status="region.status"
          :phase="region.phase"
          :bytes-done="region.bytes_done"
          :bytes-estimated="region.bytes_estimated"
          @cancel="emit('cancel-job')"
        />
      </div>
      <template v-if="!isActive">
        <BaseIconAction
          v-if="!confirming"
          ref="deleteButtonRef"
          class="sdr-device-btn oma-region-delete"
          variant="row"
          danger
          title="Delete"
          :accessible-name="`Delete offline area ${region.label}`"
          @click="emit('delete-request')"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <line
              x1="2.5"
              y1="2.5"
              x2="10.5"
              y2="10.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <line
              x1="10.5"
              y1="2.5"
              x2="2.5"
              y2="10.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </BaseIconAction>
        <BaseInlineConfirm
          v-else
          class="oma-region-confirm"
          label="DELETE?"
          initial-focus="cancel"
          @confirm="emit('delete-confirm')"
          @cancel="emit('delete-cancel')"
        />
      </template>
    </div>
  </li>
</template>

<script setup lang="ts">
/**
 * `RegionListItem` — one offline area, at any stage: queued/running (an
 * embedded `DownloadProgress` + a Cancel action in place of Delete), complete
 * (label, zoom, contents, size — click to fly there), or failed/
 * cancelled (a status badge, the error text for a failure, and Delete to
 * dismiss it). Delete asks for confirmation inline (never `window.confirm`,
 * which is both inaccessible chrome and untestable) — the same disclosure
 * pattern `SdrManagerHostsControl.vue` uses for its own per-row delete.
 *
 * Focus management (WCAG 2.4.3/3.2.2): entering the delete confirmation moves
 * focus to NO (the safe default so a stray Enter/Space can't confirm a
 * destructive action); cancelling returns it to this row's Delete button.
 * Where focus goes after a *confirmed* delete depends on which rows remain,
 * which only the list (`RegionList.vue`) can know — see its `focusSelectButton`
 * export below.
 */
import { computed, nextTick, ref, watch } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import BaseInlineConfirm from '@sentinel/ui/base/BaseInlineConfirm.vue'
import DownloadProgress from './DownloadProgress.vue'
import { formatByteSize } from '@sentinel/shell-api/utils/offlineMapEstimate'
import type { OfflineRegion } from '@sentinel/shell-api/services/offlineMapsApi'
import '@sentinel/shell-api/settings/styles/deviceList.css'

const props = defineProps<{
  region: OfflineRegion
  /** True while this row's delete confirmation is showing. */
  confirming: boolean
}>()

const emit = defineEmits<{
  /** Fly the settings map to this region's bounds. */
  select: []
  /** Cancel a queued/running job (shown instead of delete while active). */
  'cancel-job': []
  'delete-request': []
  'delete-confirm': []
  'delete-cancel': []
}>()

const isActive = computed(
  () => props.region.status === 'queued' || props.region.status === 'running',
)

const contentsSummary = computed(() => {
  const parts: string[] = []
  if (props.region.include_basemap) parts.push('basemap')
  if (props.region.include_terrain) parts.push('terrain')
  return parts.length > 0 ? parts.join(' + ') : 'no contents'
})

/** The trailing part of the meta line — a failed/cancelled region never claims a
 *  size (H4: it must not read as "complete" with "0 B"). */
const metaTail = computed(() => {
  if (props.region.status === 'complete') {
    return formatByteSize(props.region.size_bytes ?? 0)
  }
  if (props.region.status === 'failed') return 'Failed'
  if (props.region.status === 'cancelled') return 'Cancelled'
  return props.region.status.toUpperCase()
})

const selectButtonRef = ref<HTMLButtonElement | null>(null)
const deleteButtonRef = ref<InstanceType<typeof BaseIconAction> | null>(null)

// Opening the confirm focuses its NO (BaseInlineConfirm's initial-focus: the
// safe default, since a stray Enter/Space there can't confirm a destructive
// action). Closing it returns focus to the row's delete button.
watch(
  () => props.confirming,
  async (confirming) => {
    if (confirming) return
    await nextTick()
    // If this fires because the row was instead just confirmed for deletion,
    // the row is about to be removed from the list and `RegionList` takes
    // over focus.
    deleteButtonRef.value?.focus()
  },
)

/**
 * True only when this row turned `failed` while it was on screen. The error is
 * then an alert; a region that had already failed before the list mounted
 * renders the same text silently, so reopening Settings doesn't re-announce
 * every old failure.
 */
const failedThisSession = ref(false)
watch(
  () => props.region.status,
  (status, previousStatus) => {
    // `previousStatus !== 'failed'` is a defensive half only: Vue's watch
    // callback only ever fires when the watched value actually changed, so
    // whenever `status` is newly 'failed', `previousStatus` can never itself
    // already be 'failed' — the guard's false side is unreachable, not a gap
    // in testing.
    /* v8 ignore start -- previousStatus === 'failed' can't coexist with a fresh status==='failed' (see comment above) */
    if (status === 'failed' && previousStatus !== 'failed') failedThisSession.value = true
    /* v8 ignore stop */
  },
)

/** Used by `RegionList` to move focus onto the row that now occupies a
 *  just-deleted row's position. */
function focusSelectButton(): void {
  selectButtonRef.value?.focus()
}

defineExpose({ focusSelectButton })
</script>

<style scoped>
/* Row, name, delete icon and the DELETE? YES / NO confirmation all use the
   settings panel's shared device-list styles (as in the SDR hosts list),
   so this list looks like the others in Settings. Only what those classes
   don't cover lives here. */
.oma-region-row {
  align-items: flex-start;
}

.oma-region-summary {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* Same dimming the SDR hosts list gives a row awaiting delete confirmation. */
.oma-region-summary--dimmed {
  opacity: 0.4;
}

.oma-region-select {
  align-self: flex-start;
  max-width: 100%;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.oma-region-select:disabled {
  cursor: default;
}

.oma-region-meta {
  color: rgba(var(--ink-rgb), 0.6);
}

.oma-region-error {
  margin: 0;
  font-weight: 500;
  color: var(--danger-hover);
}

.oma-region-progress {
  margin-top: 6px;
}
</style>
