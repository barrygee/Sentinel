<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the left #map-sidebar-rail.
       Every control from the full menu is always visible as an icon; the full label
       is the button's accessible name and its hover tooltip. -->
  <nav id="side-menu" aria-label="Air map controls">
    <!-- Zoom + location -->
    <button
      class="sm-btn sm-glyph"
      data-tooltip="ZOOM IN"
      aria-label="Zoom in"
      @click="getMap()?.zoomIn()"
    >
      +
    </button>
    <button
      class="sm-btn sm-glyph"
      data-tooltip="ZOOM OUT"
      aria-label="Zoom out"
      @click="getMap()?.zoomOut()"
    >
      −
    </button>
    <button
      class="sm-btn"
      :class="{ active: locActive }"
      data-tooltip="GO TO MY LOCATION"
      aria-label="Go to my location"
      @click="goToLocation"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" stroke="#c8ff00" stroke-width="1.8" />
        <circle cx="10" cy="10" r="2" fill="white" />
      </svg>
    </button>

    <!-- FILTER group: a click-to-expand accordion of aircraft-filter modes
         (all / civil / military) shown below the icon. -->
    <button
      id="sm-filter-btn"
      class="sm-btn"
      :class="{ active: filterAccordionOpen }"
      data-tooltip="FILTER"
      aria-label="Filter aircraft"
      aria-controls="filter-mode-flyout"
      :aria-expanded="filterAccordionOpen"
      @click="toggleFilterAccordion"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <line
          x1="1"
          y1="3.5"
          x2="14"
          y2="3.5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <line
          x1="3.5"
          y1="7.5"
          x2="11.5"
          y2="7.5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <line
          x1="6"
          y1="11.5"
          x2="9"
          y2="11.5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <div v-show="filterAccordionOpen" id="filter-mode-flyout" class="sm-accordion-panel">
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: isFilterModeActive('all') }"
        data-mode="all"
        data-tooltip="ALL AIRCRAFT"
        aria-label="Show all aircraft"
        @click="setFilterMode('all')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
          <rect x="13" y="3" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
          <rect x="3" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
          <rect x="13" y="13" width="8" height="8" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: isFilterModeActive('civil') }"
        data-mode="civil"
        data-tooltip="CIVIL AIRCRAFT"
        aria-label="Civil aircraft only"
        @click="setFilterMode('civil')"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 2C12.8 2 13.2 3.6 13.2 6.6 L21 11.5 V13.4 L13.2 11 V16.5 L15.5 18.5 V20 L12 19 L8.5 20 V18.5 L10.8 16.5 V11 L3 13.4 V11.5 L10.8 6.6 C10.8 3.6 11.2 2 12 2Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: isFilterModeActive('mil') }"
        data-mode="mil"
        data-tooltip="MILITARY AIRCRAFT"
        aria-label="Military aircraft only"
        @click="setFilterMode('mil')"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <polygon
            points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>

    <!-- RANGE RING -->
    <button
      class="sm-btn"
      :class="{ active: airStore.overlayStates.rangeRings }"
      data-tooltip="RANGE RING"
      aria-label="Range ring"
      @click="mapRef.value?.getRangeRings()?.handleClickPublic()"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
        <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    </button>

    <!-- A2A REFUELING -->
    <button
      class="sm-btn"
      :class="{ active: airStore.overlayStates.aara }"
      data-tooltip="A2A REFUELING"
      aria-label="A2A refueling"
      @click="mapRef.value?.getAara()?.toggle()"
    >
      <svg
        width="14"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <!-- Fuel droplet — the air-to-air refuelling track. -->
        <path
          d="M12 2 C7 9 5 12 5 15 a7 7 0 1 0 14 0 c0 -3 -2 -6 -7 -13 z"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
    </button>

    <!-- AWACS -->
    <button
      class="sm-btn"
      :class="{ active: airStore.overlayStates.awacs }"
      data-tooltip="AWACS"
      aria-label="AWACS"
      @click="mapRef.value?.getAwacs()?.toggle()"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <!-- Mirrors the AWACS map overlay: a circle with a semi-transparent fill. -->
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="currentColor"
          fill-opacity="0.2"
          stroke="currentColor"
          stroke-width="1.6"
        />
      </svg>
    </button>

    <!-- 3D VIEW -->
    <button
      class="sm-btn"
      :class="{ active: tiltActive }"
      data-tooltip="3D VIEW"
      aria-label="3D view"
      @click="toggle3D"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <polygon
          points="7,1 13,4.5 13,9.5 7,13 1,9.5 1,4.5"
          stroke="currentColor"
          stroke-width="1.2"
          fill="none"
        />
        <polyline points="7,1 7,7" stroke="currentColor" stroke-width="1.2" />
        <polyline points="1,4.5 7,7 13,4.5" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>

    <!-- LAYERS group: a click-to-expand accordion of map-layer toggles
         (planes, ground vehicles, towers, airports, military bases, roads,
         place names) shown below the icon. -->
    <button
      id="sm-layers-btn"
      class="sm-btn"
      :class="{ active: layersAccordionOpen }"
      data-tooltip="LAYERS"
      aria-label="Map layers"
      aria-controls="layers-panel"
      :aria-expanded="layersAccordionOpen"
      @click="toggleLayersAccordion"
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
          d="M12 3 L21 8 L12 13 L3 8 Z"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
          fill="none"
        />
        <path d="M3 12 L12 17 L21 12" stroke="currentColor" stroke-width="1.4" fill="none" />
        <path d="M3 16 L12 21 L21 16" stroke="currentColor" stroke-width="1.4" fill="none" />
      </svg>
    </button>

    <div v-show="layersAccordionOpen" id="layers-panel" class="sm-accordion-panel">
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: airStore.overlayStates.adsb }"
        data-loc="planes"
        data-tooltip="AIRCRAFT"
        aria-label="Aircraft"
        @click="togglePlanes"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 2C12.8 2 13.2 3.6 13.2 6.6 L21 11.5 V13.4 L13.2 11 V16.5 L15.5 18.5 V20 L12 19 L8.5 20 V18.5 L10.8 16.5 V11 L3 13.4 V11.5 L10.8 6.6 C10.8 3.6 11.2 2 12 2Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: !hideGnd }"
        data-loc="ground"
        data-tooltip="GROUND VEHICLES"
        aria-label="Ground vehicles"
        @click="toggleGround"
      >
        <svg
          width="17"
          height="13"
          viewBox="0 0 24 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="1" y="3" width="13" height="9" stroke="currentColor" stroke-width="1.6" />
          <path
            d="M14 6h4l3 3v3h-7z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
            fill="none"
          />
          <circle cx="6" cy="14" r="2" stroke="currentColor" stroke-width="1.6" />
          <circle cx="17" cy="14" r="2" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: !hideTowers }"
        data-loc="towers"
        data-tooltip="TOWERS"
        aria-label="Towers"
        @click="toggleTowers"
      >
        <svg
          width="14"
          height="15"
          viewBox="0 0 20 22"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M5 21 L9 5 M15 21 L11 5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <line x1="7.5" y1="13" x2="12.5" y2="13" stroke="currentColor" stroke-width="1.6" />
          <circle cx="10" cy="3.5" r="1.6" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: airStore.overlayStates.names }"
        data-loc="names"
        data-tooltip="PLACE NAMES"
        aria-label="Place name labels"
        @click="mapRef.value?.getNamesControl()?.handleClickPublic()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 22C12 22 19 14 19 9A7 7 0 1 0 5 9C5 14 12 22 12 22Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
            fill="none"
          />
          <circle cx="12" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none" />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: airStore.overlayStates.airports }"
        data-loc="airports"
        data-tooltip="AIRPORTS"
        aria-label="Airports"
        @click="mapRef.value?.getAirports()?.toggle()"
      >
        <svg
          width="14"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Control tower — the airport facility. Sized to fill the viewBox so
               it matches the visual weight of the other sub-menu icons. -->
          <path
            d="M6 13 L18 13 L16 7 L8 7 Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
            fill="none"
          />
          <path
            d="M10 13 L9 21.5 M14 13 L15 21.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <line
            x1="4.5"
            y1="21.5"
            x2="19.5"
            y2="21.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <line
            x1="12"
            y1="7"
            x2="12"
            y2="2.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: airStore.overlayStates.militaryBases }"
        data-loc="mil"
        data-tooltip="MILITARY BASES"
        aria-label="Military bases"
        @click="mapRef.value?.getMilBases()?.toggle()"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <polygon
            points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <button
        class="sm-btn sm-sub-btn"
        :class="{ active: airStore.overlayStates.roads }"
        data-loc="roads"
        data-tooltip="ROADS"
        aria-label="Roads"
        @click="mapRef.value?.getRoadsControl()?.handleClickPublic()"
      >
        <svg
          width="14"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M8 22 L10 2 M16 22 L14 2"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <line x1="12" y1="4" x2="12" y2="8" stroke="currentColor" stroke-width="1.6" />
          <line x1="12" y1="11" x2="12" y2="15" stroke="currentColor" stroke-width="1.6" />
          <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
    </div>
  </nav>

  <!-- 3D controls widget (fixed bottom-right, cleared of the rail) -->
  <div id="map-3d-controls" :class="{ 'map-3d-controls--hidden': !tiltActive }">
    <span />
    <button class="map-3d-btn" data-tooltip="TILT UP" aria-label="Tilt up" @click="tiltBy(10)">
      ↑
    </button>
    <span />
    <button
      class="map-3d-btn"
      data-tooltip="ROTATE LEFT"
      aria-label="Rotate left"
      @click="rotateBy(-15)"
    >
      ↺
    </button>
    <button
      class="map-3d-btn"
      data-tooltip="RESET BEARING"
      aria-label="Reset bearing"
      @click="resetBearing"
    >
      ⌖
    </button>
    <button
      class="map-3d-btn"
      data-tooltip="ROTATE RIGHT"
      aria-label="Rotate right"
      @click="rotateBy(15)"
    >
      ↻
    </button>
    <span />
    <button class="map-3d-btn" data-tooltip="TILT DOWN" aria-label="Tilt down" @click="tiltBy(-10)">
      ↓
    </button>
    <span />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAirStore } from '@/stores/air'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useDisclosure } from '@/composables/useDisclosure'
