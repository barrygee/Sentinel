<template>
  <div id="space-filter-input-wrap">
    <input
      ref="inputRef"
      id="space-filter-input"
      type="text"
      placeholder="SATELLITE NAME · NORAD ID · CATEGORY"
      v-model="query"
      autocomplete="off"
      spellcheck="false"
      @keydown="onKeydown"
    />
    <button
      id="space-filter-clear-btn"
      :class="{ 'space-filter-clear-visible': query.length > 0 }"
      aria-label="Clear filter"
      @click="clearQuery"
    >✕</button>
  </div>
  <div id="space-filter-results">
    <template v-if="!loaded">
      <div class="space-filter-no-results">Loading satellite database…</div>
    </template>
    <template v-else-if="results.length === 0">
      <div class="space-filter-no-results">No satellites found</div>
    </template>
    <template v-else>
      <template v-for="group in groupedResults" :key="group.cat">
        <button
          class="space-filter-section-label"
          @click="toggleSection(group.cat)"
        >
          <span>{{ group.label }}</span>
          <ChevronIcon class="space-filter-section-chevron" :class="{ 'space-filter-section-chevron--collapsed': collapsedCats.has(group.cat) }" />
        </button>
        <template v-if="!collapsedCats.has(group.cat)">
        <div
          v-for="sat in group.sats"
          :key="sat.norad_id"
          class="space-filter-result-item"
          :class="{ 'sfr-expanded': expandedNoradId === sat.norad_id, 'keyboard-focused': focusedNoradId === sat.norad_id }"
          @mouseenter="onMouseEnter(sat)"
          @mouseleave="onMouseLeave"
          @click="onItemClick(sat)"
        >
          <div class="space-filter-result-info">
            <div class="space-filter-result-primary">{{ sat.name || sat.norad_id }}</div>
            <div class="space-filter-result-secondary">{{ satSecondary(sat) }}</div>
          </div>
          <span class="sfr-item-chevron">
            <ChevronIcon />
          </span>
          <!-- Expanded accordion body -->
          <div v-if="expandedNoradId === sat.norad_id" class="sfr-accordion-body">
            <div class="sfr-acc-section">
              <div class="sfr-acc-section-title">POSITION DATA</div>
              <div class="sfr-acc-grid sfr-acc-grid--three">
                <div class="sfr-acc-cell sfr-acc-cell--lat">
                  <div class="sfr-acc-cell-label">LATITUDE</div>
                  <div class="sfr-acc-cell-value sfr-acc-cell-value--lat">{{ liveTelemetry['lat'] ?? '—' }}</div>
                </div>
                <div class="sfr-acc-cell sfr-acc-cell--lon">
                  <div class="sfr-acc-cell-label">LONGITUDE</div>
                  <div class="sfr-acc-cell-value sfr-acc-cell-value--lon">{{ liveTelemetry['lon'] ?? '—' }}</div>
                </div>
                <div class="sfr-acc-cell sfr-acc-cell--hdg">
                  <div class="sfr-acc-cell-label">HEADING</div>
                  <div class="sfr-acc-cell-value sfr-acc-cell-value--hdg">{{ liveTelemetry['hdg'] ?? '—' }}</div>
                </div>
              </div>
            </div>
            <div class="sfr-acc-section">
              <div class="sfr-acc-section-title">ORBITAL DATA</div>
              <div class="sfr-acc-grid sfr-acc-grid--three">
                <div class="sfr-acc-cell sfr-acc-cell--alt">
                  <div class="sfr-acc-cell-label">ALTITUDE</div>
                  <div class="sfr-acc-cell-value sfr-acc-cell-value--alt">{{ liveTelemetry['alt'] ?? '—' }}</div>
                </div>
                <div class="sfr-acc-cell sfr-acc-cell--vel">
                  <div class="sfr-acc-cell-label">VELOCITY</div>
                  <div class="sfr-acc-cell-value sfr-acc-cell-value--vel">{{ liveTelemetry['vel'] ?? '—' }}</div>
                </div>
              </div>
            </div>
            <div v-if="hasRadioInfo(sat)" class="sfr-acc-section sfr-acc-section--radio">
              <div class="sfr-acc-section-title">RADIO</div>
              <div class="sfr-acc-radio-grid">
                <template v-if="sat.uplink_hz">
                  <div class="sfr-acc-cell sfr-acc-cell--uplink">
                    <div class="sfr-acc-cell-label">UPLINK</div>
                    <div class="sfr-acc-cell-value">{{ formatHz(sat.uplink_hz) }}<span v-if="sat.uplink_mode" class="sfr-acc-cell-mode"> · {{ sat.uplink_mode }}</span></div>
                  </div>
                </template>
                <template v-if="sat.downlink_hz">
                  <div class="sfr-acc-cell sfr-acc-cell--downlink">
                    <div class="sfr-acc-cell-label">DOWNLINK</div>
                    <div class="sfr-acc-cell-value">{{ formatHz(sat.downlink_hz) }}<span v-if="sat.downlink_mode" class="sfr-acc-cell-mode"> · {{ sat.downlink_mode }}</span></div>
                  </div>
                </template>
                <template v-if="sat.ctcss_hz">
                  <div class="sfr-acc-cell sfr-acc-cell--ctcss">
                    <div class="sfr-acc-cell-label">CTCSS</div>
                    <div class="sfr-acc-cell-value">{{ sat.ctcss_hz.toFixed(1) }} Hz</div>
                  </div>
                </template>
                <template v-if="sat.transponder_type">
                  <div class="sfr-acc-cell sfr-acc-cell--transponder">
                    <div class="sfr-acc-cell-label">TRANSPONDER</div>
                    <div class="sfr-acc-cell-value">{{ sat.transponder_type }}</div>
                  </div>
                </template>
                <template v-if="sat.beacon_hz">
                  <div class="sfr-acc-cell sfr-acc-cell--beacon">
                    <div class="sfr-acc-cell-label">BEACON</div>
                    <div class="sfr-acc-cell-value">{{ formatHz(sat.beacon_hz) }}</div>
                  </div>
                </template>
                <template v-if="sat.radio_status">
                  <div class="sfr-acc-cell sfr-acc-cell--status">
                    <div class="sfr-acc-cell-label">STATUS</div>
                    <div class="sfr-acc-cell-value">{{ formatStatus(sat.radio_status) }}</div>
                  </div>
                </template>
              </div>
              <div v-if="sat.packet_info" class="sfr-acc-radio-line">
                <div class="sfr-acc-cell-label">PACKET / DIGITAL</div>
                <ul class="sfr-acc-radio-list">
                  <li v-for="(p, i) in splitNotes(sat.packet_info)" :key="i">{{ p }}</li>
                </ul>
              </div>
              <div v-if="sat.radio_notes" class="sfr-acc-radio-line">
                <div class="sfr-acc-cell-label">NOTES</div>
                <ul class="sfr-acc-radio-list">
                  <li v-for="(n, i) in splitNotes(sat.radio_notes)" :key="i">{{ n }}</li>
                </ul>
              </div>
            </div>
            <div class="sfr-acc-section sfr-acc-section--track">
              <div class="sfr-acc-track-row">
                <button class="sfr-acc-track-btn" :class="{ 'sfr-acc-track-btn--active': followedNoradId === sat.norad_id }" @click.stop="trackSat(sat)">{{ followedNoradId === sat.norad_id ? 'UNTRACK SATELLITE' : 'TRACK SATELLITE' }}</button>
                <button
                  class="sfr-acc-notif-btn"
                  :class="{ 'sfr-acc-notif-btn--active': notifNoradId === sat.norad_id }"
                  :aria-label="notifNoradId === sat.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                  :data-tooltip="notifNoradId === sat.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                  @click.stop="togglePassNotif(sat)"
                >
                  <svg width="14" height="14" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>
                    <path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>
                  </svg>
                </button>
                <button
                  v-if="sat.downlink_hz"
                  class="sfr-acc-autotune-btn"
                  :class="{ 'sfr-acc-autotune-btn--active': autoTuneNoradId === sat.norad_id }"
                  :aria-label="autoTuneLabel(sat)"
                  :data-tooltip="autoTuneLabel(sat)"
                  @click.stop="toggleAutoTune(sat)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <!-- radio receiver: matches the SDR tab glyph -->
                    <path d="M5 7h14v12H5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
                    <line x1="6" y1="7" x2="17" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <circle cx="9" cy="13" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/>
                    <line x1="15.5" y1="11" x2="17" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <line x1="15.5" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="sfr-acc-section sfr-acc-section--polar">
              <div class="sfr-acc-section-title sfr-acc-polar-title">
                <span>{{ polarTitle }}</span>
                <span v-if="polarPass" class="sfr-acc-polar-maxel">MAX {{ polarPass.max_elevation_deg.toFixed(0) }}°</span>
              </div>
              <SatPolarPlot
                v-if="polarPass && polarPass.sky_track && polarPass.sky_track.length > 1"
                :track="polarPass.sky_track"
                :live="polarLive"
              />
              <div v-else class="sfr-acc-polar-empty">
                {{ accordionLoading ? 'COMPUTING ARC…' : 'NO UPCOMING PASS TO PLOT' }}
              </div>
            </div>
            <div class="sfr-acc-section sfr-acc-section--passes">
              <div class="sfr-acc-section-title sfr-acc-passes-title">
                <span>UPCOMING PASSES</span>
                <span class="sfr-acc-status" :class="{ 'sfr-acc-status-loading': accordionLoading }">{{ accordionStatus }}</span>
              </div>
              <div class="sfr-acc-pass-list">
              <template v-if="accordionPasses.length === 0 && !accordionLoading">
                <div v-if="accordionStatus.startsWith('NEXT')" class="sfr-acc-no-passes">No passes in the next 24 hours.</div>
              </template>
              <div
                v-for="(pass, i) in accordionPasses"
                :key="i"
                class="sfr-acc-pass-card"
                :data-aos-ms="pass.aos_unix_ms"
                :data-los-ms="pass.los_unix_ms"
              >
                <div class="sfr-acc-pass-times">
                  <div class="sfr-acc-pass-aos-row">
                    <span class="sfr-acc-pass-date">{{ formatPassDate(pass.aos_utc) }}</span>
                    <span class="sfr-acc-pass-time">{{ formatPassTime(pass.aos_utc) }}</span>
                  </div>
                  <div class="sfr-acc-pass-los">LOS {{ formatPassTime(pass.los_utc) }} · {{ formatPassDuration(pass.duration_s) }}</div>
                </div>
                <div class="sfr-acc-pass-meta">
                  <div class="sfr-acc-pass-countdown" :class="{ 'sfr-in-progress': isNow(pass) }">
                    {{ isNow(pass) ? 'NOW' : passCountdownText(pass) }}
                  </div>
                  <div class="sfr-acc-pass-maxel">MAX {{ pass.max_elevation_deg.toFixed(1) }}°</div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { isPassNotifEnabled, isAutoTuneEnabled, setAutoTuneEnabled } from './controls/satellite/passNotifStore'
