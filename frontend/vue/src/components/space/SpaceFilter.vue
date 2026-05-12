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
        <div class="space-filter-section-label">{{ group.label }}</div>
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
            <div class="sfr-acc-section sfr-acc-section--track">
              <button class="sfr-acc-track-btn" :class="{ 'sfr-acc-track-btn--active': followedNoradId === sat.norad_id }" @click.stop="trackSat(sat)">{{ followedNoradId === sat.norad_id ? 'UNTRACK SATELLITE' : 'TRACK SATELLITE' }}</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'
import { useDocumentEvent } from '../../composables/useDocumentEvent'
import ChevronIcon from '../shared/ChevronIcon.vue'
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
  norad_id:   string
  name:       string
  category:   string | null
  updated_at: number | null
}

interface SatPass {
  aos_utc:           string
  los_utc:           string
  aos_unix_ms:       number
  los_unix_ms:       number
  duration_s:        number
  max_elevation_deg: number
  max_el_utc:        string
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

const accordionLoading = ref(false)
const accordionStatus  = ref('COMPUTING PASSES…')
const accordionPasses  = ref<SatPass[]>([])
const liveTelemetry    = ref<Record<string, string>>({})
const followedNoradId  = ref<string | null>(props.satelliteControl?.followedNoradId ?? null)

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

const results = computed<SatEntry[]>(() => {
  const q = query.value.trim()
  if (!q) return satellites.value
  const matchedCat = categoryForQuery(q)
  const lq = q.toLowerCase()
  return satellites.value.filter(s =>
    s.name?.toLowerCase().includes(lq) ||
    s.norad_id.includes(lq) ||
    (matchedCat !== null && s.category === matchedCat),
  )
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
    props.satelliteControl?.switchSatellite(sat.norad_id, sat.name || sat.norad_id)
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
  const allSats = groupedResults.value.flatMap(g => g.sats)
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
    position: { alt_km: number; velocity_kms: number; track_deg: number; lat: number; lon: number }
  }>).detail
  if (noradId !== expandedNoradId.value) return
  liveTelemetry.value = {
    alt: `${position.alt_km} km`,
    vel: `${position.velocity_kms} km/s`,
    hdg: `${position.track_deg}°`,
    lat: `${position.lat}°`,
    lon: `${position.lon}°`,
  }
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

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style>
#space-filter-input-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 28px 0 16px;
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
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-accent);
    padding: 18px 28px 5px 24px;
    text-transform: uppercase;
    flex-shrink: 0;
}

.space-filter-section-label:first-child {
    padding-top: 34px;
}

.space-filter-result-item {
    display: flex;
    flex-direction: column;
    position: relative;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    cursor: pointer;
    transition: background 0.12s;
}

.space-filter-result-item:last-child {
    border-bottom: none;
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
    padding: 0 24px;
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

.sfr-acc-track-btn {
    width: 100%;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.6);
    padding: 11px 12px;
    text-transform: uppercase;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
}

.sfr-acc-track-btn:hover {
    color: var(--color-accent);
    border-color: rgba(200, 255, 0, 0.4);
    background: rgba(200, 255, 0, 0.04);
}

.sfr-acc-track-btn.sfr-acc-track-btn--active {
    color: var(--color-accent);
    border-color: var(--color-accent);
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
</style>