import type AirMap from './AirMap.vue'

// Receives a markRaw proxy so Vue never re-renders this component when the map
// mounts/unmounts — accessing .current is non-reactive by design.
const props = defineProps<{
  mapRef: { current: InstanceType<typeof AirMap> | null }
}>()

// Non-reactive accessor — reads through the proxy at call-time only
const mapRef = {
  get value() {
    return props.mapRef.current
  },
}

const airStore = useAirStore()
const { location: userLocation } = useUserLocation()

const tiltActive = ref(localStorage.getItem('sentinel_3d') === '1')
const cleared = ref(false)
const locActive = computed(() => userLocation.value !== null)
const hideGnd = ref(false)
const hideTowers = ref(false)

// FILTER and LAYERS each expand a vertical icon accordion on click; the group
// button is highlighted (green) while its panel is open.
const { open: filterAccordionOpen, toggle: toggleFilterAccordion } = useDisclosure()
const { open: layersAccordionOpen, toggle: toggleLayersAccordion } = useDisclosure()

// The ADS-B control's filter fields aren't reactive, so mirror them into refs to
// drive the active (green) mode highlight. Synced from the control when the
// accordion opens and whenever the filter changes anywhere in the app.
const filterTypeMode = ref<'all' | 'civil' | 'mil'>('all')
const filterAllHidden = ref(false)