import { useNotificationsStore } from '../../stores/notifications'
import { useDocumentEvent } from '../../composables/useDocumentEvent'
import ChevronIcon from '../shared/ChevronIcon.vue'
import SatPolarPlot from './SatPolarPlot.vue'
import {
  SATELLITE_CATEGORY_SHORT_LABELS,
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_SECTION_LABELS,
  formatPassCountdown,
  formatPassDuration,
  formatPassTime,
  formatPassDate,
} from '../../utils/satelliteUtils'

interface SatEntry {
  norad_id:         string
  name:             string
  category:         string | null
  updated_at:       number | null
  uplink_hz?:        number | null
  uplink_mode?:      string | null
  downlink_hz?:      number | null
  downlink_mode?:    string | null
  ctcss_hz?:         number | null
  transponder_type?: string | null
  beacon_hz?:        number | null
  packet_info?:      string | null
  radio_status?:     string | null
  radio_notes?:      string | null
}

function formatHz(hz: number | null | undefined): string {
  if (hz == null) return '—'
  if (hz >= 1_000_000_000) return (hz / 1_000_000_000).toFixed(3) + ' GHz'
  if (hz >= 1_000_000) return (hz / 1_000_000).toFixed(3) + ' MHz'
  if (hz >= 1_000) return (hz / 1_000).toFixed(3) + ' kHz'
  return String(hz) + ' Hz'
}

