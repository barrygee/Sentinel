<template>
  <div id="filter-input-wrap">
    <input
      id="filter-input"
      ref="inputRef"
      type="text"
      role="combobox"
      aria-label="Filter aircraft by callsign, ICAO or squawk"
      aria-autocomplete="list"
      :aria-expanded="listboxShown"
      :aria-controls="listboxShown ? 'filter-listbox' : undefined"
      :aria-activedescendant="activeDescId"
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
    <!-- The listbox is an empty structural element that OWNS the option rows
         below via aria-owns. The rows can't sit *inside* it because each row
         carries non-option chrome (section header buttons, the per-row bell
         button) that a listbox/option subtree may not contain — aria-owns lets
         the combobox expose them as options while keeping that chrome valid. -->
    <div
      v-if="listboxShown"
      id="filter-listbox"
      role="listbox"
      aria-label="Aircraft, airports and military bases"
      :aria-owns="ownedOptionIds"
    ></div>

    <div class="filter-results-body">
      <template v-if="!results.length">
        <div class="filter-no-results">No results</div>
      </template>
      <template v-else>
        <!-- Aircraft section -->
        <div v-if="displayPlanes.length" class="filter-result-group">
          <button
            class="filter-section-label"
            :class="{ 'filter-section-label--collapsed': collapsed.has('aircraft') }"
            :aria-expanded="!collapsed.has('aircraft')"
            @click="toggleSection('aircraft')"
          >
            <span>AIRCRAFT</span>
            <ChevronIcon
              class="filter-section-chevron"
              :class="{ 'filter-section-chevron--collapsed': collapsed.has('aircraft') }"
            />
          </button>
          <template v-if="!collapsed.has('aircraft')">
            <template v-for="(r, index) in displayPlanes" :key="r.hex">
              <div
                class="filter-result-item"
                :class="{
                  'keyboard-focused': focusedKey === r.hex,
                  'filter-result-item--open': expandedPlane === r.hex,
                  'filter-result-item--emergency': r.emergency,
                }"
              >
                <div
                  :id="`filter-opt-plane-${index}`"
                  role="option"
                  :aria-selected="focusedKey === r.hex"
                  :aria-label="planeOptionLabel(r)"
                  class="filter-result-option"
                  @click="selectPlane(r)"
                >
                  <div class="filter-result-icon filter-icon-plane">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 56 52"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <polygon points="28,18 35,36 28,33 21,36" fill="currentColor" />
                    </svg>
                  </div>
                  <div class="filter-result-info">
                    <div class="filter-result-primary">{{ r.callsign || r.hex }}</div>
                    <div class="filter-result-secondary">{{ planeSecondary(r) }}</div>
                  </div>
                  <ChevronIcon
                    class="filter-result-chevron"
                    :class="{ 'filter-result-chevron--open': expandedPlane === r.hex }"
                  />
                </div>
              </div>
              <!-- Inline accordion of live telemetry + controls. Sits outside the
                   option (like the airport accordion) so its buttons aren't nested
                   inside a listbox option. Data re-renders each ADS-B poll. -->
              <div
                v-if="expandedPlane === r.hex"
                class="apt-acc-body acft-acc-body"
                :class="{
                  'acft-acc-body--stale': signalLost,
                  'acft-acc-body--emergency': r.emergency,
                }"
              >
                <div v-if="signalLost" class="acft-acc-signal-lost" role="status">SIGNAL LOST</div>
                <div class="apt-acc-section">
                  <div class="apt-acc-section-title">POSITION</div>
                  <div class="apt-acc-grid apt-acc-grid--three">
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">LATITUDE</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.lat }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">LONGITUDE</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.lon }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">HEADING</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.hdg }}</div>
                    </div>
                  </div>
                </div>
                <div class="apt-acc-section">
                  <div class="apt-acc-grid apt-acc-grid--three">
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">ALTITUDE</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.alt }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">SPEED</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.spd }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">VERTICAL</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.vrate }}</div>
                    </div>
                  </div>
                </div>
                <div class="apt-acc-section">
                  <div class="apt-acc-section-title">IDENTIFICATION</div>
                  <div class="apt-acc-grid apt-acc-grid--two">
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">TYPE</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.type }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">REGISTRATION</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.reg }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">CATEGORY</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.category }}</div>
                    </div>
                    <div class="apt-acc-cell">
                      <div class="apt-acc-cell-label">SQUAWK</div>
                      <div class="apt-acc-cell-value">{{ liveAircraftData.squawk }}</div>
                    </div>
                  </div>
                </div>
                <div class="apt-acc-section acft-acc-action-section">
                  <div class="acft-acc-action-row">
                    <button
                      class="acft-acc-btn"
                      :class="{ 'acft-acc-btn--active': followedHex === r.hex }"
                      :aria-label="followedHex === r.hex ? 'Untrack aircraft' : 'Track aircraft'"
                      :data-tooltip="followedHex === r.hex ? 'Untrack aircraft' : 'Track aircraft'"
                      @click.stop="toggleTrack(r.hex)"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linejoin="round"
                          fill="none"
                        />
                        <circle cx="12" cy="9" r="2.2" fill="currentColor" />
                      </svg>
                    </button>
                    <button
                      class="acft-acc-btn"
                      :class="{ 'acft-acc-btn--active': notifEnabled.has(r.hex) }"
                      :aria-label="
                        notifEnabled.has(r.hex) ? 'Disable notifications' : 'Enable notifications'
                      "
                      :data-tooltip="
                        notifEnabled.has(r.hex) ? 'Disable notifications' : 'Enable notifications'
                      "
                      @click.stop="toggleNotif(r.hex)"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 13 13"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z"
                          fill="currentColor"
                        />
                        <path
                          d="M5 10.5a1.5 1.5 0 0 0 3 0"
                          stroke="currentColor"
                          stroke-width="1"
                          fill="none"
                        />
                        <!-- Strike-through shown when notifications for this aircraft are off. -->
                        <line
                          v-if="!notifEnabled.has(r.hex)"
                          x1="1.5"
                          y1="1.5"
                          x2="11.5"
                          y2="11.5"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="square"
                        />
                      </svg>
                    </button>
                    <button
                      class="acft-acc-btn"
                      aria-label="Centre on map"
                      data-tooltip="Centre on map"
                      @click.stop="centrePlane(r)"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="4"
                          stroke="currentColor"
                          stroke-width="1.8"
                          fill="none"
                        />
                        <line
                          x1="12"
                          y1="2"
                          x2="12"
                          y2="6"
                          stroke="currentColor"
                          stroke-width="1.8"
                        />
                        <line
                          x1="12"
                          y1="18"
                          x2="12"
                          y2="22"
                          stroke="currentColor"
                          stroke-width="1.8"
                        />
                        <line
                          x1="2"
                          y1="12"
                          x2="6"
                          y2="12"
                          stroke="currentColor"
                          stroke-width="1.8"
                        />
                        <line
                          x1="18"
                          y1="12"
                          x2="22"
                          y2="12"
                          stroke="currentColor"
                          stroke-width="1.8"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>

        <!-- Airports section -->
        <div v-if="airports.length" class="filter-result-group">
          <button
            class="filter-section-label"
            :class="{ 'filter-section-label--collapsed': collapsed.has('airports') }"
            :aria-expanded="!collapsed.has('airports')"
            @click="toggleSection('airports')"
          >
            <span>AIRPORTS</span>
            <ChevronIcon
              class="filter-section-chevron"
              :class="{ 'filter-section-chevron--collapsed': collapsed.has('airports') }"
            />
          </button>
          <template v-if="!collapsed.has('airports')">
            <template v-for="(r, index) in airports" :key="r.icao">
              <div
                class="filter-result-item"
                :class="{
                  'keyboard-focused': focusedKey === r.icao,
                  'filter-result-item--open': expandedAirport === r.icao,
                }"
              >
                <div
                  :id="`filter-opt-airport-${index}`"
                  role="option"
                  :aria-selected="focusedKey === r.icao"
                  :aria-label="airportOptionLabel(r)"
                  class="filter-result-option"
                  @click="toggleAirport(r)"
                >
                  <div class="filter-result-icon filter-icon-airport">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 13 13"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4" />
                      <line
                        x1="6.5"
                        y1="2"
                        x2="6.5"
                        y2="11"
                        stroke="currentColor"
                        stroke-width="1.2"
                      />
                      <line
                        x1="2"
                        y1="6.5"
                        x2="11"
                        y2="6.5"
                        stroke="currentColor"
                        stroke-width="1.2"
                      />
                    </svg>
                  </div>
                  <div class="filter-result-info">
                    <div class="filter-result-primary">{{ r.icao }}</div>
                    <div class="filter-result-secondary">
                      {{ r.name.toUpperCase() }}{{ r.iata ? ' · ' + r.iata : '' }}
                    </div>
                  </div>
                  <ChevronIcon
                    class="filter-result-chevron"
                    :class="{ 'filter-result-chevron--open': expandedAirport === r.icao }"
                  />
                </div>
              </div>
              <!-- Inline accordion: location + clickable frequencies (matches the
               space satellite detail panel styling). Sits outside the option so
               its tunable frequency buttons aren't nested inside a listbox option. -->
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
        </div>

        <!-- Military bases section -->
        <div v-if="milBases.length" class="filter-result-group">
          <button
            class="filter-section-label"
            :class="{ 'filter-section-label--collapsed': collapsed.has('mil') }"
            :aria-expanded="!collapsed.has('mil')"
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
              v-for="(r, index) in milBases"
              :key="r.name"
              class="filter-result-item"
              :class="{ 'keyboard-focused': focusedKey === r.name }"
            >
              <div
                :id="`filter-opt-mil-${index}`"
                role="option"
                :aria-selected="focusedKey === r.name"
                :aria-label="milOptionLabel(r)"
                class="filter-result-option"
                @click="selectMil(r)"
              >
                <div class="filter-result-icon filter-icon-mil">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 13 13"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polygon
                      points="6.5,1.5 12,11.5 1,11.5"
                      stroke="currentColor"
                      stroke-width="1.3"
                      fill="none"
                    />
                  </svg>
                </div>
                <div class="filter-result-info">
                  <div class="filter-result-primary">
                    {{ r.icao || r.name.toUpperCase().slice(0, 6) }}
                  </div>
                  <div class="filter-result-secondary">{{ r.name.toUpperCase() }}</div>
                </div>
                <div class="filter-result-badge">MIL</div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { AIRPORTS_DATA } from './controls/airports/AirportsControl'
