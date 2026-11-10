<template>
  <div v-if="statusText" id="spp-status-bar" :class="{ 'spp-loading': loading }">
    {{ statusText }}
  </div>
  <div v-if="!message && categoryFilters.length > 1" class="spp-cat-filter-row">
    <BaseChip
      :active="activeFilters.size === 0"
      :aria-pressed="activeFilters.size === 0"
      @click="selectAllCategories"
    >
      ALL
    </BaseChip>
    <BaseChip
      v-for="cat in categoryFilters"
      :key="cat"
      :active="activeFilters.has(cat)"
      :aria-pressed="activeFilters.has(cat)"
      @click="toggleCategoryFilter(cat)"
    >
      {{ categoryLabel(cat) }}
    </BaseChip>
  </div>
  <div id="spp-list">
    <div v-if="message" class="spp-message">
      <div>{{ message }}</div>
      <button v-if="showSetLocationBtn" class="spp-action-btn" @click="requestLocation">
        SET LOCATION
      </button>
    </div>
    <template v-else>
      <div
        v-for="pass in visiblePasses"
        :key="pass.norad_id + pass.aos_unix_ms"
        class="spp-pass-card"
        :class="{ 'spp-expanded': expandedKey === passKey(pass) }"
        :data-aos-ms="pass.aos_unix_ms"
        :data-los-ms="pass.los_unix_ms"
        @mouseenter="onMouseEnter(pass)"
        @mouseleave="onMouseLeave"
      >
        <button
          type="button"
          class="spp-pass-card-header"
          :aria-expanded="expandedKey === passKey(pass)"
          :aria-controls="`spp-body-${passKey(pass)}`"
          @click="onCardClick(pass)"
        >
          <div class="spp-pass-info">
            <div class="spp-pass-primary">{{ pass.name || pass.norad_id }}</div>
            <div class="spp-pass-secondary">{{ passSecondary(pass) }}</div>
          </div>
          <div class="spp-pass-meta">
            <div class="spp-pass-aos" :class="{ 'spp-in-progress': isInProgress(pass) }">
              {{ aosText(pass) }}
            </div>
            <div class="spp-pass-detail">
              {{ formatPassDuration(pass.duration_s) }} · {{ pass.max_elevation_deg.toFixed(1) }}°
            </div>
          </div>
          <span class="spp-pass-chevron">
            <ChevronIcon />
          </span>
        </button>
        <!-- Expanded accordion -->
        <div
          v-if="expandedKey === passKey(pass)"
          :id="`spp-body-${passKey(pass)}`"
          class="spp-acc-body"
        >
          <BaseDataGrid title="POSITION DATA" :columns="3">
            <BaseDataCell label="LATITUDE" :value="liveTelemetry['lat'] ?? '—'" />
            <BaseDataCell label="LONGITUDE" :value="liveTelemetry['lon'] ?? '—'" />
            <BaseDataCell label="HEADING" :value="liveTelemetry['hdg'] ?? '—'" />
          </BaseDataGrid>
          <BaseDataGrid title="ORBITAL DATA" :columns="3">
            <BaseDataCell label="ALTITUDE" :value="liveTelemetry['alt'] ?? '—'" />
            <BaseDataCell label="VELOCITY" :value="liveTelemetry['vel'] ?? '—'" />
          </BaseDataGrid>
          <SatRadioInfoSection :radio="pass" />
          <SatelliteActionRow
            :following="followedNoradId === pass.norad_id"
            :notifying="notifNoradId === pass.norad_id"
            :has-downlink="!!pass.downlink_hz"
            :auto-tune-armed="isArmed(pass.norad_id)"
            :record-armed="isRecordArmed(pass.norad_id)"
            :conflict-text="conflictText(pass.norad_id)"
            @track="trackSat(pass)"
            @toggle-pass-notif="togglePassNotif(pass)"
            @toggle-auto-tune="toggleAutoTune(pass)"
            @toggle-record="toggleRecord(pass)"
          />
          <div class="sat-acc-section sat-acc-section--polar">
            <div class="sat-acc-section-title sat-acc-polar-title">
              <span>{{ polarTitle }}</span>
              <span v-if="polarPass" class="sat-acc-polar-maxel"
                >MAX {{ polarPass.max_elevation_deg.toFixed(0) }}°</span
              >
            </div>
            <SatPolarPlot
              v-if="polarPass && polarPass.sky_track && polarPass.sky_track.length > 1"
              :track="polarPass.sky_track"
              :live="polarLive"
            />
            <div v-else class="sat-acc-polar-empty">
              {{ accLoading ? 'COMPUTING ARC…' : 'NO UPCOMING PASS TO PLOT' }}
            </div>
          </div>
          <div class="sat-acc-section sat-acc-section--passes">
            <div class="sat-acc-section-title sat-acc-passes-title">
              <span>UPCOMING PASSES</span>
              <span class="sat-acc-status" :class="{ 'sat-acc-status-loading': accLoading }">{{
                accStatus
              }}</span>
            </div>
            <div class="sat-acc-pass-list">
              <div
                v-if="accPasses.length === 0 && !accLoading && accStatus.startsWith('NEXT')"
                class="sat-acc-no-passes"
              >
                No passes in the next 24 hours.
              </div>
              <div v-for="(ap, i) in accPasses" :key="i" class="sat-acc-pass-card">
                <div class="sat-acc-pass-times">
                  <div class="sat-acc-pass-aos-row">
                    <span class="sat-acc-pass-date">{{ formatPassDate(ap.aos_utc) }}</span>
                    <span class="sat-acc-pass-time">{{ formatPassTime(ap.aos_utc) }}</span>
                  </div>
                  <div class="sat-acc-pass-los">
                    LOS {{ formatPassTime(ap.los_utc) }} · {{ formatPassDuration(ap.duration_s) }}
                  </div>
                </div>
                <div class="sat-acc-pass-meta">
                  <div
                    class="sat-acc-pass-countdown"
                    :class="{ 'sat-acc-pass-countdown--live': accPassIsNow(ap, now) }"
                  >
                    {{ accPassIsNow(ap, now) ? 'NOW' : formatPassCountdown(ap.aos_unix_ms - now) }}
                  </div>
                  <div class="sat-acc-pass-maxel">MAX {{ ap.max_elevation_deg.toFixed(1) }}°</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import { useSpaceStore } from './stores/space'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { isAutoTuneEnabled } from './controls/satellite/passNotifStore'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'