function hasRadioInfo(sat: SatEntry): boolean {
  return !!(sat.uplink_hz || sat.downlink_hz || sat.beacon_hz ||
    sat.transponder_type || sat.packet_info || sat.radio_status || sat.radio_notes)
}

function splitNotes(s: string | null | undefined): string[] {
  if (!s) return []
  return s.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean)
}

function formatStatus(s: string | null | undefined): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

interface SkyPoint {
  az: number
  el: number
}

interface SatPass {
  aos_utc:           string
  los_utc:           string
  aos_unix_ms:       number
  los_unix_ms:       number
  duration_s:        number
  max_elevation_deg: number
  max_el_utc:        string
  sky_track?:        SkyPoint[]
}

const props = defineProps<{
  satelliteControl: SatelliteControl | null
  getUserLocation: () => [number, number] | null
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const query         = ref('')
const satellites    = ref<SatEntry[]>([])
const loaded        = ref(false)
const expandedNoradId = ref<string | null>(null)
const focusedNoradId  = ref<string | null>(null)

// Collapsed category groups. Groups default to expanded; a category present here is collapsed.
const collapsedCats = ref<Set<string>>(new Set())
// Categories collapsed by the user but force-opened by the search auto-expand. They
// re-collapse once their matches go away, unless the user manually toggles them.
const autoOpenedCats = ref<Set<string>>(new Set())
function toggleSection(cat: string): void {
  const next = new Set(collapsedCats.value)
  if (next.has(cat)) next.delete(cat)
  else next.add(cat)
  collapsedCats.value = next
  // A manual toggle takes ownership: drop any auto-open bookkeeping for this category.
  autoOpenedCats.value.delete(cat)
}

const accordionLoading = ref(false)
const accordionStatus  = ref('COMPUTING PASSES…')
const accordionPasses  = ref<SatPass[]>([])
const liveTelemetry    = ref<Record<string, string>>({})
const followedNoradId  = ref<string | null>(props.satelliteControl?.followedNoradId ?? null)
const notifNoradId     = ref<string | null>(
  props.satelliteControl?.passNotificationsEnabled ? props.satelliteControl.activeNoradId : null,
)
// Like notifNoradId, tracks auto-tune state for the single expanded accordion.
const autoTuneNoradId  = ref<string | null>(null)
const notificationsStore = useNotificationsStore()

const now = ref(Date.now())

// Exact observer-relative look-angles for the live satellite, supplied by the
// backend on each position poll. Null until the first annotated update arrives.
const liveAzEl = ref<SkyPoint | null>(null)

// The pass to plot: the active (in-progress) pass if there is one, else the next.
const polarPass = computed<SatPass | null>(() => {
  if (!accordionPasses.value.length) return null
  const active = accordionPasses.value.find(p => isNow(p))
  if (active) return active
  return accordionPasses.value.find(p => p.aos_unix_ms > now.value) ?? null
})

const polarTitle = computed(() => {
  const p = polarPass.value
  if (!p) return 'NEXT PASS'
  const label = isNow(p) ? 'CURRENT PASS' : 'NEXT PASS'
  return `${label} · ${formatPassDate(p.aos_utc)} ${formatPassTime(p.aos_utc)}`
})

// Show the live marker only while the plotted pass is actually in progress.
const polarLive = computed<SkyPoint | null>(() => {
  const p = polarPass.value
  if (!p || !isNow(p)) return null
  return liveAzEl.value
})

function readPassNotifState(noradId: string): boolean {
  return isPassNotifEnabled(noradId)
}

function autoTuneLabel(_sat: SatEntry): string {
  return 'Auto-tune SDR'
}

function toggleAutoTune(sat: SatEntry): void {
  if (!sat.downlink_hz) return
  const noradId = sat.norad_id
  const name = sat.name || noradId
  const enabled = autoTuneNoradId.value !== noradId
  setAutoTuneEnabled(noradId, enabled, {
    name,
    downlinkHz: sat.downlink_hz ?? undefined,
    downlinkMode: sat.downlink_mode ?? undefined,
  })
  autoTuneNoradId.value = enabled ? noradId : null
  document.dispatchEvent(new CustomEvent('satellite-auto-tune-changed', { detail: { noradId, enabled } }))
  if (enabled) {
    notificationsStore.add({
      type: 'autotune', title: name, detail: 'Auto-tune on pass enabled', noradId,
    })
  } else {
    // Remove the persistent "Auto-tune on pass enabled" card so the alerts list
    // stays in sync (the live pass/tune trace alerts share the noradId but have
    // a different detail, so match on it to leave those untouched).
    notificationsStore.items
      .filter(i => i.type === 'autotune' && i.noradId === noradId && i.detail === 'Auto-tune on pass enabled')
      .forEach(i => notificationsStore.dismiss(i.id))
  }
}

let clearPreviewTimer: ReturnType<typeof setTimeout> | null = null
let itemFetchAbort: AbortController | null = null
let itemTickInterval: ReturnType<typeof setInterval> | null = null
let countdownTick: ReturnType<typeof setInterval> | null = null

const CATEGORY_ALIASES: Record<string, string[]> = {
  space_station: ['space station', 'station', 'iss'],
  amateur:       ['amateur', 'ham'],
  weather:       ['weather', 'met'],
  military:      ['military', 'mil', 'defense', 'defence'],
  navigation:    ['navigation', 'nav', 'gps', 'gnss'],
  science:       ['science', 'sci', 'research'],
  cubesat:       ['cubesat', 'cube', 'smallsat'],
  active:        ['active'],
  unknown:       ['unknown', 'unkn'],
}

function categoryForQuery(q: string): string | null {
  const lq = q.toLowerCase().trim()
  if (lq.length < 2) return null
  for (const [cat, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some(a => a === lq || a.startsWith(lq) || lq.startsWith(a))) return cat
  }
  return null
}

// Lower score = better match, so the most relevant satellites sort first
// within their category group (e.g. "ISS (ZARYA)" floats above the other
// space stations when the query is "iss").
function matchScore(s: SatEntry, lq: string, matchedCat: string | null): number {
  const name = s.name?.toLowerCase() ?? ''
  if (name === lq) return 0
  if (name.startsWith(lq)) return 1
  if (name.includes(lq)) return 2
  if (s.norad_id.includes(lq)) return 3
  if (matchedCat !== null && s.category === matchedCat) return 4
  return 5
}

const results = computed<SatEntry[]>(() => {
  const q = query.value.trim()
  if (!q) return satellites.value
  const matchedCat = categoryForQuery(q)
  const lq = q.toLowerCase()
  return satellites.value
    .filter(s =>
      s.name?.toLowerCase().includes(lq) ||
      s.norad_id.includes(lq) ||
      (matchedCat !== null && s.category === matchedCat),
    )
    .sort((a, b) => matchScore(a, lq, matchedCat) - matchScore(b, lq, matchedCat))
})

const groupedResults = computed(() => {
  const CAP = 20
  const groups = new Map<string, SatEntry[]>()
  for (const cat of SATELLITE_CATEGORY_ORDER) groups.set(cat, [])
  for (const sat of results.value) {
    const key = sat.category || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(sat)
  }
  const out: { cat: string; label: string; sats: SatEntry[] }[] = []
  groups.forEach((sats, cat) => {
    if (!sats.length) return
    out.push({
      cat,
      label: SATELLITE_CATEGORY_SECTION_LABELS[cat] || cat.replace(/_/g, ' ').toUpperCase(),
      sats: sats.slice(0, CAP),
    })
  })
  return out
})

// Keep auto-expanded categories in sync with the search. A collapsed category that
// gains matches is force-opened; once its matches disappear (or the query is
// cleared) it re-collapses, so it returns to the state the user left it in.
watch([query, groupedResults], () => {
  const searching = query.value.trim().length > 0
  const matched = new Set(searching ? groupedResults.value.map(g => g.cat) : [])
  const next = new Set(collapsedCats.value)
  let changed = false
  for (const cat of matched) {
    if (next.has(cat)) {
      next.delete(cat)
      autoOpenedCats.value.add(cat)
      changed = true
    }
  }
  for (const cat of [...autoOpenedCats.value]) {
    if (!matched.has(cat)) {
      next.add(cat)
      autoOpenedCats.value.delete(cat)
      changed = true
    }
  }
  if (changed) collapsedCats.value = next
})

function satSecondary(sat: SatEntry): string {
  const catLabel = sat.category ? (SATELLITE_CATEGORY_SHORT_LABELS[sat.category] || sat.category.toUpperCase()) : ''
  return catLabel ? `${catLabel} · NORAD ${sat.norad_id}` : `NORAD ${sat.norad_id}`
}

function onMouseEnter(sat: SatEntry): void {
  if (clearPreviewTimer) { clearTimeout(clearPreviewTimer); clearPreviewTimer = null }
  props.satelliteControl?.previewSatellite(sat.norad_id, sat.name || sat.norad_id)
}

function onMouseLeave(): void {
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
  clearPreviewTimer = setTimeout(() => {
    clearPreviewTimer = null
    props.satelliteControl?.clearPreview()
  }, 50)
}

function onItemClick(sat: SatEntry): void {
  const wasExpanded = expandedNoradId.value === sat.norad_id
  collapseExpanded()
  if (!wasExpanded) {
    expandedNoradId.value = sat.norad_id
    accordionPasses.value = []
    accordionStatus.value = 'COMPUTING PASSES…'
    accordionLoading.value = true
    liveTelemetry.value = {}
    liveAzEl.value = null
    props.satelliteControl?.switchSatellite(sat.norad_id, sat.name || sat.norad_id)
    notifNoradId.value = readPassNotifState(sat.norad_id) ? sat.norad_id : null
    autoTuneNoradId.value = isAutoTuneEnabled(sat.norad_id) ? sat.norad_id : null
    void fetchAccordionPasses(sat.norad_id)
  }
}

function collapseExpanded(): void {
  expandedNoradId.value = null
  accordionPasses.value = []
  if (itemFetchAbort) { itemFetchAbort.abort(); itemFetchAbort = null }
  if (itemTickInterval) { clearInterval(itemTickInterval); itemTickInterval = null }
}

async function fetchAccordionPasses(noradId: string): Promise<void> {
  if (itemFetchAbort) { itemFetchAbort.abort() }
  itemFetchAbort = new AbortController()
  const abort = itemFetchAbort
  const loc = props.getUserLocation()
  if (!loc) {
    accordionStatus.value = 'SET LOCATION TO CALCULATE PASSES'
    accordionLoading.value = false
    return
  }
  const [lon, lat] = loc
  try {
    const url = `/api/space/satellite/${encodeURIComponent(noradId)}/passes?lat=${lat}&lon=${lon}&hours=24&min_el=0`
    const resp = await fetch(url, { signal: abort.signal })
    if (abort.signal.aborted) return
    if (!resp.ok) { accordionStatus.value = 'COULD NOT LOAD PASSES'; accordionLoading.value = false; return }
    const data = await resp.json() as { passes: SatPass[]; computed_at: string }
    const t = new Date(data.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    accordionStatus.value = `NEXT 24H · UPDATED ${t}`
    accordionPasses.value = data.passes || []
    accordionLoading.value = false
    startItemTick()
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    accordionStatus.value = 'NETWORK ERROR'
    accordionLoading.value = false
  }
}

function startItemTick(): void {
  if (itemTickInterval) clearInterval(itemTickInterval)
  itemTickInterval = setInterval(() => { accordionPasses.value = [...accordionPasses.value] }, 1000)
}

function togglePassNotif(sat: SatEntry): void {
  const ctrl = props.satelliteControl
  if (!ctrl) return
  if (ctrl.activeNoradId !== sat.norad_id) {
    ctrl.switchSatellite(sat.norad_id, sat.name || sat.norad_id)
  }
  ctrl.togglePassNotifications()
}

function trackSat(sat: SatEntry): void {
  if (followedNoradId.value === sat.norad_id) {
    props.satelliteControl?.stopFollowing()
  } else {
    props.satelliteControl?.switchSatellite(sat.norad_id, sat.name || sat.norad_id, true)
  }
}

function clearQuery(): void {
  query.value = ''
  collapseExpanded()
  inputRef.value?.focus()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') { clearQuery(); return }
  const allSats = groupedResults.value
    .filter(g => !collapsedCats.value.has(g.cat))
    .flatMap(g => g.sats)
  if (!allSats.length) return
  const idx = allSats.findIndex(s => s.norad_id === focusedNoradId.value)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = allSats[idx + 1] || allSats[0]
    focusedNoradId.value = next.norad_id
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (idx <= 0) { focusedNoradId.value = null; return }
    focusedNoradId.value = allSats[idx - 1].norad_id
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = focusedNoradId.value
      ? allSats.find(s => s.norad_id === focusedNoradId.value)
      : allSats[0]
    if (target) onItemClick(target)
  }
}

// Live telemetry forwarding into expanded accordion
function onSatPositionUpdate(e: Event): void {
  if (!expandedNoradId.value) return
  const { noradId, position } = (e as CustomEvent<{
    noradId: string
    position: { alt_km: number; velocity_kms: number; track_deg: number; lat: number; lon: number; az?: number; el?: number }
  }>).detail
  if (noradId !== expandedNoradId.value) return
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

async function loadSatellites(): Promise<void> {
  try {
    const resp = await fetch('/api/space/tle/list')
    if (!resp.ok) { loaded.value = true; return }
    const data = await resp.json() as { satellites?: SatEntry[] }
    satellites.value = data.satellites ?? []
    loaded.value = true
  } catch {
    loaded.value = true
  }
}

function isNow(pass: SatPass): boolean {
  const now = Date.now()
  return now >= pass.aos_unix_ms && now <= pass.los_unix_ms
}
function passCountdownText(pass: SatPass): string {
  return formatPassCountdown(pass.aos_unix_ms - Date.now())
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
  if (countdownTick) clearInterval(countdownTick)
  if (itemFetchAbort) itemFetchAbort.abort()
  if (itemTickInterval) clearInterval(itemTickInterval)
  if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
})

useDocumentEvent('sat-position-update', onSatPositionUpdate)
useDocumentEvent('settings-panel-closed', onSettingsPanelClosed)
useDocumentEvent('satellite-follow-changed', (e: Event) => {
  const { noradId, following } = (e as CustomEvent<{ noradId: string; following: boolean }>).detail
  followedNoradId.value = following ? noradId : null
})
useDocumentEvent('satellite-pass-notif-changed', (e: Event) => {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  notifNoradId.value = enabled ? noradId : (notifNoradId.value === noradId ? null : notifNoradId.value)
})
useDocumentEvent('satellite-auto-tune-changed', (e: Event) => {
  const { noradId, enabled } = (e as CustomEvent<{ noradId: string; enabled: boolean }>).detail
  autoTuneNoradId.value = enabled ? noradId : (autoTuneNoradId.value === noradId ? null : autoTuneNoradId.value)
})

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style>
#space-filter-input-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 20px 0 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
}

