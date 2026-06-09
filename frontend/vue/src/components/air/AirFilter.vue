<template>
  <div id="filter-input-wrap">
    <input
      id="filter-input"
      ref="inputRef"
      type="text"
      placeholder="CALLSIGN · ICAO · SQUAWK"
      autocomplete="off"
      spellcheck="false"
      :value="query"
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      id="filter-clear-btn"
      :class="{ 'filter-clear-visible': query.length > 0 }"
      aria-label="Clear filter"
      @click="clearInput"
    >
      ✕
    </button>
  </div>

  <div id="filter-results" ref="resultsRef">
    <template v-if="!results.length">
      <div class="filter-no-results">No results</div>
    </template>
    <template v-else>
      <!-- Aircraft section -->
      <template v-if="planes.length">
        <button
          class="filter-section-label"
          :class="{ 'filter-section-label--collapsed': collapsed.has('aircraft') }"
          @click="toggleSection('aircraft')"
        >
          <span>AIRCRAFT</span>
          <ChevronIcon
            class="filter-section-chevron"
            :class="{ 'filter-section-chevron--collapsed': collapsed.has('aircraft') }"
          />
        </button>
        <template v-if="!collapsed.has('aircraft')">
          <div
            v-for="r in planes"
            :key="r.hex"
            class="filter-result-item"
            :class="{ 'keyboard-focused': focusedKey === r.hex }"
          >
            <div
              class="filter-result-icon filter-icon-plane"
              @click="selectPlane(r)"
              v-html="PLANE_ICON"
            />
            <div class="filter-result-info" @click="selectPlane(r)">
              <div class="filter-result-primary">{{ r.callsign || r.hex }}</div>
              <div class="filter-result-secondary">{{ planeSecondary(r) }}</div>
            </div>
            <button
              class="filter-action-btn filter-bell-btn"
              :class="{ 'filter-bell-btn--active': notifEnabled.has(r.hex) }"
              aria-label="Toggle notifications"
              @mousedown.stop
              @click.stop="toggleNotif(r.hex)"
              v-html="bellSvg(r.hex)"
            />
          </div>
        </template>
      </template>

      <!-- Airports section -->
      <template v-if="airports.length">
        <button
          class="filter-section-label"
          :class="{ 'filter-section-label--collapsed': collapsed.has('airports') }"
          @click="toggleSection('airports')"
        >
          <span>AIRPORTS</span>
          <ChevronIcon
            class="filter-section-chevron"
            :class="{ 'filter-section-chevron--collapsed': collapsed.has('airports') }"
          />
        </button>
        <template v-if="!collapsed.has('airports')">
          <template v-for="r in airports" :key="r.icao">
            <div
              class="filter-result-item"
              :class="{
                'keyboard-focused': focusedKey === r.icao,
                'filter-result-item--open': expandedAirport === r.icao,
              }"
            >
              <div
                class="filter-result-icon filter-icon-airport"
                @click="toggleAirport(r)"
                v-html="AIRPORT_ICON"
              />
              <div class="filter-result-info" @click="toggleAirport(r)">
                <div class="filter-result-primary">{{ r.icao }}</div>
                <div class="filter-result-secondary">
                  {{ r.name.toUpperCase() }}{{ r.iata ? ' · ' + r.iata : '' }}
                </div>
              </div>
              <ChevronIcon
                class="filter-result-chevron"
                :class="{ 'filter-result-chevron--open': expandedAirport === r.icao }"
                @click="toggleAirport(r)"
              />
            </div>
            <!-- Inline accordion: location + clickable frequencies (matches the
             space satellite detail panel styling). -->
            <div v-if="expandedAirport === r.icao" class="apt-acc-body">
              <div class="apt-acc-section">
                <div class="apt-acc-section-title">LOCATION</div>
                <div class="apt-acc-grid apt-acc-grid--two">
                  <div class="apt-acc-cell">
                    <div class="apt-acc-cell-label">LATITUDE</div>
                    <div class="apt-acc-cell-value">{{ formatLat(r.coords[1]) }}</div>
                  </div>
                  <div class="apt-acc-cell">
                    <div class="apt-acc-cell-label">LONGITUDE</div>
                    <div class="apt-acc-cell-value">{{ formatLon(r.coords[0]) }}</div>
                  </div>
                </div>
              </div>
              <div class="apt-acc-section">
                <div class="apt-acc-section-title">FREQUENCIES</div>
                <div class="apt-acc-grid apt-acc-grid--two">
                  <button
                    v-for="f in airportFreqs(r)"
                    :key="f.label"
                    class="apt-acc-cell apt-acc-freq"
                    :title="
                      sdrConnected ? `Tune to ${f.display} ${f.mode}` : 'Connect an SDR to tune'
                    "
                    @click="tuneFreq(r, f)"
                  >
                    <div class="apt-acc-cell-label">{{ f.label.toUpperCase() }}</div>
                    <div class="apt-acc-cell-value">
                      {{ f.display }}<span class="apt-acc-cell-mode"> · {{ f.mode }}</span>
                    </div>
                  </button>
                </div>
                <div v-if="tuneNotice === r.icao" class="apt-acc-notice">
                  Connect an SDR before tuning
                </div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <!-- Military bases section -->
      <template v-if="milBases.length">
        <button
          class="filter-section-label"
          :class="{ 'filter-section-label--collapsed': collapsed.has('mil') }"
          @click="toggleSection('mil')"
        >
          <span>MILITARY BASES</span>
          <ChevronIcon
            class="filter-section-chevron"
            :class="{ 'filter-section-chevron--collapsed': collapsed.has('mil') }"
          />
        </button>
        <template v-if="!collapsed.has('mil')">
          <div
            v-for="r in milBases"
            :key="r.name"
            class="filter-result-item"
            :class="{ 'keyboard-focused': focusedKey === r.name }"
          >
            <div
              class="filter-result-icon filter-icon-mil"
              @click="selectMil(r)"
              v-html="MIL_ICON"
            />
            <div class="filter-result-info" @click="selectMil(r)">
              <div class="filter-result-primary">
                {{ r.icao || r.name.toUpperCase().slice(0, 6) }}
              </div>
              <div class="filter-result-secondary">{{ r.name.toUpperCase() }}</div>
            </div>
            <div class="filter-result-badge">MIL</div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { AIRPORTS_DATA } from './controls/airports/AirportsControl'
