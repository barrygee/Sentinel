<template>
  <div id="spp-status-bar" :class="{ 'spp-loading': loading }">{{ statusText }}</div>
  <div id="spp-list">
    <div v-if="message" class="spp-message">
      <div>{{ message }}</div>
      <button v-if="showSetLocationBtn" class="spp-action-btn" @click="requestLocation">SET LOCATION</button>
    </div>
    <template v-else>
      <div
        v-for="pass in passes"
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
                  <div class="spp-acc-cell-value" :class="{ 'spp-acc-status-active': pass.radio_status === 'active', 'spp-acc-status-silent': pass.radio_status === 'silent' || pass.radio_status === 'inactive' }">{{ formatStatus(pass.radio_status) }}</div>
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
                :class="{ 'spp-acc-notif-btn--active': notifNoradId === pass.norad_id }"
                :aria-label="notifNoradId === pass.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                :title="notifNoradId === pass.norad_id ? 'Disable pass notifications' : 'Enable pass notifications'"
                @click.stop="togglePassNotif(pass)"
              >
                <svg width="14" height="14" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>
                  <path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>
                  <line v-if="notifNoradId !== pass.norad_id" x1="1.5" y1="1.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
                </svg>
              </button>
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
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { isPassNotifEnabled } from './controls/satellite/passNotifStore'
import { useDocumentEvent } from '../../composables/useDocumentEvent'
import ChevronIcon from '../shared/ChevronIcon.vue'
import SatPolarPlot from './SatPolarPlot.vue'
import {
  SATELLITE_CATEGORY_ORDER,
  SATELLITE_CATEGORY_DISPLAY_NAMES,
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

const selectedCategories = ref<Set<string>>(new Set(['space_station', 'weather', 'amateur']))
const minEl  = ref(35)
const hours  = ref(24)
const filtersExpanded = ref(false)

const expandedKey = ref<string | null>(null)
const liveTelemetry = ref<Record<string, string>>({})

const accLoading = ref(false)
const accStatus  = ref('COMPUTING PASSES…')
const accPasses  = ref<AccPass[]>([])

const now = ref(Date.now())
const followedNoradId = ref<string | null>(props.satelliteControl?.followedNoradId ?? null)
const notifNoradId    = ref<string | null>(
  props.satelliteControl?.passNotificationsEnabled ? props.satelliteControl.activeNoradId : null,
)

function readPassNotifState(noradId: string): boolean {
  return isPassNotifEnabled(noradId)
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
  const cats = Array.from(selectedCategories.value).join(',')
  if (!cats) { message.value = 'Select at least one satellite category.'; showSetLocationBtn.value = false; return }
  loading.value = true
  statusText.value = 'COMPUTING PASSES…'
  message.value = ''
  try {
    const url = `/api/space/passes?lat=${lat}&lon=${lon}&hours=${hours.value}&min_el=${minEl.value}&categories=${encodeURIComponent(cats)}&limit=100`
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
    const t = new Date(data.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    statusText.value = `${data.satellite_count} SATELLITES · UPDATED ${t}`
    if (!passes.value.length) message.value = 'No passes found. Try broader categories, lower elevation, or longer window.'
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
  expandedKey.value = null
  accPasses.value = []
  if (accFetchAbort) { accFetchAbort.abort(); accFetchAbort = null }
}

function onCardClick(pass: SatPass): void {
  const key = passKey(pass)
  const wasExpanded = expandedKey.value === key
  collapseExpanded()
  if (!wasExpanded) {
    expandedKey.value = key
    accPasses.value = []
    accStatus.value = 'COMPUTING PASSES…'
    accLoading.value = true
    liveTelemetry.value = {}
    liveAzEl.value = null
    props.satelliteControl?.switchSatellite(pass.norad_id, pass.name || pass.norad_id)
    notifNoradId.value = readPassNotifState(pass.norad_id) ? pass.norad_id : null
    void fetchAccordionPasses(pass.norad_id)
  }
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

defineExpose({ fetchPasses, selectedCategories, minEl, hours, SATELLITE_CATEGORY_ORDER, SATELLITE_CATEGORY_DISPLAY_NAMES })
</script>