import { useSatelliteActions } from './composables/useSatelliteActions'
import SatelliteActionRow from './SatelliteActionRow.vue'
import SatPolarPlot from './SatPolarPlot.vue'
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import SatRadioInfoSection from './SatRadioInfoSection.vue'
import {
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_DISPLAY_NAMES,
  SATELLITE_CATEGORY_SECTION_LABELS,
  formatPassDuration,
  formatPassTime,
  formatPassDate,
  formatPassCountdown,
} from './utils/satelliteUtils'
import {
  passKey,
  passSecondary,
  isInProgress,
  aosText,
  accPassIsNow,
  findAutoTuneConflicts,
  type SatPass,
  type AccPass,
  type SkyPoint,
} from './spacePassesUtils'
import './SatelliteAccordion.css'
import './SpacePasses.css'

const props = defineProps<{
  satelliteControl: SatelliteControl | null
  getUserLocation: () => [number, number] | null
  isVisible: boolean
}>()

// ---- State ----
const passes = ref<SatPass[]>([])
const loading = ref(false)
const statusText = ref('')
const message = ref('')
const showSetLocationBtn = ref(false)

// Pass-query controls and filter chips persist so the Passes pane resumes with
// the same elevation/horizon window and category selection after navigating away
// from Space (and across a full refresh). These live on the store (a singleton)
// so restore is independent of this teleported pane's remount timing.
const spaceStore = useSpaceStore()
const {
  passesMinEl: minEl,
  passesHours: hours,
  passesFiltersOpen: _filtersExpanded,
  passesActiveFilters: activeFilters,
} = storeToRefs(spaceStore)

const categoryFilters = computed<string[]>(() => {
  const present = new Set<string>()
  for (const p of passes.value) present.add(p.category || 'unknown')
  return SATELLITE_CATEGORY_ORDER.filter((c) => present.has(c)).concat(
    [...present].filter((c) => !SATELLITE_CATEGORY_ORDER.includes(c)),
  )
})

function categoryLabel(cat: string): string {
  return SATELLITE_CATEGORY_SECTION_LABELS[cat] || cat.replace(/_/g, ' ').toUpperCase()
}

function selectAllCategories(): void {
  activeFilters.value = new Set()
}

function toggleCategoryFilter(cat: string): void {
  const next = new Set(activeFilters.value)
  if (next.has(cat)) next.delete(cat)
  else next.add(cat)
  activeFilters.value = next
}

const visiblePasses = computed<SatPass[]>(() =>
  activeFilters.value.size === 0
    ? passes.value
    : passes.value.filter((p) => activeFilters.value.has(p.category || 'unknown')),
)

