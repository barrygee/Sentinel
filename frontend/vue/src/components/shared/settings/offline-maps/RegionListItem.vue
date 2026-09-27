<template>
  <li class="oma-region-item">
    <div class="oma-region-summary">
      <button
        ref="selectButtonRef"
        type="button"
        class="oma-region-select"
        :disabled="confirming"
        :aria-label="`Show ${region.label} on map`"
        @click="emit('select')"
      >
        <span class="oma-region-label">{{ region.label }}</span>
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
      <button
        v-if="!confirming"
        ref="deleteButtonRef"
        type="button"
        class="oma-region-delete"
        :aria-label="`Delete offline area ${region.label}`"
        @click="emit('delete-request')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <line x1="2.5" y1="2.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" />
          <line x1="10.5" y1="2.5" x2="2.5" y2="10.5" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
      <div v-else class="oma-region-confirm">
        <span class="oma-region-confirm-label">DELETE?</span>
        <BaseButton type="button" variant="danger" @click="emit('delete-confirm')">YES</BaseButton>
        <BaseButton
          ref="confirmNoButtonRef"
          type="button"
          variant="ghost"
          @click="emit('delete-cancel')"
        >
          NO
        </BaseButton>
      </div>
    </template>
  </li>
</template>

<script setup lang="ts">
/**
 * `RegionListItem` — one offline area, at any stage: queued/running (an
 * embedded `DownloadProgress` + a Cancel action in place of Delete), complete
 * (label, zoom, contents, size, date — click to fly there), or failed/
 * cancelled (a status badge, the error text for a failure, and Delete to
 * dismiss it). Delete asks for confirmation inline (never `window.confirm`,
 * which is both inaccessible chrome and untestable) — the same disclosure
 * pattern `SentryHostsControl.vue` uses for its own per-row delete.
 *
 * Focus management (WCAG 2.4.3/3.2.2): entering the delete confirmation moves
 * focus to NO (the safe default so a stray Enter/Space can't confirm a
 * destructive action); cancelling returns it to this row's Delete button.
 * Where focus goes after a *confirmed* delete depends on which rows remain,
 * which only the list (`RegionList.vue`) can know — see its `focusSelectButton`
 * export below.
 */
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import DownloadProgress from './DownloadProgress.vue'
import { formatByteSize } from '@/utils/offlineMapEstimate'
import type { OfflineRegion } from '@/services/offlineMapsApi'

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
    return `${formatByteSize(props.region.size_bytes ?? 0)} · ${new Date(props.region.created_at).toLocaleDateString()}`
  }
  if (props.region.status === 'failed') return 'Failed'
  if (props.region.status === 'cancelled') return 'Cancelled'
  return props.region.status.toUpperCase()
})

const selectButtonRef = ref<HTMLButtonElement | null>(null)
const deleteButtonRef = ref<HTMLButtonElement | null>(null)
const confirmNoButtonRef = ref<InstanceType<typeof BaseButton> | null>(null)

watch(
  () => props.confirming,
  async (confirming) => {
    await nextTick()
    if (confirming) {
      // NO is the safe default focus target — a stray Enter/Space while
      // focus lands here can't confirm a destructive action.
      const noButtonElement = confirmNoButtonRef.value?.$el as HTMLButtonElement | undefined
      noButtonElement?.focus()
    } else {
      // Cancelling returns focus to the row it came from. If this fires
      // because the row was instead just confirmed for deletion, the row is
      // about to be removed from the list and `RegionList` takes over focus.
      deleteButtonRef.value?.focus()
    }
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
.oma-region-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid var(--rule);
  padding: 12px 0;
}

.oma-region-summary {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.oma-region-select {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}

.oma-region-select:disabled {
  cursor: default;
  opacity: 0.5;
}

.oma-region-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.oma-region-meta {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}

.oma-region-error {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--danger-hover);
}

.oma-region-progress {
  margin-top: 4px;
}

.oma-region-delete {
  flex-shrink: 0;
  min-width: 24px;
  min-height: 24px;
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--danger);
}

.oma-region-confirm {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.oma-region-confirm-label {
  white-space: nowrap;
}
</style>