#space-filter-icon {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.35);
    display: block;
}

#space-filter-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: #fff;
    font-family: 'Barlow Condensed', 'Barlow', sans-serif;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    caret-color: var(--color-accent);
    min-width: 0;
}

#space-filter-input::placeholder {
    color: rgba(255, 255, 255, 0.2);
    font-size: 11px;
    letter-spacing: 0.14em;
}

#space-filter-clear-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.3);
    font-family: 'Barlow', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 0;
    margin-right: 6px;
    display: none;
    transition: color 0.15s;
    flex-shrink: 0;
}

#space-filter-clear-btn.space-filter-clear-visible {
    display: block;
}

#space-filter-clear-btn:hover {
    color: var(--color-text-muted);
}

#space-filter-results {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
}

#space-filter-results::-webkit-scrollbar {
    display: none;
}

.space-filter-section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-accent);
    padding: 22px 20px 12px 24px;
    text-transform: uppercase;
    text-align: left;
    flex-shrink: 0;
    transition: opacity 0.12s;
}

.space-filter-section-label:hover {
    opacity: 0.8;
}

.space-filter-section-label:first-child {
    padding-top: 24px;
}

.space-filter-section-chevron {
    color: rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
    transition: transform 0.2s ease;
}

/* Match the per-item chevron convention: down when expanded, left when collapsed. */
.space-filter-section-chevron--collapsed {
    transform: rotate(-90deg);
}