function syncFilterStateFromControl() {
  const control = getAdsb()
  if (!control) return
  filterTypeMode.value = control._typeFilter
  filterAllHidden.value = control._allHidden
}

watch(filterAccordionOpen, (isOpen) => {
  if (isOpen) syncFilterStateFromControl()
})
useDocumentEvent('adsb-filter-change', syncFilterStateFromControl)

// ---- Map access helpers ----
function getMap() {
  const m = mapRef.value as { getMap?: () => import('maplibre-gl').Map | null } | null
  return m?.getMap?.() ?? null
}
function getAdsb() {
  return (
    (mapRef.value?.getAdsbControl?.() as
      | import('./controls/adsb/AdsbLiveControl').AdsbLiveControl
      | null) ?? null
  )
}
function getAdsbLabels() {
  return (
    (mapRef.value?.getAdsbLabels?.() as
      | import('./controls/adsb-labels/AdsbLabelsToggleControl').AdsbLabelsToggleControl
      | null) ?? null
  )
}

// ---- Location ----
function goToLocation() {
  const m = getMap()
  const loc = userLocation.value
  if (!m || !loc) return
  m.flyTo({ center: [loc.lon, loc.lat], zoom: Math.max(m.getZoom(), 10), duration: 800 })
}

// ---- Plane overlay ----
function togglePlanes() {
  const c = getAdsb()
  if (!c) return
  c.toggle()
  const labels = getAdsbLabels()
  if (labels) labels.syncToAdsb(c.visible)
}