import { MILITARY_BASES_DATA } from './controls/military-bases/MilitaryBasesControl'
import type { AdsbLiveControl } from './controls/adsb/AdsbLiveControl'
import type { AirportsToggleControl } from './controls/airports/AirportsControl'
import type { MilitaryBasesToggleControl } from './controls/military-bases/MilitaryBasesControl'
import { useNotificationsStore } from '@/stores/notifications'
import { useAirNotifStore } from '@/stores/airNotif'
import { useSdrStore } from '@/stores/sdr'

interface PlaneResult {
  kind: 'plane'
  hex: string
  callsign: string
  reg: string
  squawk: string
  emergency: boolean
  coords: [number, number]
}
interface AirportResult {
  kind: 'airport'
  icao: string
  iata: string
  name: string
  bounds: [number, number, number, number]
  coords: [number, number]
  freqs: { tower: string; radar: string; approach: string; atis: string }
}
interface MilResult {
  kind: 'mil'
  icao: string
  name: string
  bounds: [number, number, number, number]
  coords: [number, number]
}

const props = defineProps<{
  adsbControl: AdsbLiveControl | null
  airportsControl: AirportsToggleControl | null
  militaryBasesControl: MilitaryBasesToggleControl | null
  getMap: () => import('maplibre-gl').Map | null
}>()

const notificationsStore = useNotificationsStore()
const airNotifStore = useAirNotifStore()
const sdrStore = useSdrStore()

// Which airport row is expanded (by ICAO), and which one is currently showing
// the "connect an SDR" inline notice.
const expandedAirport = ref<string | null>(null)
const tuneNotice = ref<string | null>(null)

const sdrConnected = computed(() => sdrStore.connected)

const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const query = ref('')
const focusedKey = ref<string | null>(null)

// Collapsed group headings. Sections default to expanded; a key present here is collapsed.
const collapsed = ref<Set<string>>(new Set())
// Sections collapsed by the user but force-opened by the search auto-expand. They
// re-collapse once their matches go away, unless the user manually toggles them.
const autoOpened = ref<Set<string>>(new Set())
function toggleSection(key: string): void {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
  // A manual toggle takes ownership: drop any auto-open bookkeeping for this key.
  autoOpened.value.delete(key)
}
function sectionKey(r: { kind: string }): string {
  return r.kind === 'plane' ? 'aircraft' : r.kind === 'airport' ? 'airports' : 'mil'
}

// Notification opt-in state — sourced from the persisted airNotif store.
const notifEnabled = computed(() => airNotifStore.enabledHexes)