import { MILITARY_BASES_DATA } from './controls/military-bases/MilitaryBasesControl'
import type { AdsbLiveControl } from './controls/adsb/AdsbLiveControl'
import type { AirportsToggleControl } from './controls/airports/AirportsControl'
import type { MilitaryBasesToggleControl } from './controls/military-bases/MilitaryBasesControl'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/stores/notifications'
import { useAirNotifStore } from '@/stores/airNotif'
import { useSdrStore } from '@/stores/sdr'
import { useAirStore } from '@/stores/air'

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
const airStore = useAirStore()

// Which airport row is expanded (by ICAO), and which one is currently showing
// the "connect an SDR" inline notice.
const expandedAirport = ref<string | null>(null)
const tuneNotice = ref<string | null>(null)

// Live telemetry shown in an expanded aircraft row's accordion. The formatted
// snapshot is held separately from the raw feed so that when the aircraft drops
// out of coverage we can keep showing its last-known values (dimmed) and flag
// the dropout, rather than blanking the panel.
interface AircraftLiveData {
  lat: string
  lon: string
  hdg: string
  alt: string
  spd: string
  vrate: string
  type: string
  reg: string
  category: string
  squawk: string
}
// Placeholder shown for any field with no live value (em dashes throughout).
const EMPTY_AIRCRAFT_DATA: AircraftLiveData = {
  lat: '—',
  lon: '—',
  hdg: '—',
  alt: '—',
  spd: '—',
  vrate: '—',
  type: '—',
  reg: '—',
  category: '—',
  squawk: '—',
}
// Hex of the aircraft whose accordion is expanded (null when none), and its
// last-known search-result snapshot — both backed by the persisted air store so
// the selection is restored when returning to Air from another section. The
// snapshot keeps the row (and accordion) rendered if the aircraft briefly leaves
// the live list, and lets the restored row render before the feed repopulates.
const { searchExpandedPlane } = storeToRefs(airStore)
const expandedPlane = computed<string | null>({
  get: () => searchExpandedPlane.value.hex || null,
  set: (value) => {
    searchExpandedPlane.value = { ...searchExpandedPlane.value, hex: value ?? '' }
  },
})
const expandedPlaneSnapshot = computed<PlaneResult | null>({
  get: () => searchExpandedPlane.value.snapshot,
  set: (value) => {
    searchExpandedPlane.value = { ...searchExpandedPlane.value, snapshot: value }
  },
})
// Always a full object (placeholder when nothing is expanded) so the template
// reads fields directly without null-guards.
const liveAircraftData = ref<AircraftLiveData>({ ...EMPTY_AIRCRAFT_DATA })
// True when the expanded aircraft has dropped out of the live feed.
const signalLost = ref(false)
// Once an expanded aircraft drops out of the feed we show SIGNAL LOST for a short
// grace window — long enough to ride out a brief dropout — then remove the row so
// a permanently-lost aircraft doesn't linger at the end of the list forever.
const SIGNAL_LOST_GRACE_MS = 15000
let signalLostTimer: ReturnType<typeof setTimeout> | null = null

