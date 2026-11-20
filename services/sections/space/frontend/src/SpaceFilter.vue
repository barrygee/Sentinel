<template>
  <BaseFilterPanel
    ref="panelRef"
    :items="items"
    :query="query"
    :expanded-key="expandedNoradId"
    id-prefix="space-filter"
    input-label="Filter satellites by name, NORAD ID or category"
    placeholder="SATELLITE NAME · NORAD ID · CATEGORY"
    listbox-label="Satellites"
    :empty-message="emptyMessage"
    @update:query="query = $event"
    @update:expanded-key="onExpandedKeyChange"
    @clear="collapseExpanded"
    @row-enter="onRowEnter"
    @row-leave="schedulePreviewClear"
  >
    <template #accordion>
      <SatelliteAccordionBody
        :satellite="expandedSat!"
        :telemetry="liveTelemetry"
        :live-az-el="liveAzEl"
        :passes="accordionPasses"
        :loading="accordionLoading"
        :status="accordionStatus"
        :now="now"
        :is-pass-active="isNow"
        :following="followedNoradId === expandedSat!.norad_id"
        :notifying="notifNoradId === expandedSat!.norad_id"
        :auto-tune-armed="isArmed(expandedSat!.norad_id)"
        :record-armed="isRecordArmed(expandedSat!.norad_id)"
        :conflict-text="autoTuneConflictText"
        @track="trackSat(expandedSat!)"
        @toggle-pass-notif="togglePassNotif(expandedSat!)"
        @toggle-auto-tune="toggleAutoTune(expandedSat!)"
        @toggle-record="toggleRecord(expandedSat!)"
      />
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Space FILTER pane — the searchable list of satellites, one category at a time.
 *
 * Supplies rows and expanded-row content to the shared BaseFilterPanel shell
 * (combobox, listbox/aria-owns wiring, roving keyboard navigation, focusable
 * scroll region, accordion). What stays here is the wiring: loading the TLE
 * database, opening and closing the expanded satellite (and restoring it after
 * navigation), and the map preview and actions a row offers. The search rules,
 * pass predictions and lock-in check live in `./filter/`; the accordion body is
 * `SatelliteAccordionBody`, shared with the PASSES pane.
 */
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import BaseFilterPanel from '@sentinel/ui/base/BaseFilterPanel.vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { useSpaceStore } from './stores/space'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { isAutoTuneEnabled } from './controls/satellite/passNotifStore'
import { useSatelliteActions } from './composables/useSatelliteActions'
import { useLiveSatelliteTelemetry } from './composables/useLiveSatelliteTelemetry'
import { useSatellitePreviewHover } from './composables/useSatellitePreviewHover'
import SatelliteAccordionBody from './SatelliteAccordionBody.vue'
import type { AccPass } from './spacePassesUtils'
import { useSatelliteFilterResults } from './filter/useSatelliteFilterResults'
import { useSatelliteAccordionPasses } from './filter/useSatelliteAccordionPasses'
import { useArmedPassConflict } from './filter/useArmedPassConflict'
import type { SatEntry } from './filter/spaceFilterTypes'
import './SatelliteAccordion.css'

const props = defineProps<{
  satelliteControl: SatelliteControl | null
  getUserLocation: () => [number, number] | null
}>()

const panelRef = useTemplateRef<InstanceType<typeof BaseFilterPanel>>('panelRef')

// Search query, the expanded satellite accordion, and which category sections
// are collapsed all persist so the Search pane resumes exactly as you left it
// after navigating away from Space (and across a full refresh). They live on the
// store (a singleton) so restore is independent of this teleported pane's
// remount timing.
const spaceStore = useSpaceStore()
const {
  searchQuery: query,
  searchExpandedNorad: expandedNoradId,
  // The active FILTER category, selected via the rail sub-tabs in MapSidebar.
  // Single-select — only this category's satellites render in the panel.
  spaceFilterCategory: filterCategory,
} = storeToRefs(spaceStore)
const satellites = ref<SatEntry[]>([])
const loaded = ref(false)

const {
  passes: accordionPasses,
  loading: accordionLoading,
  status: accordionStatus,
  begin: beginAccordionPasses,
  load: loadAccordionPasses,
  stop: stopAccordionPasses,
} = useSatelliteAccordionPasses(() => props.getUserLocation())
const {
  telemetry: liveTelemetry,
  liveAzEl,
  reset: resetLiveTelemetry,
} = useLiveSatelliteTelemetry(
  (noradId) => !!expandedNoradId.value && noradId === expandedNoradId.value,
)
const {
  followedNoradId,
  notifNoradId,
  armedTick,
  isArmed,
  isRecordArmed,
  syncPassNotifState,
  trackSat,
  togglePassNotif,
  toggleAutoTune,
  toggleRecord,
} = useSatelliteActions({
  getSatelliteControl: () => props.satelliteControl,
  // Arming changes which other satellites' passes the conflict check needs.
  onAutoTuneToggled: (noradId) => void refreshArmedPasses(noradId),
})
const {
  conflictText: autoTuneConflictText,
  refreshArmedPasses,
  clearArmedPasses,
} = useArmedPassConflict({
  getUserLocation: () => props.getUserLocation(),
  expandedNoradId,
  expandedPasses: accordionPasses,
  armedTick,
})
const { items, expandedSat } = useSatelliteFilterResults({
  satellites,
  query,
  filterCategory,
  expandedNoradId,
  setAvailableCategories: (categories) => spaceStore.setSpaceAvailableCategories(categories),
  setFilterCategory: (category) => spaceStore.setSpaceFilterCategory(category),
})
const { showPreview, schedulePreviewClear } = useSatellitePreviewHover(() => props.satelliteControl)