// Aircraft data — refreshed on adsb-data-update event
const aircraftFeatures = ref<
  Array<{ properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }>
>([])

// Mirror of the map's active filter so the search list shows the same aircraft
// the map does (ALL / CIVIL / MILITARY). Refreshed alongside the feature data
// and whenever the user changes the filter mode.
const typeFilter = ref<'all' | 'civil' | 'mil'>('all')
const allHidden = ref(false)

function refreshFilterState() {
  if (props.adsbControl) {
    typeFilter.value = props.adsbControl._typeFilter
    allHidden.value = props.adsbControl._allHidden
  }
}

function refreshAircraft() {
  if (props.adsbControl?._geojson?.features) {
    aircraftFeatures.value = props.adsbControl._geojson
      .features as unknown as typeof aircraftFeatures.value
  } else {
    aircraftFeatures.value = []
  }
  refreshFilterState()
}

function onMsbTabSwitch(e: Event): void {
  const tab = (e as CustomEvent<string>).detail
  if (tab === 'search') refreshAircraft()
}

useDocumentEvent('adsb-data-update', refreshAircraft)
useDocumentEvent('msb-tab-switch', onMsbTabSwitch)
// AirSideMenu dispatches this when the map filter mode changes so the list stays in sync.
useDocumentEvent('adsb-filter-change', refreshFilterState)

// ---- Search results ----
const results = computed<Array<PlaneResult | AirportResult | MilResult>>(() => {
  const q = query.value.trim().toLowerCase()
  const out: Array<PlaneResult | AirportResult | MilResult> = []

  // Aircraft — gated by the map's active filter (ALL hides everything; CIVIL/MIL
  // restrict to planes matching the military flag, excluding ground/tower like the map).
  for (const f of aircraftFeatures.value) {
    if (allHidden.value) break
    const p = f.properties
    const category = ((p.category as string) || '').trim()
    const t = ((p.t as string) || '').trim()
    const isGnd = category === 'C1' || category === 'C2'
    const isTower = ['C3', 'C4', 'C5'].includes(category) || t === 'TWR'
    if (typeFilter.value !== 'all') {
      if (isGnd || isTower) continue
      const isMil = !!p.military
      if (typeFilter.value === 'mil' && !isMil) continue
      if (typeFilter.value === 'civil' && isMil) continue
    }
    const callsign = ((p.flight as string) || '').trim()
    const hex = ((p.hex as string) || '').trim()
    const reg = ((p.r as string) || '').trim()
    const squawk = ((p.squawk as string) || '').trim()
    if (!q || [callsign, hex, reg, squawk].some((v) => v.toLowerCase().includes(q))) {
      out.push({
        kind: 'plane',
        hex,
        callsign,
        reg,
        squawk,
        emergency: !!p.emergency && p.emergency !== 'none',
        coords: f.geometry.coordinates,
      })
    }
  }

  // Airports
  for (const f of AIRPORTS_DATA.features) {
    const p = f.properties
    if (!q || [p.icao, p.iata, p.name].some((v) => v?.toLowerCase().includes(q))) {
      out.push({
        kind: 'airport',
        icao: p.icao,
        iata: p.iata,
        name: p.name,
        bounds: p.bounds,
        coords: f.geometry.coordinates as [number, number],
        freqs: p.freqs,
      })
    }
  }

  // Military bases
  for (const f of MILITARY_BASES_DATA.features) {
    const p = f.properties
    if (!q || [p.icao, p.name].some((v) => v?.toLowerCase().includes(q))) {
      out.push({
        kind: 'mil',
        icao: p.icao,
        name: p.name,
        bounds: p.bounds,
        coords: f.geometry.coordinates as [number, number],
      })
    }
  }

  return out
})

const planes = computed(() => results.value.filter((r) => r.kind === 'plane') as PlaneResult[])
const airports = computed(
  () => results.value.filter((r) => r.kind === 'airport') as AirportResult[],
)
const milBases = computed(() => results.value.filter((r) => r.kind === 'mil') as MilResult[])