.space-filter-result-item {
    display: flex;
    flex-direction: column;
    position: relative;
    cursor: pointer;
    transition: background 0.12s;
}

.space-filter-result-item > .space-filter-result-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 13px 52px 13px 24px;
    min-width: 0;
}

.space-filter-result-item:hover,
.space-filter-result-item.keyboard-focused {
    background: rgba(255, 255, 255, 0.04);
}

.space-filter-result-item.sfr-expanded {
    background: rgba(255, 255, 255, 0.04);
}

.space-filter-result-item.keyboard-focused {
    outline: 1px solid rgba(200, 255, 0, 0.4);
    outline-offset: -1px;
}

.space-filter-result-icon {
    display: none;
}

.space-filter-result-primary {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.space-filter-result-secondary {
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sfr-item-chevron {
    position: absolute;
    right: 0;
    top: 0;
    height: 44px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.25);
    transition: transform 0.2s ease, color 0.15s;
    transform: rotate(-90deg);
    pointer-events: none;
}

.space-filter-result-item.sfr-expanded .sfr-item-chevron {
    transform: rotate(0deg);
    color: var(--color-accent);
}

.sfr-accordion-body {
    display: flex;
    flex-direction: column;
    animation: sfr-expand 0.18s ease;
}

@keyframes sfr-expand {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
}

.sfr-acc-section {
    padding: 14px 24px 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sfr-acc-section-title {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-accent);
    text-transform: uppercase;
}

.sfr-acc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
    row-gap: 12px;
}

