<template>
  <div class="oma-region-list-wrap">
    <h3 id="oma-region-list-heading" ref="headingRef" tabindex="-1" class="oma-region-list-heading">
      Downloaded Areas
    </h3>
    <p v-if="regions.length === 0" class="oma-region-list-empty">
      No offline areas downloaded yet.
    </p>
    <ul v-else class="oma-region-list" aria-labelledby="oma-region-list-heading">
      <RegionListItem
        v-for="(region, index) in regions"
        :key="region.id"
        :ref="(itemInstance) => registerItemRef(region.id, itemInstance)"
        :region="region"
        :confirming="confirmId === region.id"
        @select="emit('select-region', region)"
        @cancel-job="emit('delete-region', region.id)"
        @delete-request="confirmId = region.id"
        @delete-confirm="onDeleteConfirm(region, index)"
        @delete-cancel="confirmId = null"
      />
    </ul>
    <p class="oma-region-list-total">Total downloaded: {{ formatByteSize(totalBytes) }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `RegionList` — every known offline area, queued/running/complete/failed/
 * cancelled alike (the store polls all of them regardless of whether this
 * panel is even mounted — see `stores/offlineMaps.ts`), plus the total disk
 * usage line. Owns which row's delete confirmation is open, and — because
 * only the list knows what remains after a row is removed — where focus goes
 * once a confirmed delete actually completes (WCAG 2.4.3): the row that now
 * occupies the deleted row's position, or this list's own heading if the list
 * is now empty.
 */
import { nextTick, ref, watch } from 'vue'
import RegionListItem from './RegionListItem.vue'
import { formatByteSize } from '@/utils/offlineMapEstimate'
import type { OfflineRegion } from '@/services/offlineMapsApi'

const props = defineProps<{
  regions: OfflineRegion[]
  totalBytes: number
}>()

const emit = defineEmits<{
  'select-region': [region: OfflineRegion]
  'delete-region': [regionId: string]
}>()

const confirmId = ref<string | null>(null)
const headingRef = ref<HTMLElement | null>(null)
const itemRefs = new Map<string, InstanceType<typeof RegionListItem>>()

function registerItemRef(regionId: string, itemInstance: unknown): void {
  if (itemInstance) itemRefs.set(regionId, itemInstance as InstanceType<typeof RegionListItem>)
  else itemRefs.delete(regionId)
}

/** Set by `onDeleteConfirm`, consumed once `props.regions` actually shrinks —
 *  the deletion itself is async (the parent awaits the store), so focus can't
 *  move until the row has genuinely gone. */
let pendingFocusIndex: number | null = null

function onDeleteConfirm(region: OfflineRegion, index: number): void {
  confirmId.value = null
  pendingFocusIndex = index
  emit('delete-region', region.id)
}

watch(
  () => props.regions,
  async (currentRegions, previousRegions) => {
    if (pendingFocusIndex === null) return
    if (currentRegions.length >= previousRegions.length) return // deletion hasn't landed yet
    const index = pendingFocusIndex
    pendingFocusIndex = null
    await nextTick()
    const nextRegion = currentRegions[index] ?? currentRegions[index - 1]
    if (nextRegion) itemRefs.get(nextRegion.id)?.focusSelectButton()
    else headingRef.value?.focus()
  },
)
</script>

<style scoped>
.oma-region-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oma-region-list-heading {
  margin: 0;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.6); /* matches .settings-location-label (AA) */
}

/* Focusable only programmatically (WCAG-legitimate: it is the fallback focus
   target once the list empties, not a control) — never in the Tab order. */
.oma-region-list-heading:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.oma-region-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.oma-region-list-empty {
  margin: 0;
  font-size: var(--settings-text-body);
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}

.oma-region-list-total {
  margin: 0;
  font-size: var(--settings-text-body);
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