// Keep auto-expanded sections in sync with the search. A collapsed section that
// gains matches is force-opened; once its matches disappear (or the query is
// cleared) it re-collapses, so it returns to the state the user left it in.
const sectionHasMatches: Record<string, () => boolean> = {
  aircraft: () => planes.value.length > 0,
  airports: () => airports.value.length > 0,
  mil: () => milBases.value.length > 0,
}
watch([query, planes, airports, milBases], () => {
  const searching = query.value.trim().length > 0
  const collapsedNext = new Set(collapsed.value)
  let changed = false
  for (const key of Object.keys(sectionHasMatches)) {
    const shouldOpen = searching && sectionHasMatches[key]()
    if (shouldOpen && collapsedNext.has(key)) {
      collapsedNext.delete(key)
      autoOpened.value.add(key)
      changed = true
    } else if (!shouldOpen && autoOpened.value.has(key)) {
      collapsedNext.add(key)
      autoOpened.value.delete(key)
      changed = true
    }
  }
  if (changed) collapsed.value = collapsedNext
})

// ---- SVG icons ----
const PLANE_ICON = `<svg width="11" height="11" viewBox="0 0 56 52" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="28,18 35,36 28,33 21,36" fill="currentColor"/></svg>`
const AIRPORT_ICON = `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/><line x1="6.5" y1="2" x2="6.5" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="2" y1="6.5" x2="11" y2="6.5" stroke="currentColor" stroke-width="1.2"/></svg>`
const MIL_ICON = `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="6.5,1.5 12,11.5 1,11.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`

function bellSvg(hex: string): string {
  const on = notifEnabled.value.has(hex)
  return (
    `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>` +
    `<path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>` +
    (on
      ? ''
      : `<line x1="1.5" y1="1.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>`) +
    `</svg>`
  )
}

function planeSecondary(r: PlaneResult): string {
  const parts: string[] = []
  if (r.hex) parts.push(r.hex.toUpperCase())
  if (r.reg) parts.push(r.reg)
  if (r.squawk) parts.push('SQK ' + r.squawk)
  return parts.join(' · ')
}

// ---- Input handlers ----
function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
  focusedKey.value = null
}

function clearInput() {
  query.value = ''
  focusedKey.value = null
  inputRef.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    query.value = ''
    return
  }

  const allItems = results.value.filter((r) => !collapsed.value.has(sectionKey(r)))
  if (!allItems.length) return

  const keys = allItems.map((r) =>
    r.kind === 'plane' ? r.hex : r.kind === 'airport' ? r.icao : r.name,
  )
  const idx = focusedKey.value ? keys.indexOf(focusedKey.value) : -1

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusedKey.value = keys[idx + 1] ?? keys[0]
    scrollToFocused()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusedKey.value = idx > 0 ? keys[idx - 1] : null
    if (focusedKey.value) scrollToFocused()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const focused = allItems[idx]
    if (focused) {
      activateResult(focused)
      inputRef.value?.focus()
    } else {
      focusedKey.value = keys[0]
      scrollToFocused()
    }
  }
}