// Note: we deliberately do NOT auto-prune activeFilters when a category is
// momentarily absent from the results. The selection is persisted across
// navigation/refresh, and an initial fetch (or a window with no passes for that
// category) would otherwise wipe a restored selection. A category with no current
// passes simply shows no chip and an empty list until it reappears — non-
// destructive — rather than silently discarding the user's choice.

// Which pass card is expanded. The key is `norad_id_aosMs`, which is stable
// across reloads (AOS times are deterministic) until the pass rolls into the
// past — at which point it simply matches no card and stays collapsed. Held on
// the store so it survives navigation regardless of this pane's remount timing.
const { passesExpandedKey: expandedKey } = storeToRefs(spaceStore)
const liveTelemetry = ref<Record<string, string>>({})

const accLoading = ref(false)
const accStatus = ref('COMPUTING PASSES…')
const accPasses = ref<AccPass[]>([])

const now = ref(Date.now())
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
} = useSatelliteActions({ getSatelliteControl: () => props.satelliteControl })
// Other armed sats whose upcoming passes overlap this sat's — keyed by norad_id.
// Lock-in means one of the overlapping passes won't be tuned; we warn inline.
const autoTuneConflicts = computed<Record<string, ReturnType<typeof findAutoTuneConflicts>>>(() => {
  void armedTick.value
  const out: Record<string, ReturnType<typeof findAutoTuneConflicts>> = {}
  const seen = new Set<string>()
  for (const p of passes.value) {
    if (seen.has(p.norad_id)) continue
    seen.add(p.norad_id)
    if (!isAutoTuneEnabled(p.norad_id)) continue
    const conflicts = findAutoTuneConflicts(p.norad_id, passes.value, isAutoTuneEnabled)
    if (conflicts.length > 0) out[p.norad_id] = conflicts
  }
  return out
})

function conflictText(noradId: string): string {
  const conflicts = autoTuneConflicts.value[noradId]
  if (!conflicts || conflicts.length === 0) return ''
  const c = conflicts[0]
  const t = new Date(c.aosMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const extra = conflicts.length > 1 ? ` +${conflicts.length - 1} more` : ''
  return `Overlaps ${c.name} @ ${t} — earlier pass keeps the radio${extra}`
}

// Exact observer-relative look-angles for the live satellite, supplied by the
// backend on each position poll. Null until the first annotated update arrives.
const liveAzEl = ref<SkyPoint | null>(null)

// The pass to plot: the active (in-progress) pass if there is one, else the next.
const polarPass = computed<AccPass | null>(() => {
  if (!accPasses.value.length) return null
  const active = accPasses.value.find((ap) => accPassIsNow(ap, now.value))
  if (active) return active
  return accPasses.value.find((ap) => ap.aos_unix_ms > now.value) ?? null
})

const polarTitle = computed(() => {
  const p = polarPass.value
  if (!p) return 'NEXT PASS'
  const label = accPassIsNow(p, now.value) ? 'CURRENT PASS' : 'NEXT PASS'
  return `${label} · ${formatPassDate(p.aos_utc)} ${formatPassTime(p.aos_utc)}`
})

// Show the live marker only while the plotted pass is actually in progress.
const polarLive = computed<SkyPoint | null>(() => {
  const p = polarPass.value
  if (!p || !accPassIsNow(p, now.value)) return null
  return liveAzEl.value
})

let fetchAbort: AbortController | null = null
// The multi-satellite passes route walks every catalogued satellite on the
// backend; when its TLE upstream is unreachable that can run long. Without a
// client-side ceiling the pane would sit on "COMPUTING PASSES…" indefinitely.
const PASSES_FETCH_TIMEOUT_MS = 90_000
let accFetchAbort: AbortController | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let tickInterval: ReturnType<typeof setInterval> | null = null
let locationPoll: ReturnType<typeof setInterval> | null = null
let clearPreviewTimer: ReturnType<typeof setTimeout> | null = null
// Set once the persisted expansion has been re-opened after mount. Later
// pass refreshes must not re-select the satellite on the map (see
// restoreExpandedAccordion).
let expansionRestored = false

// ---- Fetch ----
async function fetchPasses(): Promise<void> {
  if (fetchAbort) fetchAbort.abort()
  fetchAbort = new AbortController()
  const abort = fetchAbort
  const loc = props.getUserLocation()
  if (!loc) {
    showNoLocation()
    return
  }
  const [lon, lat] = loc
  loading.value = true
  statusText.value = 'COMPUTING PASSES…'
  message.value = ''
  const timeoutHandle = setTimeout(
    () => abort.abort(new DOMException('Passes request timed out', 'TimeoutError')),
    PASSES_FETCH_TIMEOUT_MS,
  )
  try {
    // No `categories` param — the backend includes every valid category, so the
    // list spans all satellite types (space stations included). The chips above
    // the list, built from the categories actually present, filter per type.
    const url = `/api/space/passes?lat=${lat}&lon=${lon}&hours=${hours.value}&min_el=${minEl.value}&limit=200`
    const resp = await fetch(url, { signal: abort.signal })
    if (abort.signal.aborted) return
    if (!resp.ok) {
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string
        no_tle_data?: boolean
      }
      statusText.value = ''
      if (data.no_tle_data) {
        message.value = 'No TLE data. Import satellites in Settings.'
        return
      }
      message.value = `Error ${resp.status} — ${data.error || 'Failed to load passes'}`
      return
    }
    const data = (await resp.json()) as {
      passes: SatPass[]
      satellite_count: number
      computed_at: string
    }
    passes.value = data.passes || []
    statusText.value = ''
    if (!passes.value.length)
      message.value = 'No passes found. Try broader categories, lower elevation, or longer window.'
    restoreExpandedAccordion()
  } catch (e: unknown) {
    // Matched by name rather than `instanceof Error`: the abort reason is a
    // DOMException, which is not an Error in every realm (jsdom's is not).
    const errorName = e instanceof Error || e instanceof DOMException ? e.name : ''
    if (errorName === 'AbortError') return
    statusText.value = ''
    message.value =
      errorName === 'TimeoutError'
        ? 'Pass computation timed out — check the TLE source and retry.'
        : 'Network error — check connection and retry.'
  } finally {
    clearTimeout(timeoutHandle)
    loading.value = false
  }
}

