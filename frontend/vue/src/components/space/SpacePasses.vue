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
          <div class="spp-acc-section spp-acc-section--track">
            <button class="spp-acc-track-btn" :class="{ 'spp-acc-track-btn--active': followedNoradId === pass.norad_id }" @click.stop="trackSat(pass)">{{ followedNoradId === pass.norad_id ? 'UNTRACK SATELLITE' : 'TRACK SATELLITE' }}</button>
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
import { ref, onMounted, onUnmounted } from 'vue'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { useDocumentEvent } from '../../composables/useDocumentEvent'
import ChevronIcon from '../shared/ChevronIcon.vue'
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
    props.satelliteControl?.switchSatellite(pass.norad_id, pass.name || pass.norad_id)
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
    position: { alt_km: number; velocity_kms: number; track_deg: number; lat: number; lon: number }
  }>).detail
  if (!expandedKey.value.startsWith(noradId)) return
  liveTelemetry.value = {
    alt: `${position.alt_km} km`,
    vel: `${position.velocity_kms} km/s`,
    hdg: `${position.track_deg}°`,
    lat: `${position.lat}°`,
    lon: `${position.lon}°`,
  }
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

defineExpose({ fetchPasses, selectedCategories, minEl, hours, SATELLITE_CATEGORY_ORDER, SATELLITE_CATEGORY_DISPLAY_NAMES })
</script>