function toggleGround() {
  const c = getAdsb()
  if (!c) return
  hideGnd.value = !hideGnd.value
  c.setHideGroundVehicles(hideGnd.value)
}

function toggleTowers() {
  const c = getAdsb()
  if (!c) return
  hideTowers.value = !hideTowers.value
  c.setHideTowers(hideTowers.value)
}

// ---- 3D ----
function toggle3D() {
  const airMap = mapRef.value as { set3DActive?: (v: boolean) => void } | null
  tiltActive.value = !tiltActive.value
  airMap?.set3DActive?.(tiltActive.value)
}

function tiltBy(delta: number) {
  const m = getMap()
  if (!m) return
  const newPitch = Math.min(Math.max(m.getPitch() + delta, 0), 85)
  const airMap = mapRef.value as { setTargetPitch?: (p: number) => void } | null
  airMap?.setTargetPitch?.(newPitch)
  m.easeTo({ pitch: newPitch, duration: 300 })
}

function rotateBy(delta: number) {
  const m = getMap()
  if (!m) return
  m.easeTo({ bearing: m.getBearing() + delta, duration: 300 })
}

function resetBearing() {
  const m = getMap()
  if (!m) return
  m.easeTo({ bearing: 0, duration: 400 })
}

// ---- Clear overlays ----
// Currently unwired (no template binding); retained for the clear-overlays control.
/* v8 ignore start -- dead code: no template binding and not exposed, so there is
   no path to invoke this from a test. Kept for the clear-overlays control. */
function _toggleClear() {
  const ctrl =
    (mapRef.value?.getClearControl?.() as
      | import('./controls/clear-overlays/ClearOverlaysControl').ClearOverlaysControl
      | null) ?? null
  if (!ctrl) return
  ctrl.toggle()
  cleared.value = ctrl._cleared
}
/* v8 ignore stop */

// ---- Filter accordion ----
function isFilterModeActive(mode: string): boolean {
  return !filterAllHidden.value && filterTypeMode.value === mode
}

function setFilterMode(mode: string) {
  const c = getAdsb()
  if (!c) return
  if (c._allHidden) c.setAllHidden(false)
  c.setTypeFilter(mode as 'all' | 'civil' | 'mil')
  _saveFilter()
  // Let the search list re-apply the same filter to its aircraft section.
  document.dispatchEvent(new CustomEvent('adsb-filter-change'))
}

function _saveFilter() {
  const c = getAdsb()
  /* v8 ignore start -- defensive: the only caller (setFilterMode) already returns
     early when there is no control, so this guard is never the path taken. */
  if (!c) return
  /* v8 ignore stop */
  try {
    localStorage.setItem(
      'adsbFilter',
      JSON.stringify({
        typeFilter: c._typeFilter,
        allHidden: c._allHidden,
      }),
    )
  } catch {}
}