function showNoLocation(): void {
  message.value = 'Set your location to calculate passes.'
  showSetLocationBtn.value = true
  if (!locationPoll) {
    let n = 0
    locationPoll = setInterval(() => {
      n++
      if (props.getUserLocation()) {
        clearInterval(locationPoll!)
        locationPoll = null
        void fetchPasses()
      } else if (n > 120) {
        clearInterval(locationPoll!)
        locationPoll = null
      }
    }, 500)
  }
}

function requestLocation(): void {
  document.dispatchEvent(new CustomEvent('space-go-to-location'))
}

// ---- Accordion ----
function collapseExpanded(): void {
  expandedKey.value = ''
  accPasses.value = []
  if (accFetchAbort) {
    accFetchAbort.abort()
    accFetchAbort = null
  }
}

// Open a pass card's accordion: select the sat on the map and load its passes /
// telemetry. Shared by a click and the on-mount restore of a persisted
// expansion. switchSatellite (follow=false) selects the sat and starts the
// position polling that feeds the live POSITION/ORBITAL fields and polar plot
// via 'sat-position-update' — without moving the camera, so it's safe to run on
// a passive restore too. (Skipping it left the restored accordion's live data
// blank, since no position events would ever arrive.)
//
// A restore, unlike a click, must not take the map away from a different
// satellite: the SEARCH pane restores its own persisted expansion at the same
// time and the map can only show one. Whichever pane's satellite the map is
// already showing re-selects it (to start polling); the other just re-opens.
function openAccordion(pass: SatPass, restoring = false): void {
  expandedKey.value = passKey(pass)
  accPasses.value = []
  accStatus.value = 'COMPUTING PASSES…'
  accLoading.value = true
  liveTelemetry.value = {}
  liveAzEl.value = null
  const ctrl = props.satelliteControl
  if (ctrl && (!restoring || ctrl.activeNoradId === pass.norad_id)) {
    ctrl.switchSatellite(pass.norad_id, pass.name || pass.norad_id)
  }
  syncPassNotifState(pass.norad_id)
  void fetchAccordionPasses(pass.norad_id)
}

function onCardClick(pass: SatPass): void {
  const wasExpanded = expandedKey.value === passKey(pass)
  collapseExpanded()
  if (!wasExpanded) openAccordion(pass)
}

// Re-open the pass accordion the user left expanded. Prefer the exact pass, but
// fall back to the same satellite's nearest pass: AOS timestamps can drift by a
// few ms between recomputations (and the original pass may have rolled into the
// past), which would otherwise make an exact key match fail every time. Clear the
// key only when that satellite has no pass left in the list.
//
// Only the first restore after mount goes through openAccordion — it is the one
// that has to re-select the satellite so the accordion's live telemetry flows.
// fetchPasses also runs on a 5-minute timer, and re-selecting on every refresh
// yanked the map back to the expanded card's satellite (and dropped any follow
// the user had engaged on another one) every five minutes. On a refresh the
// open card is just re-keyed onto the recomputed pass so it stays expanded.
function restoreExpandedAccordion(): void {
  const key = expandedKey.value
  if (!key) return
  const match = findPersistedPass(key)
  if (!match) {
    expandedKey.value = ''
    return
  }
  if (expansionRestored) {
    expandedKey.value = passKey(match)
    return
  }
  expansionRestored = true
  openAccordion(match, true)
}

