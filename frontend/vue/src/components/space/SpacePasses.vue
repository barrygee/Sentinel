<template>
  <div v-if="statusText" id="spp-status-bar" :class="{ 'spp-loading': loading }">{{ statusText }}</div>
  <div v-if="!message && categoryFilters.length > 1" class="spp-cat-filter-row">
    <button
      type="button"
      class="spp-cat-filter-chip"
      :class="{ 'spp-cat-filter-chip-active': activeFilters.size === 0 }"
      @click="selectAllCategories"
    >ALL</button>
    <button
      v-for="cat in categoryFilters"
      :key="cat"
      type="button"
      class="spp-cat-filter-chip"
      :class="{ 'spp-cat-filter-chip-active': activeFilters.has(cat) }"
      @click="toggleCategoryFilter(cat)"
    >{{ categoryLabel(cat) }}</button>
  </div>
  <div id="spp-list">
    <div v-if="message" class="spp-message">
      <div>{{ message }}</div>
      <button v-if="showSetLocationBtn" class="spp-action-btn" @click="requestLocation">SET LOCATION</button>
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
        @click="onCardClick(pass)"
      >
        <div class="spp-pass-card-header">
          <div class="spp-pass-info">
            <div class="spp-pass-primary">{{ pass.name || pass.norad_id }}</div>
            <div class="spp-pass-secondary">{{ passSecondary(pass) }}</div>
          </div>
          <div class="spp-pass-meta">
            <div class="spp-pass-aos" :class="{ 'spp-in-progress': isInProgress(pass) }">
              {{ aosText(pass) }}
            </div>
            <div class="spp-pass-detail">{{ formatPassDuration(pass.duration_s) }} · {{ pass.max_elevation_deg.toFixed(1) }}°</div>
          </div>
          <span class="spp-pass-chevron">
            <ChevronIcon />
          </span>
        </div>
        <!-- Expanded accordion -->
        <div v-if="expandedKey === passKey(pass)" class="spp-acc-body">
          <div class="spp-acc-section">
            <div class="spp-acc-section-title">POSITION DATA</div>
            <div class="spp-acc-grid spp-acc-grid--three">
              <div class="spp-acc-cell">
                <div class="spp-acc-cell-label">LATITUDE</div>
                <div class="spp-acc-cell-value">{{ liveTelemetry['lat'] ?? '—' }}</div>
              </div>
              <div class="spp-acc-cell">
                <div class="spp-acc-cell-label">LONGITUDE</div>
                <div class="spp-acc-cell-value">{{ liveTelemetry['lon'] ?? '—' }}</div>
              </div>
              <div class="spp-acc-cell">
                <div class="spp-acc-cell-label">HEADING</div>
                <div class="spp-acc-cell-value">{{ liveTelemetry['hdg'] ?? '—' }}</div>
              </div>
            </div>
          </div>
          <div class="spp-acc-section">
            <div class="spp-acc-section-title">ORBITAL DATA</div>
            <div class="spp-acc-grid spp-acc-grid--three">
              <div class="spp-acc-cell">
                <div class="spp-acc-cell-label">ALTITUDE</div>
                <div class="spp-acc-cell-value">{{ liveTelemetry['alt'] ?? '—' }}</div>
              </div>
              <div class="spp-acc-cell">
                <div class="spp-acc-cell-label">VELOCITY</div>
                <div class="spp-acc-cell-value">{{ liveTelemetry['vel'] ?? '—' }}</div>
              </div>
            </div>
          </div>
          <div v-if="hasRadioInfo(pass)" class="spp-acc-section spp-acc-section--radio">
            <div class="spp-acc-section-title">RADIO</div>
            <div class="spp-acc-radio-grid">
              <template v-if="pass.uplink_hz">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">UPLINK</div>
                  <div class="spp-acc-cell-value">{{ formatHz(pass.uplink_hz) }}<span v-if="pass.uplink_mode" class="spp-acc-cell-mode"> · {{ pass.uplink_mode }}</span></div>
                </div>
              </template>
              <template v-if="pass.downlink_hz">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">DOWNLINK</div>
                  <div class="spp-acc-cell-value">{{ formatHz(pass.downlink_hz) }}<span v-if="pass.downlink_mode" class="spp-acc-cell-mode"> · {{ pass.downlink_mode }}</span></div>
                </div>
              </template>
              <template v-if="pass.ctcss_hz">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">CTCSS</div>
                  <div class="spp-acc-cell-value">{{ pass.ctcss_hz.toFixed(1) }} Hz</div>
                </div>
              </template>
              <template v-if="pass.transponder_type">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">TRANSPONDER</div>
                  <div class="spp-acc-cell-value">{{ pass.transponder_type }}</div>
                </div>
              </template>
              <template v-if="pass.beacon_hz">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">BEACON</div>
                  <div class="spp-acc-cell-value">{{ formatHz(pass.beacon_hz) }}</div>
                </div>
              </template>
              <template v-if="pass.radio_status">
                <div class="spp-acc-cell">
                  <div class="spp-acc-cell-label">STATUS</div>
                  <div class="spp-acc-cell-value">{{ formatStatus(pass.radio_status) }}</div>
                </div>
              </template>
            </div>
            <div v-if="pass.packet_info" class="spp-acc-radio-line">
              <div class="spp-acc-cell-label">PACKET / DIGITAL</div>
              <ul class="spp-acc-radio-list">
                <li v-for="(p, i) in splitNotes(pass.packet_info)" :key="i">{{ p }}</li>
              </ul>
            </div>
            <div v-if="pass.radio_notes" class="spp-acc-radio-line">
              <div class="spp-acc-cell-label">NOTES</div>
              <ul class="spp-acc-radio-list">
                <li v-for="(n, i) in splitNotes(pass.radio_notes)" :key="i">{{ n }}</li>
              </ul>
            </div>
          </div>
          <div class="spp-acc-section spp-acc-section--track">
            <div class="spp-acc-track-row">
              <button class="spp-acc-track-btn" :class="{ 'spp-acc-track-btn--active': followedNoradId === pass.norad_id }" @click.stop="trackSat(pass)">{{ followedNoradId === pass.norad_id ? 'UNTRACK SATELLITE' : 'TRACK SATELLITE' }}</button>
              <button
                class="spp-acc-notif-btn"
                :class="{ 'spp-acc-notif-btn--active': notifNoradId === pass.norad_id, 'spp-acc-notif-btn--last': !pass.downlink_hz }"
                :aria-label="notifNoradId === pass.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                :data-tooltip="notifNoradId === pass.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                @click.stop="togglePassNotif(pass)"
              >
                <svg width="14" height="14" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>
                  <path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>
                </svg>
              </button>
              <button
                v-if="pass.downlink_hz"
                class="spp-acc-autotune-btn"
                :class="{ 'spp-acc-autotune-btn--active': isArmed(pass.norad_id) }"
                :aria-label="autoTuneLabel()"
                :data-tooltip="autoTuneLabel()"
                @click.stop="toggleAutoTune(pass)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M5 7h14v12H5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
                  <line x1="6" y1="7" x2="17" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <circle cx="9" cy="13" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/>
                  <line x1="15.5" y1="11" x2="17" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <line x1="15.5" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
              <button
                v-if="pass.downlink_hz"
                class="spp-acc-record-btn"
                :class="{ 'spp-acc-record-btn--active': isRecordArmed(pass.norad_id) }"
                :disabled="!isArmed(pass.norad_id)"
                aria-label="Record pass"
                data-tooltip="Record pass"
                @click.stop="toggleRecord(pass)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="12" cy="12" r="6" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <div v-if="isArmed(pass.norad_id) && conflictText(pass.norad_id)" class="spp-acc-autotune-warn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>
                <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="currentColor"/>
              </svg>
              <span>{{ conflictText(pass.norad_id) }}</span>
            </div>
          </div>
          <div class="spp-acc-section spp-acc-section--polar">
            <div class="spp-acc-section-title spp-acc-polar-title">
              <span>{{ polarTitle }}</span>
              <span v-if="polarPass" class="spp-acc-polar-maxel">MAX {{ polarPass.max_elevation_deg.toFixed(0) }}°</span>
            </div>
            <SatPolarPlot
              v-if="polarPass && polarPass.sky_track && polarPass.sky_track.length > 1"
              :track="polarPass.sky_track"
              :live="polarLive"
            />
            <div v-else class="spp-acc-polar-empty">
              {{ accLoading ? 'COMPUTING ARC…' : 'NO UPCOMING PASS TO PLOT' }}
            </div>
          </div>
          <div class="spp-acc-section spp-acc-section--passes">
            <div class="spp-acc-section-title spp-acc-passes-title">
              <span>UPCOMING PASSES</span>
              <span class="spp-acc-status" :class="{ 'spp-acc-status-loading': accLoading }">{{ accStatus }}</span>
            </div>
            <div class="spp-acc-pass-list">
              <div v-if="accPasses.length === 0 && !accLoading && accStatus.startsWith('NEXT')" class="spp-acc-no-passes">
                No passes in the next 24 hours.
              </div>
              <div
                v-for="(ap, i) in accPasses"
                :key="i"
                class="spp-acc-pass-card"
              >
                <div class="spp-acc-pass-times">
                  <div class="spp-acc-pass-aos-row">
                    <span class="spp-acc-pass-date">{{ formatPassDate(ap.aos_utc) }}</span>
                    <span class="spp-acc-pass-time">{{ formatPassTime(ap.aos_utc) }}</span>
                  </div>
                  <div class="spp-acc-pass-los">LOS {{ formatPassTime(ap.los_utc) }} · {{ formatPassDuration(ap.duration_s) }}</div>
                </div>
                <div class="spp-acc-pass-meta">
                  <div class="spp-acc-pass-countdown" :class="{ 'spp-in-progress': accPassIsNow(ap, now) }">
                    {{ accPassIsNow(ap, now) ? 'NOW' : formatPassCountdown(ap.aos_unix_ms - now) }}
                  </div>
                  <div class="spp-acc-pass-maxel">MAX {{ ap.max_elevation_deg.toFixed(1) }}°</div>
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
import { useSpaceStore } from '@/stores/space'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { isPassNotifEnabled, isAutoTuneEnabled, setAutoTuneEnabled, isRecordOnPassEnabled, setRecordOnPassEnabled } from './controls/satellite/passNotifStore'
import { useNotificationsStore } from '../../stores/notifications'
import { useDocumentEvent } from '../../composables/useDocumentEvent'
import ChevronIcon from '../shared/ChevronIcon.vue'
import SatPolarPlot from './SatPolarPlot.vue'
import {
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_DISPLAY_NAMES,
  SATELLITE_CATEGORY_SECTION_LABELS,
  formatPassDuration,
  formatPassTime,
  formatPassDate,
  formatPassCountdown,
} from '../../utils/satelliteUtils'
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
import './SpacePasses.css'