// Persisted filter state (localStorage `adsbFilter`) is restored inside the
// AdsbLiveControl constructor (_loadFilterState) so the first poll renders under
// the correct filter — restoring it here via setTimeout caused civil aircraft to
// flash for ~1s on load before the filter applied.
</script>

<style>
/* Fixed icon rail mirroring #map-sidebar-rail, pinned to the right edge. Every
   action is always visible as an icon; the rail does not expand/collapse. */
#side-menu {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  right: 0;
  width: 44px;
  background: rgba(10, 13, 20, 0.98);
  z-index: 1003;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
}

#side-menu .sm-btn {
  height: 40px;
  width: 100%;
  flex-shrink: 0;
  background: none;
  border: none;
  color: #fff;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0;
  transition: color 0.15s;
}

#side-menu .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}

/* Hover matches the left side panel's buttons: a subtle grey background + muted
   icon. Active stays green and, sitting after this rule at equal specificity,
   wins the icon colour even while hovered. */
#side-menu .sm-btn:hover {
  color: var(--color-text-muted);
  background: var(--color-border);
}

#side-menu .sm-btn.active {
  color: var(--color-accent);
}

/* Sub-menu buttons sit on the grey accordion panel (var(--color-border)), so
   their hover needs a stronger background to read against it. */
#side-menu .sm-sub-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

#side-menu .sm-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* Match the left side panel's icon size (19px), regardless of each SVG's own
   width/height attributes; width auto keeps non-square icons in proportion. */
#side-menu .sm-btn svg {
  display: block;
  height: 19px;
  width: auto;
}

/* Hover tooltip — opens to the left of the right-edge rail. */
#side-menu .sm-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
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
  z-index: 10001;
}

#side-menu .sm-btn[data-tooltip]:hover::before {
  opacity: 1;
}

/* Accordion panel: the FILTER / LAYERS sub-items stack vertically in the rail
   flow, pushing the buttons below them down when expanded. The grey background
   (the side panel's grey) sets the open sub-menu apart from the dark rail. */
.sm-accordion-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--color-border);
}

/* Sub-items inherit the rail-button look (white icon, green on hover/active,
   left-opening tooltip, 19px icon) via .sm-btn; the grey panel background is
   what sets the open sub-menu apart. */

/* 3D controls — pinned bottom-right, shifted left to clear the 44px rail. */
#map-3d-controls {
  position: fixed;
  bottom: calc(44px + 14px);
  right: calc(44px + 14px);
  z-index: 1002;
  display: grid;
  grid-template-columns: repeat(3, 36px);
  grid-template-rows: repeat(3, 36px);
  gap: 4px;
}

#map-3d-controls.map-3d-controls--hidden {
  display: none;
}

.map-3d-btn {
  width: 36px;
  height: 36px;
  background: #000;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s;
  position: relative;
}

.map-3d-btn:hover {
  background: #111;
  color: var(--color-accent);
}

.map-3d-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.map-3d-btn:active {
  background: #1a1a1a;
  color: var(--color-accent);
}

.map-3d-btn[data-tooltip]::before {
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
  padding: 0 10px;
  height: 24px;
  display: flex;
  align-items: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10001;
}

.map-3d-btn[data-tooltip]:hover::before {
  opacity: 1;
}

/* Touch screens: hover tooltips aren't useful. */
@media (max-width: 768px) {
  #side-menu [data-tooltip]::before {
    display: none !important;
  }
  .map-3d-btn[data-tooltip]::before {
    display: none !important;
  }
}

/* ≤480px: the left rail becomes a full-width bottom bar — lift the right rail
   and the 3D widget clear of it so they don't overlap in the bottom-right. */
@media (max-width: 480px) {
  #side-menu {
    bottom: calc(var(--footer-height) + 44px);
  }
  #map-3d-controls {
    bottom: calc(var(--footer-height) + 44px + 8px);
  }
}
</style>