const now = ref(Date.now())
let countdownTick: ReturnType<typeof setInterval> | null = null

// This pane judges "in progress" against the wall clock (see SatPolarPassSection).
function isNow(pass: AccPass): boolean {
  const nowMs = Date.now()
  return nowMs >= pass.aos_unix_ms && nowMs <= pass.los_unix_ms
}

// What the pane says when it has no rows to show: still loading the database,
// nothing matching anywhere, or nothing matching in the selected category.
const emptyMessage = computed<string>(() => {
  if (!loaded.value) return 'Loading satellite database…'
  return 'No satellites found'
})

function onRowEnter(noradId: string): void {
  const sat = items.value.find((item) => item.key === noradId)
  /* v8 ignore start -- the key always comes from a rendered row, so the look-up
     above cannot miss. */
  if (!sat) return
  /* v8 ignore stop */
  showPreview(noradId, sat.primary)
}

// Open the accordion for a satellite: select it on the map and load its passes
// / telemetry. Shared by a click and by the on-mount restore of a persisted
// expansion. switchSatellite (follow=false) selects the sat and starts the
// position polling that feeds the live POSITION/ORBITAL fields and polar plot
// via 'sat-position-update' — without moving the camera, so it's safe on a
// passive restore too. (Skipping it left the restored accordion's data blank.)
//
// A restore, unlike a click, must not take the map away from a different
// satellite: the PASSES pane restores its own persisted expansion at the same
// time and the map can only show one. Whichever pane's satellite the map is
// already showing re-selects it (to start polling); the other just re-opens.
function openAccordion(sat: SatEntry, restoring = false): void {
  expandedNoradId.value = sat.norad_id
  beginAccordionPasses()
  resetLiveTelemetry()
  const ctrl = props.satelliteControl
  if (ctrl && (!restoring || ctrl.activeNoradId === sat.norad_id)) {
    ctrl.switchSatellite(sat.norad_id, sat.name || sat.norad_id)
  }
  syncPassNotifState(sat.norad_id)
  void loadAccordionPasses(sat.norad_id)
  if (isAutoTuneEnabled(sat.norad_id)) void refreshArmedPasses(sat.norad_id)
  else clearArmedPasses()
}

// The shell reports the row that should now be open ('' when the open row was
// clicked shut). Either way the current expansion is torn down first — the open
// row's pass fetch and tick have to stop before another row can claim them.
function onExpandedKeyChange(noradId: string): void {
  collapseExpanded()
  if (!noradId) return
  const sat = satellites.value.find((candidate) => candidate.norad_id === noradId)
  /* v8 ignore start -- the key always comes from a rendered row, whose satellite
     is by definition in the loaded set. */
  if (!sat) return
  /* v8 ignore stop */
  openAccordion(sat)
}

function collapseExpanded(): void {
  expandedNoradId.value = ''
  stopAccordionPasses()
}

async function loadSatellites(): Promise<void> {
  try {
    const resp = await fetch('/api/space/tle/list')
    if (!resp.ok) {
      loaded.value = true
      return
    }
    const data = (await resp.json()) as { satellites?: SatEntry[] }
    satellites.value = data.satellites ?? []
    loaded.value = true
    restoreExpandedAccordion()
  } catch {
    loaded.value = true
  }
}

// Re-open the satellite accordion the user left expanded before navigating away.
// The persisted id may be stale (sat dropped from the DB) — clear it if so.
// openAccordion re-selects the sat (follow=false, camera-safe) so its live
// telemetry repopulates.
function restoreExpandedAccordion(): void {
  const id = expandedNoradId.value
  if (!id) return
  const sat = satellites.value.find((s) => s.norad_id === id)
  if (sat) {
    // Switch to the restored satellite's category so its row (and open accordion)
    // is in the visible single-category list.
    spaceStore.setSpaceFilterCategory(sat.category || 'unknown')
    openAccordion(sat, true)
  } else expandedNoradId.value = ''
}

function onSettingsPanelClosed(): void {
  if (!loaded.value) void loadSatellites()
}

onMounted(() => {
  void loadSatellites()
  countdownTick = setInterval(() => {
    now.value = Date.now()
    if (accordionPasses.value.length) accordionPasses.value = [...accordionPasses.value]
  }, 1000)
})

onUnmounted(() => {
  /* v8 ignore start -- defensive: onMounted always assigns countdownTick, so it is never
     null here (this guard can't be false). */
  if (countdownTick) clearInterval(countdownTick)
  /* v8 ignore stop */
})

useDocumentEvent('settings-panel-closed', onSettingsPanelClosed)

defineExpose({ focus: () => panelRef.value?.focus() })
</script>

<style>
/* The shared shell (BaseFilterPanel) supplies the input row, results region and
   row chrome. What stays here is this pane's own deviations from it; the
   expanded-row accordion's styles are in SatelliteAccordion.css. */

/* Keyboard focus keeps the softened accent outline this pane has always used. */
#space-filter-results .bfp-result-item {
  --bfp-focus-outline: rgba(var(--accent-rgb), 0.4);
}

/* This pane centres its empty state and sets it smaller and dimmer than the
   shell's default. */
#space-filter-results .bfp-no-results {
  padding: 20px 18px;
  font-family: 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: rgba(var(--ink-rgb), 0.25);
  text-align: center;
}
</style>