const props = defineProps<{
  satelliteControl: SatelliteControl | null
  getUserLocation: () => [number, number] | null
  isVisible: boolean
}>()

// ---- State ----
const passes          = ref<SatPass[]>([])
const loading         = ref(false)
const statusText      = ref('')
const message         = ref('')
const showSetLocationBtn = ref(false)

// Pass-query controls and filter chips persist so the Passes pane resumes with
// the same elevation/horizon window and category selection after navigating away
// from Space (and across a full refresh). These live on the store (a singleton)
// so restore is independent of this teleported pane's remount timing.
const spaceStore = useSpaceStore()
const {
  passesMinEl: minEl,
  passesHours: hours,
  passesFiltersOpen: filtersExpanded,
  passesActiveFilters: activeFilters,
} = storeToRefs(spaceStore)

const categoryFilters = computed<string[]>(() => {
  const present = new Set<string>()
  for (const p of passes.value) present.add(p.category || 'unknown')
  return SATELLITE_CATEGORY_ORDER.filter(c => present.has(c))
    .concat([...present].filter(c => !SATELLITE_CATEGORY_ORDER.includes(c)))
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
    : passes.value.filter(p => activeFilters.value.has(p.category || 'unknown')),
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
const accStatus  = ref('COMPUTING PASSES…')
const accPasses  = ref<AccPass[]>([])

const now = ref(Date.now())
const followedNoradId = ref<string | null>(props.satelliteControl?.followedNoradId ?? null)
const notifNoradId    = ref<string | null>(
  props.satelliteControl?.passNotificationsEnabled ? props.satelliteControl.activeNoradId : null,
)
// Multiple sats can be auto-tune armed at once (the store/background service
// support it). The active highlight and conflict warnings read straight from the
// store; `armedTick` is a reactivity nudge bumped whenever arming changes (toggle
// or the satellite-auto-tune-changed event) so computeds re-evaluate.
const armedTick = ref(0)
const notificationsStore = useNotificationsStore()

function readPassNotifState(noradId: string): boolean {
  return isPassNotifEnabled(noradId)
}

function isArmed(noradId: string): boolean {
  void armedTick.value
  return isAutoTuneEnabled(noradId)
}

function isRecordArmed(noradId: string): boolean {
  void armedTick.value
  return isRecordOnPassEnabled(noradId)
}

function autoTuneLabel(): string {
  return 'Auto-tune SDR'
}

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

function toggleAutoTune(pass: SatPass): void {
  if (!pass.downlink_hz) return
  const noradId = pass.norad_id
  const name = pass.name || noradId
  const enabled = !isAutoTuneEnabled(noradId)
  setAutoTuneEnabled(noradId, enabled, {
    name,
    downlinkHz: pass.downlink_hz ?? undefined,
    downlinkMode: pass.downlink_mode ?? undefined,
  })
  armedTick.value++
  document.dispatchEvent(new CustomEvent('satellite-auto-tune-changed', { detail: { noradId, enabled } }))
  if (enabled) {
    notificationsStore.add({
      type: 'autotune', title: name, detail: 'Auto-tune on pass enabled', noradId, satName: name,
    })
  } else {
    // Remove the persistent "Auto-tune on pass enabled" card so the alerts list
    // stays in sync (the live pass/tune trace alerts share the noradId but have
    // a different detail, so match on it to leave those untouched).
    notificationsStore.items
      .filter(i => i.type === 'autotune' && i.noradId === noradId && i.detail === 'Auto-tune on pass enabled')
      .forEach(i => notificationsStore.dismiss(i.id))
    // Disabling auto-tune also disarms record (the store clears the flag); drop
    // its card too so the alerts list doesn't show a stale "Record on pass enabled".
    notificationsStore.items
      .filter(i => i.type === 'autotune' && i.noradId === noradId && i.detail === 'Record on pass enabled')
      .forEach(i => notificationsStore.dismiss(i.id))
  }
}

function toggleRecord(pass: SatPass): void {
  if (!pass.downlink_hz) return
  const noradId = pass.norad_id
  // Record needs a live tune — only togglable while auto-tune is armed.
  if (!isAutoTuneEnabled(noradId)) return
  const name = pass.name || noradId
  const enabled = !isRecordOnPassEnabled(noradId)
  setRecordOnPassEnabled(noradId, enabled, { name })
  armedTick.value++
  if (enabled) {
    notificationsStore.add({
      type: 'autotune', title: name, detail: 'Record on pass enabled', noradId, satName: name,
    })
  } else {
    notificationsStore.items
      .filter(i => i.type === 'autotune' && i.noradId === noradId && i.detail === 'Record on pass enabled')
      .forEach(i => notificationsStore.dismiss(i.id))
  }
}

// Exact observer-relative look-angles for the live satellite, supplied by the
// backend on each position poll. Null until the first annotated update arrives.
const liveAzEl = ref<SkyPoint | null>(null)

// The pass to plot: the active (in-progress) pass if there is one, else the next.
const polarPass = computed<AccPass | null>(() => {
  if (!accPasses.value.length) return null
  const active = accPasses.value.find(ap => accPassIsNow(ap, now.value))
  if (active) return active
  return accPasses.value.find(ap => ap.aos_unix_ms > now.value) ?? null
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

function formatHz(hz: number | null | undefined): string {
  if (hz == null) return '—'
  if (hz >= 1_000_000_000) return (hz / 1_000_000_000).toFixed(3) + ' GHz'
  if (hz >= 1_000_000) return (hz / 1_000_000).toFixed(3) + ' MHz'
  if (hz >= 1_000) return (hz / 1_000).toFixed(3) + ' kHz'
  return String(hz) + ' Hz'
}

function hasRadioInfo(p: SatPass): boolean {
  return !!(p.uplink_hz || p.downlink_hz || p.beacon_hz ||
    p.transponder_type || p.packet_info || p.radio_status || p.radio_notes)
}

function splitNotes(s: string | null | undefined): string[] {
  if (!s) return []
  return s.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean)
}

function formatStatus(s: string | null | undefined): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

let fetchAbort: AbortController | null = null
let accFetchAbort: AbortController | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let tickInterval: ReturnType<typeof setInterval> | null = null
let locationPoll: ReturnType<typeof setInterval> | null = null
let clearPreviewTimer: ReturnType<typeof setTimeout> | null = null

// ---- Fetch ----
async function fetchPasses(): Promise<void> {
  if (fetchAbort) fetchAbort.abort()
  fetchAbort = new AbortController()
  const abort = fetchAbort
  const loc = props.getUserLocation()
  if (!loc) { showNoLocation(); return }
  const [lon, lat] = loc
  loading.value = true
  statusText.value = 'COMPUTING PASSES…'
  message.value = ''
  try {
    // No `categories` param — the backend includes every valid category, so the
    // list spans all satellite types (space stations included). The chips above
    // the list, built from the categories actually present, filter per type.
    const url = `/api/space/passes?lat=${lat}&lon=${lon}&hours=${hours.value}&min_el=${minEl.value}&limit=200`
    const resp = await fetch(url, { signal: abort.signal })
    if (abort.signal.aborted) return
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({})) as { error?: string; no_tle_data?: boolean }
      if (data.no_tle_data) { message.value = 'No TLE data. Import satellites in Settings.'; return }
      message.value = `Error ${resp.status} — ${data.error || 'Failed to load passes'}`
      return
    }
    const data = await resp.json() as { passes: SatPass[]; satellite_count: number; computed_at: string }
    passes.value = data.passes || []
    statusText.value = ''
    if (!passes.value.length) message.value = 'No passes found. Try broader categories, lower elevation, or longer window.'
    restoreExpandedAccordion()
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    message.value = 'Network error — check connection and retry.'
  } finally {
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
        clearInterval(locationPoll!); locationPoll = null
        void fetchPasses()
      } else if (n > 120) { clearInterval(locationPoll!); locationPoll = null }
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
  if (accFetchAbort) { accFetchAbort.abort(); accFetchAbort = null }
}

// Open a pass card's accordion: select the sat on the map and load its passes /
// telemetry. Shared by a click and the on-mount restore of a persisted
// expansion. switchSatellite (follow=false) selects the sat and starts the
// position polling that feeds the live POSITION/ORBITAL fields and polar plot
// via 'sat-position-update' — without moving the camera, so it's safe to run on
// a passive restore too. (Skipping it left the restored accordion's live data
// blank, since no position events would ever arrive.)
function openAccordion(pass: SatPass): void {
  expandedKey.value = passKey(pass)
  accPasses.value = []
  accStatus.value = 'COMPUTING PASSES…'
  accLoading.value = true
  liveTelemetry.value = {}
  liveAzEl.value = null
  props.satelliteControl?.switchSatellite(pass.norad_id, pass.name || pass.norad_id)
  notifNoradId.value = readPassNotifState(pass.norad_id) ? pass.norad_id : null
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
function restoreExpandedAccordion(): void {
  const key = expandedKey.value
  if (!key) return
  const exact = passes.value.find(p => passKey(p) === key)
  if (exact) { openAccordion(exact); return }
  const noradId = key.slice(0, key.lastIndexOf('_'))
  const targetAos = Number(key.slice(key.lastIndexOf('_') + 1))
  const sameSat = passes.value.filter(p => p.norad_id === noradId)
  if (sameSat.length === 0) { expandedKey.value = ''; return }
  const nearest = sameSat.reduce((best, p) =>
    Math.abs(p.aos_unix_ms - targetAos) < Math.abs(best.aos_unix_ms - targetAos) ? p : best)
  openAccordion(nearest)
}

async function fetchAccordionPasses(noradId: string): Promise<void> {
  if (accFetchAbort) accFetchAbort.abort()
  accFetchAbort = new AbortController()
  const abort = accFetchAbort
  const loc = props.getUserLocation()
  if (!loc) { accStatus.value = 'SET LOCATION TO CALCULATE PASSES'; accLoading.value = false; return }
  const [lon, lat] = loc
  try {
    const url = `/api/space/satellite/${encodeURIComponent(noradId)}/passes?lat=${lat}&lon=${lon}&hours=24&min_el=0`
    const resp = await fetch(url, { signal: abort.signal })
    if (abort.signal.aborted) return
    if (!resp.ok) { accStatus.value = 'COULD NOT LOAD PASSES'; accLoading.value = false; return }
    const data = await resp.json() as { passes: AccPass[]; computed_at: string }
    const t = new Date(data.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    accStatus.value = `NEXT 24H · UPDATED ${t}`
    accPasses.value = data.passes || []
    accLoading.value = false
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    accStatus.value = 'NETWORK ERROR'
    accLoading.value = false
  }
}

function trackSat(pass: SatPass): void {
  if (followedNoradId.value === pass.norad_id) {
    props.satelliteControl?.stopFollowing()
  } else {
    props.satelliteControl?.switchSatellite(pass.norad_id, pass.name || pass.norad_id, true)
  }
}

function togglePassNotif(pass: SatPass): void {
  const ctrl = props.satelliteControl
  if (!ctrl) return
  if (ctrl.activeNoradId !== pass.norad_id) {
    ctrl.switchSatellite(pass.norad_id, pass.name || pass.norad_id)
  }
  ctrl.togglePassNotifications()
}

function onMouseEnter(pass: SatPass): void {
  if (clearPreviewTimer) { clearTimeout(clearPreviewTimer); clearPreviewTimer = null }
  props.satelliteControl?.previewSatellite(pass.norad_id, pass.name || pass.norad_id)
}

function onMouseLeave(): void {
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
  clearPreviewTimer = setTimeout(() => { clearPreviewTimer = null; props.satelliteControl?.clearPreview() }, 50)
}

function onSatPositionUpdate(e: Event): void {
  if (!expandedKey.value) return
  const { noradId, position } = (e as CustomEvent<{
    noradId: string
    position: { alt_km: number; velocity_kms: number; track_deg: number; lat: number; lon: number; az?: number; el?: number }
  }>).detail
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
  liveAzEl.value = (position.az != null && position.el != null)
    ? { az: position.az, el: position.el }
    : null
}

onMounted(() => {
  const loc = props.getUserLocation()
  if (loc) void fetchPasses()
  else showNoLocation()

  refreshInterval = setInterval(() => { void fetchPasses() }, 5 * 60 * 1000)
  tickInterval = setInterval(() => {
    now.value = Date.now()
    passes.value = [...passes.value]
  }, 1000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (tickInterval) clearInterval(tickInterval)
  if (locationPoll) clearInterval(locationPoll)
  if (fetchAbort) fetchAbort.abort()
  if (accFetchAbort) accFetchAbort.abort()
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
})

useDocumentEvent('sat-position-update', onSatPositionUpdate)
useDocumentEvent('satellite-follow-changed', (e: Event) => {
  const { noradId, following } = (e as CustomEvent<{ noradId: string; following: boolean }>).detail
  followedNoradId.value = following ? noradId : null
})
useDocumentEvent('satellite-pass-notif-changed', (e: Event) => {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  notifNoradId.value = enabled ? noradId : (notifNoradId.value === noradId ? null : notifNoradId.value)
})
useDocumentEvent('satellite-auto-tune-changed', () => {
  // Re-read armed state from the store (another component may have toggled).
  armedTick.value++
})

defineExpose({ fetchPasses, minEl, hours, SATELLITE_CATEGORY_ORDER, SATELLITE_CATEGORY_DISPLAY_NAMES })
</script>

