<template>
  <BaseFilterPanel
    ref="panelRef"
    :items="items"
    :query="query"
    :expanded-key="expandedKey"
    id-prefix="filter"
    input-label="Filter aircraft by callsign, ICAO or squawk"
    placeholder="CALLSIGN · ICAO · SQUAWK"
    listbox-label="Aircraft, airports and military bases"
    :enter-activates-first-row="false"
    clear-focus-on-input
    @update:query="query = $event"
    @update:expanded-key="onExpandedKeyChange"
  >
    <template #accordion="{ item }">
      <!-- Inline accordion keyed off the category the row came from. -->
      <AirAircraftAccordion
        v-if="filterCategory === 'aircraft'"
        :live-data="liveAircraftData"
        :loading="awaitingAircraftData"
        :signal-lost="signalLost"
        :emergency="planeFor(item.key)!.emergency"
        :tracking="followedHex === item.key"
        :alerts-on="notifEnabled.has(item.key)"
        @track="toggleTrack(item.key)"
        @toggle-alerts="toggleAlerts(item.key)"
        @centre="centrePlane(planeFor(item.key)!)"
      />
      <AirMilitaryBaseAccordion
        v-else-if="filterCategory === 'mil'"
        :base="milBaseFor(item.key)!"
      />
      <AirAirportAccordion
        v-else
        :airport="airportFor(item.key)!"
        :sdr-connected="sdrConnected"
        :show-tune-notice="tuneNotice === item.key"
        @tune="tuneFreq(airportFor(item.key)!, $event)"
      />
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Air FILTER pane — the searchable list of aircraft, airports and military
 * bases, one category at a time.
 *
 * Supplies rows and expanded-row content to the shared BaseFilterPanel shell
 * (combobox, listbox/aria-owns wiring, roving keyboard navigation, focusable
 * scroll region, accordion). What stays here is the wiring: which category is
 * active, the ADS-B feed mirror, the pinned expanded aircraft, and the map/SDR
 * actions an expanded row offers. The results, rows, telemetry and accordions
 * live in `./filter/`.
 */