.sfr-acc-grid.sfr-acc-grid--three {
    grid-template-columns: 1fr 1fr 1fr;
}

.sfr-acc-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.sfr-acc-cell-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
}

.sfr-acc-cell-value {
    font-family: var(--font-primary);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}


.sfr-acc-section--track {
    padding-top: 16px;
    padding-bottom: 24px;
}

.sfr-acc-track-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
}

.sfr-acc-track-btn {
    flex: 1;
    background: #0d1015;
    border: none;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.6);
    padding: 12px;
    text-transform: uppercase;
    transition: color 0.12s, background 0.12s;
}

.sfr-acc-track-btn:hover {
    color: var(--color-accent);
    background: #05070a;
}

.sfr-acc-track-btn.sfr-acc-track-btn--active {
    color: var(--color-accent);
    background: rgba(200, 255, 0, 0.12);
}

.sfr-acc-track-btn.sfr-acc-track-btn--active:hover {
    background: rgba(200, 255, 0, 0.18);
}

.sfr-acc-notif-btn {
    position: relative;
    flex: 0 0 auto;
    width: 44px;
    background: #0d1015;
    border: none;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s, background 0.12s;
}

.sfr-acc-notif-btn:hover {
    color: var(--color-accent);
    background: #05070a;
}

.sfr-acc-notif-btn.sfr-acc-notif-btn--active {
    color: var(--color-accent);
    background: rgba(200, 255, 0, 0.12);
}