// Resolve a persisted expansion key to a pass in the current list: the exact
// pass if it is still there, otherwise the same satellite's pass nearest to the
// persisted AOS, or null when that satellite has no pass left.
function findPersistedPass(key: string): SatPass | null {
  const exact = passes.value.find((candidate) => passKey(candidate) === key)
  if (exact) return exact
  const noradId = key.slice(0, key.lastIndexOf('_'))
  const targetAos = Number(key.slice(key.lastIndexOf('_') + 1))
  const sameSat = passes.value.filter((candidate) => candidate.norad_id === noradId)
  if (sameSat.length === 0) return null
  return sameSat.reduce((best, candidate) =>
    Math.abs(candidate.aos_unix_ms - targetAos) < Math.abs(best.aos_unix_ms - targetAos)
      ? candidate
      : best,
  )
}

async function fetchAccordionPasses(noradId: string): Promise<void> {
  if (accFetchAbort) accFetchAbort.abort()
  accFetchAbort = new AbortController()
  const abort = accFetchAbort
  const loc = props.getUserLocation()
  if (!loc) {
    accStatus.value = 'SET LOCATION TO CALCULATE PASSES'
    accLoading.value = false
    return
  }
  const [lon, lat] = loc
  try {
    const url = `/api/space/satellite/${encodeURIComponent(noradId)}/passes?lat=${lat}&lon=${lon}&hours=24&min_el=0`
    const resp = await fetch(url, { signal: abort.signal })
    if (abort.signal.aborted) return
    if (!resp.ok) {
      accStatus.value = 'COULD NOT LOAD PASSES'
      accLoading.value = false
      return
    }
    const data = (await resp.json()) as { passes: AccPass[]; computed_at: string }
    const t = new Date(data.computed_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    accStatus.value = `NEXT 24H · UPDATED ${t}`
    accPasses.value = data.passes || []
    accLoading.value = false
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    accStatus.value = 'NETWORK ERROR'
    accLoading.value = false
  }
}

function onMouseEnter(pass: SatPass): void {
  if (clearPreviewTimer) {
    clearTimeout(clearPreviewTimer)
    clearPreviewTimer = null
  }
  props.satelliteControl?.previewSatellite(pass.norad_id, pass.name || pass.norad_id)
}

function onMouseLeave(): void {
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
  clearPreviewTimer = setTimeout(() => {
    clearPreviewTimer = null
    props.satelliteControl?.clearPreview()
  }, 50)
}

function onSatPositionUpdate(e: Event): void {
  if (!expandedKey.value) return
  const { noradId, position } = (
    e as CustomEvent<{
      noradId: string
      position: {
        alt_km: number
        velocity_kms: number
        track_deg: number
        lat: number
        lon: number
        az?: number
        el?: number
      }
    }>
  ).detail
  if (!expandedKey.value.startsWith(noradId)) return
  liveTelemetry.value = {
    alt: `${position.alt_km} km`,
    vel: `${position.velocity_kms} km/s`,
    hdg: `${position.track_deg}°`,
    lat: `${position.lat}°`,
    lon: `${position.lon}°`,
  }
  // Use the backend-computed look-angles when present (exact); otherwise leave
  // the live marker off rather than guessing.
  liveAzEl.value =
    position.az != null && position.el != null ? { az: position.az, el: position.el } : null
}

onMounted(() => {
  const loc = props.getUserLocation()
  if (loc) void fetchPasses()
  else showNoLocation()

  refreshInterval = setInterval(
    () => {
      void fetchPasses()
    },
    5 * 60 * 1000,
  )
  tickInterval = setInterval(() => {
    now.value = Date.now()
    passes.value = [...passes.value]
  }, 1000)
})

onUnmounted(() => {
  /* v8 ignore start -- defensive: onMounted always assigns both intervals
     unconditionally, so neither is ever null here (the guards can't be false). */
  if (refreshInterval) clearInterval(refreshInterval)
  if (tickInterval) clearInterval(tickInterval)
  /* v8 ignore stop */
  if (locationPoll) clearInterval(locationPoll)
  if (fetchAbort) fetchAbort.abort()
  if (accFetchAbort) accFetchAbort.abort()
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
})

useDocumentEvent('sat-position-update', onSatPositionUpdate)
defineExpose({
  fetchPasses,
  minEl,
  hours,
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_DISPLAY_NAMES,
})
</script>