import { ref, computed, watch, onMounted, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import BaseFilterPanel, { type FilterPanelItem } from '@sentinel/ui/base/BaseFilterPanel.vue'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { useRadio } from '@sentinel/shell-api/shell/useRadio'
import { AIRPORTS_DATA } from './controls/airports/AirportsControl'
import { MILITARY_BASES_DATA } from './controls/military-bases/MilitaryBasesControl'
import type { AdsbLiveControl } from './controls/adsb/AdsbLiveControl'
import type { AirportsToggleControl } from './controls/airports/AirportsControl'
import type { MilitaryBasesToggleControl } from './controls/military-bases/MilitaryBasesControl'
import { useAirNotifStore } from './stores/airNotif'
import { useAirStore } from './stores/air'
import AirAircraftAccordion from './filter/AirAircraftAccordion.vue'
import AirAirportAccordion from './filter/AirAirportAccordion.vue'
import AirMilitaryBaseAccordion from './filter/AirMilitaryBaseAccordion.vue'
import { airportRows, milBaseRows, planeRows } from './filter/airFilterRows'
import { fitPlaceBounds } from './filter/fitPlaceBounds'
import { useAirFilterResults, type AircraftTypeFilter } from './filter/useAirFilterResults'
import { useExpandedAircraftTelemetry } from './filter/useExpandedAircraftTelemetry'
import { useAircraftAlertToggle } from './filter/useAircraftAlertToggle'
import type { AirportFreq } from './filter/airportFrequencies'
import type {
  AircraftFeature,
  AirportResult,
  MilResult,
  PlaneResult,
} from './filter/airFilterTypes'

const props = defineProps<{
  adsbControl: AdsbLiveControl | null
  airportsControl: AirportsToggleControl | null
  militaryBasesControl: MilitaryBasesToggleControl | null
  getMap: () => import('maplibre-gl').Map | null
}>()

const notificationsStore = useNotificationsStore()
const airNotifStore = useAirNotifStore()
const { radio, connected: sdrConnected } = useRadio()
const airStore = useAirStore()

const panelRef = useTemplateRef<InstanceType<typeof BaseFilterPanel>>('panelRef')

// Which airport row is expanded (by ICAO), and which one is currently showing
// the "connect an SDR" inline notice.
const expandedAirport = ref<string | null>(null)
// Keyed by name: two bases (Wyton, Alconbury) share an ICAO code, and
// Fylingdales has none.
const expandedMilBase = ref<string | null>(null)
const tuneNotice = ref<string | null>(null)

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

const query = ref('')

// The active FILTER category (aircraft / airports / mil), selected via the rail
// sub-tabs in MapSidebar. Single-select — only this category's flat list renders.
const { airFilterCategory: filterCategory } = storeToRefs(airStore)

// Alert opt-in state — sourced from the persisted airNotif store.
const notifEnabled = computed(() => airNotifStore.enabledHexes)

// Hex of the aircraft the map is currently following, or null. The control is a
// plain (non-reactive) class, so this mirror is refreshed from it on every data
// update and updated optimistically when the track button is clicked.
const followedHex = ref<string | null>(null)

// Aircraft data — refreshed on adsb-data-update event
const aircraftFeatures = ref<AircraftFeature[]>([])

// Mirror of the map's active filter so the search list shows the same aircraft
// the map does (ALL / CIVIL / MILITARY). Refreshed alongside the feature data
// and whenever the user changes the filter mode.
const typeFilter = ref<AircraftTypeFilter>('all')
const allHidden = ref(false)

const { planes, airports, milBases } = useAirFilterResults(
  query,
  aircraftFeatures,
  typeFilter,
  allHidden,
)
const {
  liveAircraftData,
  signalLost,
  awaitingData: awaitingAircraftData,
  refreshExpandedPlane,
} = useExpandedAircraftTelemetry(expandedPlane, expandedPlaneSnapshot, aircraftFeatures)
const { toggleAlerts } = useAircraftAlertToggle(() => props.adsbControl)

function refreshFilterState() {
  if (props.adsbControl) {
    typeFilter.value = props.adsbControl._typeFilter
    allHidden.value = props.adsbControl._allHidden
    followedHex.value = props.adsbControl._followEnabled ? props.adsbControl._selectedHex : null
  }
}

function refreshAircraft() {
  if (props.adsbControl?._geojson?.features) {
    aircraftFeatures.value = props.adsbControl._geojson.features as unknown as AircraftFeature[]
  } else {
    aircraftFeatures.value = []
  }
  refreshFilterState()
  refreshExpandedPlane()
}

function onMsbTabSwitch(event: Event): void {
  const tab = (event as CustomEvent<string>).detail
  if (tab === 'search') refreshAircraft()
}

useDocumentEvent('adsb-data-update', refreshAircraft)
useDocumentEvent('msb-tab-switch', onMsbTabSwitch)
// AirSideMenu dispatches this when the map filter mode changes so the list stays in sync.
useDocumentEvent('adsb-filter-change', refreshFilterState)

// The aircraft rows actually rendered. The expanded (selected) aircraft is
// pinned to the top so its open accordion never moves as the rest of the list
// reorders/repopulates each poll. The pinned row uses its live data when still
// in the feed, or the last-known snapshot when it has briefly dropped out (so it
// stays visible while SIGNAL LOST shows). All other aircraft follow in sort order.
const displayPlanes = computed<PlaneResult[]>(() => {
  const live = planes.value
  const snapshot = expandedPlaneSnapshot.value
  if (!snapshot) return live
  const pinned = live.find((plane) => plane.hex === snapshot.hex) ?? snapshot
  return [pinned, ...live.filter((plane) => plane.hex !== snapshot.hex)]
})

// Only the active category's rows render, so the shell sees one flat list.
const items = computed<FilterPanelItem[]>(() => {
  if (filterCategory.value === 'aircraft') return planeRows(displayPlanes.value)
  if (filterCategory.value === 'airports') {
    return airportRows(airports.value, expandedAirport.value)
  }
  // defensive: AirFilterCategory is an exhaustive 'aircraft' | 'airports' |
  // 'mil' union guarded on load (isAirFilterCategory), so once the two prior
  // arms are excluded, category here is always 'mil'.
  return milBaseRows(milBases.value, expandedMilBase.value)
})

// The row the shell should render open, for whichever category is active.
const expandedKey = computed<string>(() => {
  if (filterCategory.value === 'aircraft') return expandedPlane.value ?? ''
  if (filterCategory.value === 'airports') return expandedAirport.value ?? ''
  return expandedMilBase.value ?? ''
})

// Look-ups from a row key back to its source record, for the accordion slot and
// the click handlers. Each is only ever called for a row of its own category —
// the caller has already established which one is active — so neither has to
// re-check the category.
function planeFor(key: string): PlaneResult | undefined {
  return displayPlanes.value.find((plane) => plane.hex === key)
}
function airportFor(key: string): AirportResult | undefined {
  return airports.value.find((airport) => airport.icao === key)
}
function milBaseFor(key: string): MilResult | undefined {
  return milBases.value.find((base) => base.name === key)
}

// ---- Row activation ----
// The shell reports the row that should now be open ('' when the open row was
// clicked shut). Each category turns that into its own action.
function onExpandedKeyChange(key: string): void {
  if (filterCategory.value === 'aircraft') {
    if (!key) {
      expandedPlane.value = null
      refreshExpandedPlane()
      return
    }
    const plane = planeFor(key)
    /* v8 ignore start -- the key always comes from a rendered row of the active
       category, so the look-up above cannot miss. */
    if (!plane) return
    /* v8 ignore stop */
    selectPlane(plane)
    return
  }
  if (filterCategory.value === 'airports') {
    if (!key) {
      expandedAirport.value = null
      return
    }
    const airport = airportFor(key)
    /* v8 ignore start -- as above: the key is always a rendered airport row. */
    if (!airport) return
    /* v8 ignore stop */
    openAirport(airport)
    return
  }
  // Military bases open like airports: the accordion shows, and the map fits
  // the base.
  if (!key) {
    expandedMilBase.value = null
    return
  }
  const base = milBaseFor(key)
  /* v8 ignore start -- as above: the key is always a rendered base row. */
  if (!base) return
  /* v8 ignore stop */
  expandedMilBase.value = base.name
  fitToPlace(base.bounds, base.coords)
}

// Opening an aircraft row selects it on the map (selected tag + trail, as a
// label click does), centres the map on it and pins it to the top of the list.
function selectPlane(plane: PlaneResult) {
  expandedPlane.value = plane.hex
  // Capture the clicked row so it stays rendered (with last-known telemetry) if
  // the aircraft later drops out of the live list.
  expandedPlaneSnapshot.value = plane
  refreshExpandedPlane()
  centrePlane(plane)
}

// Select the aircraft on the map and ease to it. When it has left the live feed
// (a snapshot row) there is nothing to select, so the map just eases to the
// snapshot's last-known coordinates.
function centrePlane(plane: PlaneResult) {
  const control = props.adsbControl
  if (!control) return
  if (control.selectByHex(plane.hex)) return
  const map = props.getMap()
  if (map) map.easeTo({ center: plane.coords, zoom: Math.max(map.getZoom(), 10), duration: 600 })
}

// Fit the map to an airport or base, when the map is up.
function fitToPlace(bounds: [number, number, number, number], marker: [number, number]) {
  const map = props.getMap()
  if (map) fitPlaceBounds(map, bounds, marker)
}

// Opening an airport row both navigates the map to it and expands the inline
// accordion of frequencies.
function openAirport(airport: AirportResult) {
  expandedAirport.value = airport.icao
  tuneNotice.value = null
  fitToPlace(airport.bounds, airport.coords)
}

// Tune the connected SDR to a clicked frequency. If no radio is connected, show
// a subtle inline notice instead of attempting to tune.
function tuneFreq(airport: AirportResult, frequency: AirportFreq) {
  if (!radio.value || !sdrConnected.value) {
    tuneNotice.value = airport.icao
    return
  }
  tuneNotice.value = null
  radio.value.tune({
    hz: frequency.hz,
    mode: frequency.mode,
    satName: `${airport.name} ${frequency.label}`,
  })
  notificationsStore.add({
    type: 'system',
    title: `${airport.icao} ${frequency.label.toUpperCase()}`,
    detail: `Tuned ${frequency.display} ${frequency.mode}`,
  })
}

// ---- Tracking (track button) ----
// Toggle following the aircraft on the map. Delegates to the live control, then
// mirrors the resulting follow state back into the local reactive flag so the
// button's active styling updates immediately.
function toggleTrack(hex: string) {
  const control = props.adsbControl
  if (!control) return
  control.toggleFollowByHex(hex)
  followedHex.value = control.isFollowingHex(hex) ? hex : null
}

// Refresh aircraft data when adsbControl becomes available.
watch(
  () => props.adsbControl,
  (control) => {
    if (control) refreshAircraft()
  },
  { immediate: true },
)

onMounted(() => {
  refreshAircraft()
})

// Expand a specific airport's accordion by ICAO (driven by a map marker click).
// Clears any active search and switches the FILTER category to airports so the
// row is in the visible list; the shell scrolls the opened row into view. The
// map fits the airport, as opening its row in the list does: a military base
// click flies to the base itself, but an airport click had nothing moving the
// map, so clicking one only sometimes looked like it zoomed (when already near).
// The fit waits a frame: the same click opens the side panel, which is laid out
// only after Vue's next render, and the fit has to leave room for it.
function expandAirport(icao: string) {
  const airport = AIRPORTS_DATA.features.find((feature) => feature.properties.icao === icao)
  if (!airport) return
  query.value = ''
  airStore.setAirFilterCategory('airports')
  expandedAirport.value = icao
  tuneNotice.value = null
  requestAnimationFrame(() =>
    fitToPlace(airport.properties.bounds, airport.geometry.coordinates as [number, number]),
  )
}

// Expand a military base's accordion by name (driven by a map base click).
// Clears any active search and switches the FILTER category to MIL. The map
// click has already flown to the base, so this doesn't move the map again.
function expandMilitaryBase(name: string) {
  if (!MILITARY_BASES_DATA.features.some((feature) => feature.properties.name === name)) return
  query.value = ''
  airStore.setAirFilterCategory('mil')
  expandedMilBase.value = name
}

// Expand a specific aircraft's accordion by hex (driven by a map aircraft click).
// Clears any active search and switches the FILTER category to aircraft, then
// pins the aircraft to the top via the snapshot. A no-op if the hex isn't a
// listed aircraft (e.g. a ground vehicle or tower, which the list omits).
function expandAircraft(hex: string) {
  query.value = ''
  airStore.setAirFilterCategory('aircraft')
  const liveResult = planes.value.find((plane) => plane.hex === hex)
  if (!liveResult) return
  expandedPlane.value = hex
  expandedPlaneSnapshot.value = liveResult
  refreshExpandedPlane()
}

// Expose methods driven by map-marker clicks + the focus keyboard shortcut.
defineExpose({
  focus: () => panelRef.value?.focus(),
  expandAirport,
  expandAircraft,
  expandMilitaryBase,
})
</script>

<style>
/* The shared shell (BaseFilterPanel) supplies the input row, results region and
   row chrome; what stays here is the Air pane's own deviations from it. The
   expanded-row accordions carry their own sheets (./filter/). */

/* This pane's results region is a fixed-height box rather than a flex child. */
#filter-results {
  flex: none;
  max-height: 340px;
}