.sfr-acc-notif-btn.sfr-acc-notif-btn--active:hover {
    background: rgba(200, 255, 0, 0.18);
}

.sfr-acc-autotune-btn {
    position: relative;
    flex: 0 0 auto;
    width: 44px;
    background: #0d1015;
    border: none;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s, background 0.12s;
}

.sfr-acc-autotune-btn:hover {
    color: var(--color-accent);
    background: #05070a;
}

.sfr-acc-autotune-btn.sfr-acc-autotune-btn--active {
    color: var(--color-accent);
    background: rgba(200, 255, 0, 0.12);
}

.sfr-acc-autotune-btn.sfr-acc-autotune-btn--active:hover {
    background: rgba(200, 255, 0, 0.18);
}

/* Styled tooltips for the notif / auto-tune icon buttons — matches the
   sidebar tab (rail) tooltip style. Positioned above the button row. */
.sfr-acc-notif-btn[data-tooltip]::before,
.sfr-acc-autotune-btn[data-tooltip]::before {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    color: var(--color-text-muted);
    font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    padding: 0 14px;
    height: 28px;
    display: flex;
    align-items: center;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 10002;
}

.sfr-acc-notif-btn[data-tooltip]:hover::before,
.sfr-acc-autotune-btn[data-tooltip]:hover::before {
    opacity: 1;
}