function scrollToFocused() {
  if (!resultsRef.value || !focusedKey.value) return
  // requestAnimationFrame to let Vue render the class change first
  requestAnimationFrame(() => {
    const el = resultsRef.value?.querySelector('.keyboard-focused') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function activateResult(r: PlaneResult | AirportResult | MilResult) {
  if (r.kind === 'plane') selectPlane(r)
  if (r.kind === 'airport') toggleAirport(r)
  if (r.kind === 'mil') selectMil(r)
}

// ---- Selection actions ----
function selectPlane(r: PlaneResult) {
  const c = props.adsbControl
  if (!c) return
  const coords = c._interpolatedCoords(r.hex) ?? r.coords
  const m = props.getMap()
  if (m) m.easeTo({ center: coords, zoom: Math.max(m.getZoom(), 10), duration: 600 })
}

function fitBoundsWithPadding(bounds: [number, number, number, number]) {
  const m = props.getMap()
  if (!m) return
  const ctrlPanel = document.querySelector('.maplibregl-ctrl-top-right') as HTMLElement | null
  const ctrlW = ctrlPanel ? ctrlPanel.offsetWidth : 0
  const ctrlH = ctrlPanel ? ctrlPanel.offsetHeight : 0
  const pad = 80
  const topExtra = Math.max(0, ctrlH / 2 - pad)
  m.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      padding: { top: pad + topExtra, bottom: pad, left: pad, right: pad + ctrlW },
      maxZoom: 13,
      duration: 800,
    },
  )
}

// Clicking an airport row both navigates the map to it and expands/collapses
// the inline accordion of frequencies.
function toggleAirport(r: AirportResult) {
  if (expandedAirport.value === r.icao) {
    expandedAirport.value = null
    return
  }
  expandedAirport.value = r.icao
  tuneNotice.value = null
  fitBoundsWithPadding(r.bounds)
}

interface AirportFreq {
  label: string
  display: string
  mode: 'AM'
  hz: number
}

// All airband voice/ATIS channels are AM. A stored value may hold more than one
// frequency ("118.500 / 118.700"); the first is the primary we tune to.
function airportFreqs(r: AirportResult): AirportFreq[] {
  const defs: [string, string][] = [
    ['Tower', r.freqs.tower],
    ['Radar', r.freqs.radar],
    ['Approach', r.freqs.approach],
    ['ATIS', r.freqs.atis],
  ]
  const out: AirportFreq[] = []
  for (const [label, raw] of defs) {
    const first = (raw || '').split('/')[0].trim()
    const mhz = parseFloat(first)
    if (isNaN(mhz) || mhz <= 0) continue
    out.push({ label, display: raw.trim(), mode: 'AM', hz: Math.round(mhz * 1e6) })
  }
  return out
}

function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`
}
function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
}

// Tune the connected SDR to a clicked frequency. If no radio is connected, show
// a subtle inline notice instead of attempting to tune.
function tuneFreq(r: AirportResult, f: AirportFreq) {
  if (!sdrStore.connected) {
    tuneNotice.value = r.icao
    return
  }
  tuneNotice.value = null
  document.dispatchEvent(
    new CustomEvent('sentinel:sdr-tune-external', {
      detail: { hz: f.hz, mode: f.mode, satName: `${r.name} ${f.label}` },
    }),
  )
  notificationsStore.add({
    type: 'system',
    title: `${r.icao} ${f.label.toUpperCase()}`,
    detail: `Tuned ${f.display} ${f.mode}`,
  })
}

function selectMil(r: MilResult) {
  fitBoundsWithPadding(r.bounds)
}

// ---- Notifications (bell button) ----
function toggleNotif(hex: string) {
  const c = props.adsbControl
  if (c && !c._trackingNotifIds) c._trackingNotifIds = {}
  const matchedFeature = c
    ? (c._geojson.features as unknown as Array<{ properties: Record<string, unknown> }>).find(
        (f) => (f.properties.hex as string) === hex,
      )
    : undefined
  const callsign = matchedFeature
    ? ((matchedFeature.properties.flight as string) || '').trim() ||
      ((matchedFeature.properties.r as string) || '').trim() ||
      hex
    : airNotifStore.callsignFor(hex)
  const wasOn = airNotifStore.isEnabled(hex)
  if (wasOn) {
    airNotifStore.disable(hex)
    if (c?._trackingNotifIds?.[hex]) {
      notificationsStore.dismiss(c._trackingNotifIds[hex])
      delete c._trackingNotifIds[hex]
    }
    notificationsStore.add({ type: 'notif-off', title: callsign })
  } else {
    airNotifStore.enable(hex, callsign)
    if (c) {
      if (c._trackingNotifIds![hex]) notificationsStore.dismiss(c._trackingNotifIds![hex])
      c._trackingNotifIds![hex] = notificationsStore.add({
        type: 'tracking',
        title: callsign,
        action: {
          label: 'DISABLE NOTIFICATIONS',
          callback: () => {
            airNotifStore.disable(hex)
            if (c._trackingNotifIds) delete c._trackingNotifIds[hex]
            c._rebuildTagForHex(hex)
          },
        },
      })
    } else {
      notificationsStore.add({ type: 'tracking', title: callsign })
    }
  }
  c?._rebuildTagForHex(hex)
}

// Refresh aircraft data when adsbControl becomes available.
watch(
  () => props.adsbControl,
  (ctrl) => {
    if (ctrl) refreshAircraft()
  },
  { immediate: true },
)

onMounted(refreshAircraft)

// Expand a specific airport's accordion by ICAO (driven by a map marker click)
// and scroll it into view. Clears any active search so the row is in the list.
function expandAirport(icao: string) {
  const r = AIRPORTS_DATA.features.find((f) => f.properties.icao === icao)
  if (!r) return
  query.value = ''
  // Make sure the airports section isn't collapsed.
  if (collapsed.value.has('airports')) {
    const next = new Set(collapsed.value)
    next.delete('airports')
    collapsed.value = next
  }
  expandedAirport.value = icao
  tuneNotice.value = null
  requestAnimationFrame(() => {
    const el = resultsRef.value?.querySelector('.filter-result-item--open') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Expose focus method for keyboard shortcut
defineExpose({
  focus: () => inputRef.value?.focus(),
  expandAirport,
})
</script>

<style>
#filter-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 20px 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

#filter-icon {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.35);
  display: block;
}

#filter-input {
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

#filter-input::placeholder {
  color: rgba(255, 255, 255, 0.2);
  font-size: 11px;
  letter-spacing: 0.14em;
}

#filter-clear-btn {
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

#filter-clear-btn.filter-clear-visible {
  display: block;
}

#filter-clear-btn:hover {
  color: var(--color-text-muted);
}

#filter-results {
  max-height: 340px;
  overflow-y: auto;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

#filter-results::-webkit-scrollbar {
  display: none;
}

.filter-section-label {
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
  transition: opacity 0.12s;
}

.filter-section-label:hover {
  opacity: 0.8;
}

.filter-section-label:first-child {
  padding-top: 24px;
}

.filter-section-chevron {
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

/* Match the per-item chevron convention: down when expanded, left when collapsed. */
.filter-section-chevron--collapsed {
  transform: rotate(-90deg);
}

.filter-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 20px 13px 24px;
  border-bottom: none;
  transition: background 0.12s;
}

.filter-result-item:last-child {
  border-bottom: none;
}

.filter-result-item:hover,
.filter-result-item.keyboard-focused {
  background: rgba(255, 255, 255, 0.06);
}

.filter-result-item.keyboard-focused {
  outline: 1px solid rgba(200, 255, 0, 0.4);
  outline-offset: -1px;
}

.filter-result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  cursor: pointer;
}

.filter-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  /* Right padding 0 so the bell icon lines up with the group-heading chevron
       (both ~20px from the row edge); extra hit area kept on the left. */
  padding: 6px 0 6px 12px;
  margin-right: -1px;
  flex-shrink: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
  transition: color 0.15s;
}

.filter-action-btn:hover {
  color: #fff !important;
}

.filter-bell-btn.filter-bell-btn--active {
  color: #c8ff00;
}

.filter-bell-btn.filter-bell-btn--active:hover {
  color: #c8ff00 !important;
}

.filter-track-btn {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
  padding: 6px 0;
}

.filter-result-icon {
  display: none;
  cursor: pointer;
}

.filter-result-icon.filter-icon-plane {
  color: #ffffff;
}

.filter-result-icon.filter-icon-airport {
  color: var(--color-accent);
}

.filter-result-icon.filter-icon-mil {
  color: rgba(200, 255, 0, 0.5);
}

.filter-result-primary {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #fff;
  flex-shrink: 0;
}

.filter-result-secondary {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-result-badge {
  margin-left: auto;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
}

.filter-result-badge.filter-badge-emrg {
  color: #ff4040;
}

/* ---- Airport row chevron + inline accordion ---- */
.filter-result-chevron {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    color 0.15s;
}

.filter-result-item:hover .filter-result-chevron {
  color: rgba(255, 255, 255, 0.55);
}

/* Down when open, left when closed — matches the section-heading convention. */
.filter-result-chevron:not(.filter-result-chevron--open) {
  transform: rotate(-90deg);
}

.filter-result-item--open {
  background: rgba(255, 255, 255, 0.04);
}

/* Airport accordion body — matches the space satellite detail panel. The same
   lighter-grey tint as the open row carries through the content so the whole
   expanded block reads as one block (the sat row wraps header + body in a single
   tinted container; here they are siblings, so the body repeats the tint). */
.apt-acc-body {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.04);
  /* Close the 1px #filter-results flex gap between the open row and the body so
       no dark seam shows; both share the same tint and read as one block. */
  margin-top: -1px;
  /* Extra breathing room before the next airport in the list. */
  padding-bottom: 12px;
  animation: apt-acc-expand 0.18s ease;
}

@keyframes apt-acc-expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.apt-acc-section {
  padding: 14px 24px 12px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.apt-acc-section-title {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--color-accent);
  text-transform: uppercase;
}

.apt-acc-grid {
  display: grid;
  column-gap: 16px;
  row-gap: 12px;
}

.apt-acc-grid--two {
  grid-template-columns: 1fr 1fr;
}

.apt-acc-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.apt-acc-cell-label {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
}

.apt-acc-cell-value {
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.apt-acc-cell-mode {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 400;
  margin-left: 2px;
}

/* Frequency cells are tunable buttons. */
.apt-acc-freq {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: opacity 0.12s;
}

.apt-acc-freq:hover {
  opacity: 0.7;
}

.apt-acc-notice {
  margin-top: 2px;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
}

.filter-no-results {
  padding: 20px 18px;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.25);
  text-align: center;
  text-transform: uppercase;
}
</style>