/* Rows are separated by a 1px seam of the panel background, and this pane's
   input→first-row gap is a touch wider than the shell default. The gap is set
   as the shell's custom property because the shell holds that space inside the
   first row's header, where an expanded row's tint covers it. */
#filter-results .bfp-results-body {
  gap: 1px;
  --bfp-results-top-gap: 10px;
}

/* Keyboard focus is a touch stronger here, and its outline keeps the softened
   accent this pane has always used. */
#filter-results .bfp-result-item {
  --bfp-focus-outline: rgba(var(--accent-rgb), 0.4);
}
#filter-results .bfp-result-item {
  --bfp-focus-highlight: rgba(var(--ink-rgb), 0.06);
}

/* Emergency squawk (7500/7600/7700): the aircraft goes red on the map, so flag it
   the same way in the side panel — callsign in the row and the detail accordion's
   section headings. var(--sev-critical) matches the map's emergency callsign label colour. */
.filter-result-item--emergency .bfp-result-primary {
  color: var(--sev-critical);
}

/* This pane centres its empty state and sets it smaller and dimmer than the
   shell's default. */
#filter-results .bfp-no-results {
  /* The extra 10px on top stands in for the row list's own top padding, which
     the empty state sits outside of — without it the message rides higher than
     a first row would. */
  padding: 30px 18px 20px;
  font-family: 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: rgba(var(--ink-rgb), 0.25);
  text-align: center;
}
</style>