.sfr-acc-section--polar {
    padding-top: 14px;
    padding-bottom: 6px;
    gap: 8px;
}

.sfr-acc-polar-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

.sfr-acc-polar-maxel {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.32);
    text-transform: uppercase;
}

.sfr-acc-polar-empty {
    padding: 18px 0;
    text-align: center;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.28);
    text-transform: uppercase;
}

.sfr-acc-section--passes {
    padding-top: 6px;
    padding-bottom: 4px;
    gap: 6px;
}

.sfr-acc-passes-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

.sfr-acc-status {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.28);
    text-transform: uppercase;
}

.sfr-acc-status.sfr-acc-status-loading {
    color: var(--color-accent);
}

.sfr-acc-no-passes {
    padding: 4px 0 8px 0;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.28);
    text-transform: uppercase;
}

.sfr-acc-pass-list {
    display: flex;
    flex-direction: column;
    margin: 0 -24px;
}

.sfr-acc-pass-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 24px;
}

.sfr-acc-pass-card:last-child {
    padding-bottom: 16px;
}

.sfr-acc-pass-num {
    display: none;
}

.sfr-acc-pass-times {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sfr-acc-pass-aos-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
}

.sfr-acc-pass-date {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.28);
    text-transform: uppercase;
    flex-shrink: 0;
}

.sfr-acc-pass-time {
    font-family: var(--font-primary);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #fff;
}

.sfr-acc-pass-los {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.07em;
    color: rgba(255, 255, 255, 0.28);
    text-transform: uppercase;
}

.sfr-acc-pass-meta {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
}

.sfr-acc-pass-countdown {
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--color-accent);
    white-space: nowrap;
    text-transform: uppercase;
}

.sfr-acc-pass-countdown.sfr-in-progress {
    color: #ff9900;
}

.sfr-acc-pass-maxel {
    font-family: var(--font-primary);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.07em;
    color: rgba(255, 255, 255, 0.32);
    white-space: nowrap;
    text-transform: uppercase;
}

.space-filter-no-results {
    padding: 20px 18px;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.25);
    text-align: center;
    text-transform: uppercase;
}

/* ---- RADIO section ---- */
.sfr-acc-radio-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
    row-gap: 12px;
}
.sfr-acc-radio-grid .sfr-acc-cell {
    align-items: flex-start;
    text-align: left;
}
.sfr-acc-cell-mode {
    color: rgba(255, 255, 255, 0.45);
    font-weight: 400;
    margin-left: 2px;
}
.sfr-acc-radio-line {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.sfr-acc-radio-text {
    font-family: var(--font-primary);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.78);
}
.sfr-acc-radio-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.sfr-acc-radio-list li {
    position: relative;
    padding-left: 14px;
    font-family: var(--font-primary);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.82);
}
.sfr-acc-radio-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-accent);
    opacity: 0.65;
}
@media (max-width: 480px) {
    .sfr-acc-radio-grid {
        grid-template-columns: 1fr;
    }
}
</style>