function clearSignalLostTimer() {
  if (signalLostTimer !== null) {
    clearTimeout(signalLostTimer)
    signalLostTimer = null
  }
}

const sdrConnected = computed(() => sdrStore.connected)

const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const query = ref('')
const focusedKey = ref<string | null>(null)

// Collapsed group headings (persisted on the air store; a key present here is
// collapsed). Groups default to collapsed on first ever mount — see the seed in
// onMounted below. The search watcher auto-opens a section while it has matches,
// then re-collapses it once the query is cleared.
const { searchCollapsedGroups: collapsed, searchGroupsCollapsedSeeded: collapsedSeeded } =
  storeToRefs(airStore)
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

// Hex of the aircraft the map is currently following, or null. The control is a
// plain (non-reactive) class, so this mirror is refreshed from it on every data
// update and updated optimistically when the track button is clicked.
const followedHex = ref<string | null>(null)

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
    followedHex.value = props.adsbControl._followEnabled ? props.adsbControl._selectedHex : null
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
  refreshExpandedPlane()
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
  const planeResults: PlaneResult[] = []
  for (const f of aircraftFeatures.value) {
    if (allHidden.value) break
    const p = f.properties
    const category = ((p.category as string) || '').trim()
    const t = ((p.t as string) || '').trim()
    // The list shows only aircraft — never ground vehicles (C1/C2) or
    // tower/static emitters (C3-C5, TWR), regardless of the ALL/CIVIL/MIL filter.
    const isGnd = category === 'C1' || category === 'C2'
    const isTower = ['C3', 'C4', 'C5'].includes(category) || t === 'TWR'
    if (isGnd || isTower) continue
    if (typeFilter.value !== 'all') {
      const isMil = !!p.military
      if (typeFilter.value === 'mil' && !isMil) continue
      if (typeFilter.value === 'civil' && isMil) continue
    }
    const callsign = ((p.flight as string) || '').trim()
    const hex = ((p.hex as string) || '').trim()
    const reg = ((p.r as string) || '').trim()
    const squawk = ((p.squawk as string) || '').trim()
    if (!q || [callsign, hex, reg, squawk].some((v) => v.toLowerCase().includes(q))) {
      planeResults.push({
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
  // Stable ordering so rows keep their place as the feed reorders/repopulates
  // each poll — otherwise an open accordion would jump around as aircraft come
  // and go.
  planeResults.sort(comparePlanes)
  out.push(...planeResults)

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

// Row ordering: by callsign (falling back to the immutable hex when an aircraft
// has not broadcast one yet), then hex as a stable tie-break.
function comparePlanes(first: PlaneResult, second: PlaneResult): number {
  return (
    (first.callsign || first.hex).localeCompare(second.callsign || second.hex) ||
    first.hex.localeCompare(second.hex)
  )
}

const planes = computed(() => results.value.filter((r) => r.kind === 'plane') as PlaneResult[])

// The aircraft rows actually rendered. The expanded (selected) aircraft is
// pinned to the top so its open accordion never moves as the rest of the list
// reorders/repopulates each poll. The pinned row uses its live data when still
// in the feed, or the last-known snapshot when it has briefly dropped out (so it
// stays visible while SIGNAL LOST shows). All other aircraft follow in sort order.
const displayPlanes = computed<PlaneResult[]>(() => {
  const live = planes.value
  const snapshot = expandedPlaneSnapshot.value
  if (!snapshot) return live
  const pinned = live.find((r) => r.hex === snapshot.hex) ?? snapshot
  return [pinned, ...live.filter((r) => r.hex !== snapshot.hex)]
})
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

function planeSecondary(r: PlaneResult): string {
  const parts: string[] = []
  if (r.hex) parts.push(r.hex.toUpperCase())
  if (r.reg) parts.push(r.reg)
  if (r.squawk) parts.push('SQK ' + r.squawk)
  return parts.join(' · ')
}

// ---- Listbox option accessible names ----
// Each result row is a role="option"; an explicit aria-label gives it a clean,
// stable accessible name (otherwise the name would absorb the nested bell button
// and, for airports, the whole expanded accordion). Expandable rows (airports)
// also announce their open/closed state, since an option cannot carry
// aria-expanded.
function planeOptionLabel(r: PlaneResult): string {
  const secondary = planeSecondary(r)
  const primary = r.callsign || r.hex
  return secondary ? `${primary}, ${secondary}` : primary
}
function airportOptionLabel(r: AirportResult): string {
  const iata = r.iata ? ` ${r.iata}` : ''
  const state = expandedAirport.value === r.icao ? 'expanded' : 'collapsed'
  return `${r.icao}, ${r.name.toUpperCase()}${iata}, ${state}`
}
function milOptionLabel(r: MilResult): string {
  const primary = r.icao || r.name.toUpperCase().slice(0, 6)
  return `${primary}, ${r.name.toUpperCase()}`
}

// Space-separated ids of every option row currently rendered (a collapsed
// section renders none), in visual order. The listbox claims these as its
// children via aria-owns — they live outside it in the DOM so the section/bell
// chrome around them stays valid.
const ownedOptionIds = computed<string>(() => {
  const ids: string[] = []
  if (!collapsed.value.has('aircraft'))
    displayPlanes.value.forEach((_r, index) => ids.push(`filter-opt-plane-${index}`))
  if (!collapsed.value.has('airports'))
    airports.value.forEach((_r, index) => ids.push(`filter-opt-airport-${index}`))
  if (!collapsed.value.has('mil'))
    milBases.value.forEach((_r, index) => ids.push(`filter-opt-mil-${index}`))
  return ids.join(' ')
})

// The combobox popup (listbox) is only present when at least one option is
// actually rendered — an empty listbox would fail aria-required-children, and a
// combobox with no visible options should report aria-expanded=false.
const listboxShown = computed<boolean>(() => ownedOptionIds.value.length > 0)

// The id of the option the search input is virtually focused on (roving keyboard
// nav), exposed to assistive tech via aria-activedescendant on the combobox.
// Returns undefined when nothing is focused or the focused key is no longer in
// the rendered results.
const activeDescId = computed<string | undefined>(() => {
  const key = focusedKey.value
  if (!key) return undefined
  // Collapsed sections render no option rows, so never point activedescendant at
  // one — that would be a dangling IDREF.
  if (!collapsed.value.has('aircraft')) {
    const planeIdx = displayPlanes.value.findIndex((r) => r.hex === key)
    if (planeIdx >= 0) return `filter-opt-plane-${planeIdx}`
  }
  if (!collapsed.value.has('airports')) {
    const airportIdx = airports.value.findIndex((r) => r.icao === key)
    if (airportIdx >= 0) return `filter-opt-airport-${airportIdx}`
  }
  if (!collapsed.value.has('mil')) {
    const milIdx = milBases.value.findIndex((r) => r.name === key)
    if (milIdx >= 0) return `filter-opt-mil-${milIdx}`
  }
  return undefined
})

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
  /* v8 ignore start -- defensive: resultsRef is always bound and every caller
     sets focusedKey before invoking, so this guard is never the path taken. */
  if (!resultsRef.value || !focusedKey.value) return
  /* v8 ignore stop */
  // requestAnimationFrame to let Vue render the class change first
  requestAnimationFrame(() => {
    const el = resultsRef.value?.querySelector('.keyboard-focused') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Scroll the currently-open accordion row into view. The expanded aircraft is
// pinned to the top of the list, so when a row deep in a scrolled list is opened
// the list jumps back up to reveal it (otherwise the accordion opens off-screen
// and it looks like nothing happened).
function scrollOpenRowIntoView() {
  requestAnimationFrame(() => {
    const el = resultsRef.value?.querySelector('.filter-result-item--open') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function activateResult(r: PlaneResult | AirportResult | MilResult) {
  if (r.kind === 'plane') selectPlane(r)
  if (r.kind === 'airport') toggleAirport(r)
  if (r.kind === 'mil') selectMil(r)
}

// ---- Selection actions ----
// Clicking a plane row toggles its live-telemetry accordion and, on open,
// centres the map on the aircraft (matching the airport rows' behaviour).
function selectPlane(r: PlaneResult) {
  if (expandedPlane.value === r.hex) {
    expandedPlane.value = null
    refreshExpandedPlane()
    return
  }
  expandedPlane.value = r.hex
  // Capture the clicked row so it stays rendered (with last-known telemetry) if
  // the aircraft later drops out of the live list.
  expandedPlaneSnapshot.value = r
  refreshExpandedPlane()
  centrePlane(r)
  // The row is now pinned to the top — bring it (and its accordion) into view.
  scrollOpenRowIntoView()
}

// Ease the map to an aircraft, preferring the control's interpolated position
// over the (older) snapshot coordinates from the search result.
function centrePlane(r: PlaneResult) {
  const c = props.adsbControl
  if (!c) return
  const coords = c._interpolatedCoords(r.hex) ?? r.coords
  const m = props.getMap()
  if (m) m.easeTo({ center: coords, zoom: Math.max(m.getZoom(), 10), duration: 600 })
}

// Locate the live feature for a hex in the current ADS-B snapshot.
function findAircraftFeature(hex: string) {
  return aircraftFeatures.value.find((f) => f.properties.hex === hex)
}

// Format an aircraft's raw properties into the labelled values the accordion
// shows. Missing/zero numeric fields render as an em dash rather than "0".
function formatAircraftLiveData(feature: {
  properties: Record<string, unknown>
  geometry: { coordinates: [number, number] }
}): AircraftLiveData {
  const p = feature.properties
  const [lon, lat] = feature.geometry.coordinates
  return {
    lat: formatLat(lat),
    lon: formatLon(lon),
    hdg: formatHeading(p.track),
    alt: formatAltitude(p.alt_baro),
    spd: formatSpeed(p.gs),
    vrate: formatVerticalRate(p.baro_rate),
    type: ((p.t as string) || '').trim() || '—',
    reg: ((p.r as string) || '').trim() || '—',
    category: ((p.category as string) || '').trim() || '—',
    squawk: ((p.squawk as string) || '').trim() || '—',
  }
}

// Refresh the expanded aircraft's telemetry from the latest feed. Keeps the last
// known values and flags SIGNAL LOST when the aircraft is no longer present.
function refreshExpandedPlane() {
  const hex = expandedPlane.value
  if (!hex) {
    liveAircraftData.value = { ...EMPTY_AIRCRAFT_DATA }
    expandedPlaneSnapshot.value = null
    signalLost.value = false
    clearSignalLostTimer()
    return
  }
  const feature = findAircraftFeature(hex)
  signalLost.value = !feature
  if (feature) {
    // Live again: refresh values and cancel any pending removal.
    liveAircraftData.value = formatAircraftLiveData(feature)
    clearSignalLostTimer()
  } else if (signalLostTimer === null) {
    // Just dropped out: keep the last-known values, and schedule removal of the
    // row if the aircraft doesn't return within the grace window.
    signalLostTimer = setTimeout(() => {
      signalLostTimer = null
      expandedPlane.value = null
      refreshExpandedPlane()
    }, SIGNAL_LOST_GRACE_MS)
  }
}

onUnmounted(clearSignalLostTimer)

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

// Coerce a feed value to a finite number, or null when absent/non-numeric.
function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatHeading(track: unknown): string {
  const value = asFiniteNumber(track)
  return value === null ? '—' : `${Math.round(value)}°`
}

function formatAltitude(altBaro: unknown): string {
  const value = asFiniteNumber(altBaro)
  if (value === null) return '—'
  // alt_baro of 0 (or below) means on/near the ground in the ADS-B feed.
  return value <= 0 ? 'GND' : `${Math.round(value).toLocaleString('en-US')} ft`
}

function formatSpeed(groundSpeed: unknown): string {
  const value = asFiniteNumber(groundSpeed)
  return value === null ? '—' : `${Math.round(value)} kt`
}

function formatVerticalRate(baroRate: unknown): string {
  const value = asFiniteNumber(baroRate)
  if (value === null) return '—'
  const rounded = Math.round(value)
  // Show an explicit + for climbs so the sign reads at a glance.
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toLocaleString('en-US')} fpm`
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

// ---- Tracking (track button) ----
// Toggle following the aircraft on the map. Delegates to the live control, then
// mirrors the resulting follow state back into the local reactive flag so the
// button's active styling updates immediately.
function toggleTrack(hex: string) {
  const c = props.adsbControl
  if (!c) return
  c.toggleFollowByHex(hex)
  followedHex.value = c.isFollowingHex(hex) ? hex : null
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

onMounted(() => {
  // On first ever mount, collapse every group so the search list opens closed.
  // Subsequent mounts respect whatever the user has since expanded/collapsed.
  if (!collapsedSeeded.value) {
    collapsed.value = new Set(['aircraft', 'airports', 'mil'])
    collapsedSeeded.value = true
  }
  refreshAircraft()
})

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
  scrollOpenRowIntoView()
}

// Expand a specific aircraft's accordion by hex (driven by a map aircraft click)
// and scroll it into view. Clears any active search and un-collapses the aircraft
// section, then pins the aircraft to the top via the snapshot. A no-op if the hex
// isn't a listed aircraft (e.g. a ground vehicle or tower, which the list omits).
function expandAircraft(hex: string) {
  query.value = ''
  if (collapsed.value.has('aircraft')) {
    const next = new Set(collapsed.value)
    next.delete('aircraft')
    collapsed.value = next
  }
  const liveResult = planes.value.find((r) => r.hex === hex)
  if (!liveResult) return
  expandedPlane.value = hex
  expandedPlaneSnapshot.value = liveResult
  refreshExpandedPlane()
  scrollOpenRowIntoView()
}

// Expose methods driven by map-marker clicks + the focus keyboard shortcut.
defineExpose({
  focus: () => inputRef.value?.focus(),
  expandAirport,
  expandAircraft,
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
}

#filter-results::-webkit-scrollbar {
  display: none;
}

/* The visual body and its per-section groups carry the column layout + 1px
   seams that used to live on #filter-results (now just the scroll container).
   Both the body (between sections) and each section (button → rows → accordion)
   keep a 1px gap so the thin dark separators read identically. #filter-listbox
   is an empty aria-owns host and takes no space. */
.filter-results-body,
.filter-result-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* The selectable part of a row (role="option"): icon + text. It stretches to
   fill the row; the per-row bell button sits beside it (a sibling) so it is not
   nested inside the option. */
.filter-result-option {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
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

/* A touch more breathing room above the very first section heading. The section
   button is now the first child of its group wrapper, so scope to the first
   group rather than a bare :first-child. */
.filter-result-group:first-child .filter-section-label {
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

/* Emergency squawk (7500/7600/7700): the aircraft goes red on the map, so flag it
   the same way in the side panel — callsign in the row and the detail accordion's
   section headings. #ff4040 matches the map's emergency callsign label colour. */
.filter-result-item--emergency .filter-result-primary {
  color: #ff4040;
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

/* POSITION / IDENTIFICATION headings go red for an aircraft with an emergency
   squawk, matching the red callsign and the map marker. */
.acft-acc-body--emergency .apt-acc-section-title {
  color: #ff4040;
}

.apt-acc-grid {
  display: grid;
  column-gap: 16px;
  row-gap: 12px;
}

.apt-acc-grid--two {
  grid-template-columns: 1fr 1fr;
}

.apt-acc-grid--three {
  grid-template-columns: 1fr 1fr 1fr;
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

/* ---- Aircraft live-telemetry accordion ---- */
/* When the aircraft drops out of the feed, dim the (last-known) values. */
.acft-acc-body--stale .apt-acc-cell-value {
  color: rgba(255, 255, 255, 0.4);
}

.acft-acc-signal-lost {
  margin: 12px 24px 0 24px;
  padding: 6px 10px;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ff4040;
  background: rgba(255, 64, 64, 0.1);
  border-left: 2px solid #ff4040;
}

.acft-acc-action-section {
  padding-top: 8px;
  padding-bottom: 0;
  /* Pull the button row left so its boxes left-align with the section text
     above (overrides the 24px left padding inherited from .apt-acc-section). */
  padding-left: 16px;
}

/* The aircraft accordion ends on the action row, so it needs less bottom
   breathing room than the airport accordion (which ends on a data grid). */
.acft-acc-body {
  padding-bottom: 16px;
}

.acft-acc-action-row {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
}

/* 44px square controls matching the satellite list-item accordion buttons. */
.acft-acc-btn {
  position: relative;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  background: #0d1015;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.12s,
    background 0.12s;
}

.acft-acc-btn:hover {
  color: var(--color-accent);
  background: #05070a;
}

.acft-acc-btn.acft-acc-btn--active {
  color: var(--color-accent);
  background: rgba(200, 255, 0, 0.12);
}

.acft-acc-btn.acft-acc-btn--active:hover {
  background: rgba(200, 255, 0, 0.18);
}

/* Hover tooltip, left-anchored to the button (matches the satellite buttons). */
.acft-acc-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
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

.acft-acc-btn[data-tooltip]:hover::before {
  opacity: 1;
}
</style>
