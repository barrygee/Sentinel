<template>
  <div v-if="!hideTabs" id="map-sidebar-rail">
    <template v-for="tab in tabs" :key="tab.id">
      <BaseIconButton
        class="msb-rail-btn"
        :class="{
          'msb-rail-btn-active': activeTab === tab.id && open,
          'msb-rail-btn-pulse': tab.id === 'alerts' && hasUnread,
        }"
        style="--ba-rail-transition: color 0.15s ease"
        :active="activeTab === tab.id && open"
        :pulse="tab.id === 'alerts' && hasUnread"
        :data-tab="tab.id"
        tooltip-side="right"
        :tooltip="tab.label"
        :accessible-name="tab.label"
        :aria-expanded="activeTab === tab.id && open"
        :aria-controls="SIDEBAR_PANE_IDS[tab.id]"
        @click="toggleRailTab(tab.id)"
      >
        <!-- filter (was search): funnel icon, matching the map side menu's FILTER. -->
        <FilterFunnelIcon v-if="tab.id === 'search'" :size="19" />
        <!-- alerts -->
        <svg
          v-else-if="tab.id === 'alerts'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 2C8 2 5 5 5 9v6H3v2h18v-2h-2V9c0-4-3-7-7-7Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="miter"
            fill="none"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" fill="none" />
        </svg>
        <!-- tracking -->
        <svg
          v-else-if="tab.id === 'tracking'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="miter"
            fill="none"
          />
          <circle cx="12" cy="9" r="2.2" fill="currentColor" />
        </svg>
        <!-- passes -->
        <svg
          v-else-if="tab.id === 'passes'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          stroke-linecap="round"
        >
          <path d="M2 22 C4 14, 10 6, 14 2" stroke="currentColor" stroke-width="1.6" />
          <path d="M10 22 C12 14, 18 6, 22 2" stroke="currentColor" stroke-width="1.6" />
          <path d="M18 22 C20 17, 24 12, 26 9" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <!-- playback / replay -->
        <svg
          v-else-if="tab.id === 'playback'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M20 12 A8 8 0 1 1 16.5 5.4"
            stroke="currentColor"
            stroke-width="1.8"
            fill="none"
          />
          <polyline
            points="20,2 20,6 16,6"
            stroke="currentColor"
            stroke-width="1.8"
            fill="none"
            stroke-linejoin="miter"
          />
          <polygon points="9.5,8 9.5,16 16,12" fill="currentColor" />
        </svg>
      </BaseIconButton>

      <!-- Category sub-tabs: single-select rail buttons shown beneath the FILTER
           tab while it is the open tab. Air = aircraft/airports/military bases;
           Space = one per satellite category that currently has data. Selecting
           one drives which category the search pane (AirFilter/SpaceFilter) shows.
           Styled to mirror the right rail's accordion sub-buttons (IconRailAccordion
           panel look): grey panel background, stronger hover fill, active = accent
           icon only. -->
      <BaseIconButton
        v-for="sub in tab.id === 'search' && activeTab === 'search' && open ? filterSubTabs : []"
        :key="`sub-${sub.id}`"
        class="msb-rail-btn msb-rail-subbtn"
        :class="{ 'msb-rail-btn-active': activeFilterCategory === sub.id }"
        :active="activeFilterCategory === sub.id"
        style="
          --ba-rail-bg: var(--color-button-bg);
          --ba-rail-hover-bg: rgba(255, 255, 255, 0.2);
          --ba-rail-transition: color 0.15s ease;
        "
        :data-filter-cat="sub.id"
        tooltip-side="right"
        :tooltip="sub.label"
        :accessible-name="sub.label"
        :aria-pressed="activeFilterCategory === sub.id"
        @click="selectFilterCategory(sub.id)"
      >
        <FilterSubTabIcon :category="sub.id" />
      </BaseIconButton>
    </template>
  </div>

  <div id="map-sidebar" :class="{ 'msb-hidden': !open }">
    <!-- Mobile close affordance. Hidden on the SDR route (hideTabs), where the
         left rail's active tab already toggles the panel — the extra × is redundant. -->
    <button v-if="!hideTabs" class="msb-mobile-close" aria-label="Close panel" @click="hide">
      ×
    </button>
    <div id="map-sidebar-panes">
      <template v-if="!hideTabs">
        <div
          :id="SIDEBAR_PANE_IDS.search"
          class="msb-pane"
          :class="{ 'msb-pane-active': activeTab === 'search' }"
        >
          <slot name="search" />
        </div>
        <div
          :id="SIDEBAR_PANE_IDS.alerts"
          class="msb-pane"
          :class="{ 'msb-pane-active': activeTab === 'alerts' }"
        >
          <NotificationsPanel />
        </div>
        <div
          :id="SIDEBAR_PANE_IDS.tracking"
          class="msb-pane"
          :class="{ 'msb-pane-active': activeTab === 'tracking' }"
        >
          <TrackingPanel />
        </div>
        <div
          :id="SIDEBAR_PANE_IDS.passes"
          class="msb-pane"
          :class="{ 'msb-pane-active': activeTab === 'passes' }"
        >
          <slot name="passes" />
        </div>
        <div
          :id="SIDEBAR_PANE_IDS.playback"
          class="msb-pane"
          :class="{ 'msb-pane-active': activeTab === 'playback' }"
        >
          <slot name="playback" />
        </div>
      </template>
      <div
        :id="SIDEBAR_PANE_IDS.radio"
        class="msb-pane msb-pane-radio"
        :class="{ 'msb-pane-active': hideTabs || activeTab === 'radio' }"
      >
        <slot name="radio" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import NotificationsPanel from './NotificationsPanel.vue'
import TrackingPanel from './TrackingPanel.vue'
import FilterSubTabIcon from './FilterSubTabIcon.vue'
import FilterFunnelIcon from './FilterFunnelIcon.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useNotificationsStore } from '@/stores/notifications'
import { useAirStore, type AirFilterCategory } from '@/stores/air'
import { useSpaceStore } from '@/stores/space'
import { SATELLITE_CATEGORY_SECTION_LABELS } from '@/utils/satelliteUtils'
import { SIDEBAR_PANE_IDS } from '@/constants/sidebarPanes'

const notifStore = useNotificationsStore()
const airStore = useAirStore()
const spaceStore = useSpaceStore()
const hasUnread = computed(() => notifStore.unreadCount > 0)

const DOMAIN_SPECIFIC_TABS: Record<string, string> = {
  passes: 'space',
  playback: 'air',
  radio: 'sdr',
}

withDefaults(defineProps<{ hideTabs?: boolean }>(), { hideTabs: false })

type SidebarTab = 'search' | 'alerts' | 'tracking' | 'passes' | 'playback' | 'radio'

const SS_KEY = 'sentinel_sidebar_open'
// Per-domain tab memory in localStorage (survives refresh): each section
// remembers its own last tab, so returning to Space resumes 'passes' while Air
// resumes 'playback'. 'radio' is never stored (it's re-applied by the SDR route).
const SS_TAB_MAP_KEY = 'sentinel_sidebar_tab_by_domain'
const VALID_TABS: readonly SidebarTab[] = [
  'search',
  'alerts',
  'tracking',
  'passes',
  'playback',
  'radio',
]

function _domainFromPath(): string {
  return window.location.pathname.split('/').filter(Boolean)[0] ?? ''
}
let _activeDomain = _domainFromPath()
// Reactive mirror of the active domain so the FILTER category sub-tabs (air vs
// space, dynamic vs static) recompute on in-app navigation. `_activeDomain` stays
// as the plain source of truth used by the (non-reactive) tab-restore helpers.
const activeDomain = ref(_activeDomain)

const open = ref(_restoreOpen())
const activeTab = ref<SidebarTab>(_restoreTab(_activeDomain))

// Reflect the drawer's open state on <body> so the global mobile layout can gate
// chrome on it: at ≤480px the tab rail only appears while the drawer is open (it
// belongs to the panel rather than being a permanent bottom strip), and the
// right-edge map controls hide so the full-width drawer isn't cluttered.
watch(
  open,
  (isOpen) => {
    if (isOpen) document.body.setAttribute('data-sidebar-open', '')
    else document.body.removeAttribute('data-sidebar-open')
  },
  { immediate: true },
)

const tabs = computed(() => [
  { id: 'search' as SidebarTab, label: 'FILTER' },
  { id: 'alerts' as SidebarTab, label: 'ALERTS' },
  { id: 'tracking' as SidebarTab, label: 'TRACKING' },
  { id: 'passes' as SidebarTab, label: 'PASSES' },
  // REPLAY tab only appears when air replay recording is enabled (Settings > AIR).
  ...(airStore.replayEnabled ? [{ id: 'playback' as SidebarTab, label: 'REPLAY' }] : []),
])

// FILTER category sub-tabs shown in the rail beneath the FILTER tab. Air has a
// fixed set; Space is data-driven (only categories that currently have satellites,
// published by SpaceFilter into the store). Empty on other domains (no sub-tabs).
const AIR_FILTER_SUBTABS: { id: string; label: string }[] = [
  { id: 'aircraft', label: 'AIRCRAFT' },
  { id: 'airports', label: 'AIRPORTS' },
  { id: 'mil', label: 'MILITARY BASES' },
]
const filterSubTabs = computed<{ id: string; label: string }[]>(() => {
  if (activeDomain.value === 'air') return AIR_FILTER_SUBTABS
  if (activeDomain.value === 'space')
    return spaceStore.spaceAvailableCategories.map((cat) => ({
      id: cat,
      label: SATELLITE_CATEGORY_SECTION_LABELS[cat] || cat.replace(/_/g, ' ').toUpperCase(),
    }))
  return []
})

// The currently-selected FILTER category for the active domain, driving the
// sub-tab active highlight.
const activeFilterCategory = computed<string>(() => {
  if (activeDomain.value === 'air') return airStore.airFilterCategory
  // defensive: the only reader of this computed is the per-item v-for below,
  // gated on the same air/space check via filterSubTabs — for every other
  // domain that list is empty, so the v-for body (and this computed) is never
  // evaluated with a non-air activeDomain that also isn't 'space'. Kept as a
  // safe fallback if a future reader (e.g. an always-rendered aria-current)
  // accesses it unconditionally.
  /* v8 ignore start -- unreachable given the current v-for gating; see above */
  if (activeDomain.value === 'space') return spaceStore.spaceFilterCategory
  return ''
  /* v8 ignore stop */
})

// Pick a FILTER category from a rail sub-tab: open the panel on the FILTER tab and
// set the active domain's category so its search pane shows just that list.
function selectFilterCategory(id: string) {
  switchTab('search')
  if (activeDomain.value === 'air') {
    airStore.setAirFilterCategory(id as AirFilterCategory)
  } else {
    // defensive: this is only ever called from the sub-tab rail buttons,
    // themselves only rendered (via filterSubTabs) for the air/space domains —
    // so once 'air' is excluded, the domain here is always 'space'.
    /* v8 ignore start -- unreachable given the sub-tab rail gating; see above */
    if (activeDomain.value === 'space') spaceStore.setSpaceFilterCategory(id)
    /* v8 ignore stop */
  }
}

// If replay gets disabled while the REPLAY tab is active, fall back to SEARCH so
// the now-hidden pane isn't left showing.
watch(
  () => airStore.replayEnabled,
  (enabled) => {
    if (!enabled && activeTab.value === 'playback') setTab('search')
  },
)

// Change the active tab without altering the panel's open/closed state.
function setTab(tab: SidebarTab) {
  activeTab.value = tab
  _persistTab(tab)
  if (tab === 'alerts') notifStore.openPanel()
  else notifStore.closePanel()
  document.dispatchEvent(new CustomEvent('msb-tab-switch', { detail: tab }))
}

function switchTab(tab: SidebarTab) {
  if (!open.value) {
    open.value = true
    _persistOpen(true)
  }
  setTab(tab)
}

// Rail-tab click: toggle the panel. Clicking the already-open tab closes the
// drawer (collapsing the FILTER sub-tabs with it); any other click opens/switches.
function toggleRailTab(tab: SidebarTab) {
  if (activeTab.value === tab && open.value) hide()
  else switchTab(tab)
}

function toggle() {
  open.value = !open.value
  _persistOpen(open.value)
}

function show() {
  open.value = true
  _persistOpen(true)
}
function hide() {
  open.value = false
  _persistOpen(false)
}

function openPlaybackTab() {
  show()
  switchTab('playback')
}

// The SDR route force-opens the panel to show the radio tab. Remember whether the
// panel was open *before* that, so leaving SDR restores the prior state rather
// than unconditionally closing it (otherwise an open panel in Space would be lost
// on a Space → SDR → Space round-trip).
let _openBeforeRadio = false
function openRadioTab() {
  _openBeforeRadio = open.value
  show()
  switchTab('radio')
}
// Called when navigating away from the SDR route. Restore the panel's pre-SDR
// open state (the entering section's tab is restored by the domain-changed
// handler; the 'radio' tab itself is never persisted).
function closeRadioTab() {
  if (_openBeforeRadio) show()
  else hide()
}

function _persistOpen(val: boolean) {
  try {
    if (val) sessionStorage.setItem(SS_KEY, '1')
    else sessionStorage.removeItem(SS_KEY)
  } catch {}
  document.dispatchEvent(new CustomEvent('sentinel:sidebar-state', { detail: { open: val } }))
}

function _readTabMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SS_TAB_MAP_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, string>
  } catch {}
  return {}
}

function _persistTab(tab: SidebarTab) {
  // 'radio' is transient (driven by the SDR route), so never store it — doing so
  // would shadow the SDR section's real saved tab. Record under the current domain.
  if (tab === 'radio') return
  try {
    const map = _readTabMap()
    if (tab === 'search')
      delete map[_activeDomain] // 'search' is the default
    else map[_activeDomain] = tab
    localStorage.setItem(SS_TAB_MAP_KEY, JSON.stringify(map))
  } catch {}
}

function _restoreOpen(): boolean {
  try {
    return sessionStorage.getItem(SS_KEY) === '1'
  } catch {
    return false
  }
}

function _restoreTab(domain: string): SidebarTab {
  const saved = _readTabMap()[domain]
  if (!saved || !(VALID_TABS as readonly string[]).includes(saved)) return 'search'
  const required = DOMAIN_SPECIFIC_TABS[saved]
  if (required && required !== domain) return 'search' // defensive
  // REPLAY is hidden when air replay recording is off — don't restore into it.
  if (saved === 'playback' && !airStore.replayEnabled) return 'search'
  return saved as SidebarTab
}

useDocumentEvent('sentinel:sdr-open-panel', () => {
  show()
})
useDocumentEvent('sentinel:sdr-toggle-panel', () => {
  toggle()
})

// Air-domain airport / aircraft marker click: open the panel on the SEARCH tab
// so the accordion (AirFilter) is visible.
useDocumentEvent('air-open-airport', () => {
  switchTab('search')
})
useDocumentEvent('air-open-aircraft', () => {
  switchTab('search')
})

useDocumentEvent('sentinel:domain-changed', (e: Event) => {
  const { domain } = (e as CustomEvent<{ domain: string; prev: string }>).detail
  _activeDomain = domain
  activeDomain.value = domain
  // SDR is special: its 'radio' tab is applied by App.vue's isSdrRoute watch, so
  // don't touch activeTab here (closeRadioTab handles leaving SDR).
  if (domain === 'sdr') return
  // Restore the tab this section was last left on (Space → 'passes', Air →
  // 'playback', else 'search'). This makes per-section tab memory work on in-app
  // navigation. Panel open/closed state is left untouched.
  setTab(_restoreTab(domain))
})

defineExpose({
  switchTab,
  openPlaybackTab,
  openRadioTab,
  closeRadioTab,
  show,
  hide,
  toggle,
  open,
  activeTab,
})
</script>

<style>
#radio-mini-btn {
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 1;
  transition:
    background 0.2s,
    opacity 0.2s,
    color 0.2s;
  flex-shrink: 0;
  margin: 4px 0;
  position: relative;
}

#radio-mini-btn:hover {
  background: var(--color-border);
  border-radius: 6px;
  opacity: 1;
}

#radio-mini-btn.radio-mini-btn-active {
  opacity: 1;
  color: var(--color-accent);
  background: rgba(200, 255, 0, 0.08);
  border-radius: 6px;
}

#radio-mini-btn[data-tooltip]::before {
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
  z-index: 10001;
}

#radio-mini-btn[data-tooltip]:hover::before {
  opacity: 1;
}
#radio-mini-btn.radio-mini-btn-active[data-tooltip]::before {
  opacity: 0 !important;
}

/* Footer edge toggles: the left one shows/hides the map sidebar; the right one
   (#side-menu-btn, Air/Space only) shows/hides the map's right controls rail.
   They share styling — both are dim icon buttons that brighten on hover/active. */
#map-sidebar-btn,
#side-menu-btn {
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0.6;
  transition:
    background 0.2s,
    opacity 0.2s;
  flex-shrink: 0;
  margin: 4px 0;
  position: relative;
}

#map-sidebar-btn:hover,
#side-menu-btn:hover {
  background: var(--color-border);
  border-radius: 6px;
  opacity: 1;
}

#map-sidebar-btn.msb-btn-active,
#side-menu-btn.msb-btn-active {
  opacity: 1;
  color: #fff;
  border-radius: 6px;
}

/* Align the footer's edge buttons with the vertical rail columns: the
   side-panel button under the 44px left rail (#map-sidebar-rail), and — on
   Air/Space — the side-menu toggle under the 44px right rail (#side-menu).
   On views without a right rail the settings button is the right-most element. */
#footer {
  padding-left: 0;
  padding-right: 0;
}

#footer-left {
  gap: 0;
}

#footer-left > #map-sidebar-btn {
  width: 44px;
  margin: 0;
  flex-shrink: 0;
}

#footer-right > #settings-btn,
#footer-right > #side-menu-btn {
  width: 44px;
  margin: 0;
  flex-shrink: 0;
}

/* The right rail's footer toggle is only offered on small screens, where map
   space is scarce. On wider screens (≥769px) the rail always shows, so the
   toggle is hidden — matching the ≤768px gate on the rail's collapsed state. */
@media (min-width: 769px) {
  #footer-right > #side-menu-btn {
    display: none;
  }
}

#map-sidebar-btn[data-tooltip]::before {
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
  z-index: 10001;
}

#map-sidebar-btn[data-tooltip]:hover::before {
  opacity: 1;
}
#map-sidebar-btn.msb-btn-active[data-tooltip]::before {
  opacity: 0 !important;
}

#map-sidebar-rail {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 0;
  width: 44px;
  background: rgba(10, 13, 20, 0.98);
  z-index: 1003;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0;
  box-sizing: border-box;
}

/* Rail button chrome (size, colour, hover/active, tooltip, pulse) now lives in
   the BaseIconButton atom (see src/components/base/BaseIconButton.vue); the
   `.msb-rail-btn`/`.msb-rail-btn-active`/`.msb-rail-btn-pulse`/`.msb-rail-subbtn`
   classes above remain on the rendered buttons (passed through to the atom)
   purely so the selectors below and existing tests can still target them. */

body:not([data-domain='space']) #map-sidebar-rail .msb-rail-btn[data-tab='passes'] {
  display: none;
}

body:not([data-domain='air']) #map-sidebar-rail .msb-rail-btn[data-tab='playback'] {
  display: none;
}

body[data-domain='sdr'] #map-sidebar-rail {
  display: none;
}

#map-sidebar {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 44px;
  width: 386px;
  /* Lighter charcoal than the icon rail (which stays rgba(10, 13, 20)) so the
     open panel reads as a distinct layer next to the minimised menu. */
  background: rgba(21, 23, 29, 0.98);
  border-right: none;
  z-index: 1002;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  transform: translateX(0);
  transition: transform 0.2s ease;
}

#map-sidebar.msb-hidden {
  transform: translateX(calc(-100% - 44px));
}

body[data-domain='sdr'] #map-sidebar {
  left: 44px;
}

#msb-pane-playback {
  overflow-y: auto;
  scrollbar-width: none;
  flex-direction: column;
}

#msb-pane-playback::-webkit-scrollbar {
  display: none;
}

#msb-pane-radio {
  overflow-y: auto;
  scrollbar-width: none;
  flex-direction: column;
}

#msb-pane-radio::-webkit-scrollbar {
  display: none;
}

#map-sidebar-panes {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.msb-pane {
  display: none;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.msb-pane.msb-pane-active {
  display: flex;
}

#msb-pane-search {
  overflow: hidden;
}

#msb-pane-search #filter-input-wrap,
#msb-pane-search #space-filter-input-wrap {
  flex-shrink: 0;
}

#msb-pane-search #filter-results,
#msb-pane-search #space-filter-results {
  flex: 1;
  max-height: none;
  overflow-y: auto;
  scrollbar-width: none;
}

#msb-pane-search #filter-results::-webkit-scrollbar,
#msb-pane-search #space-filter-results::-webkit-scrollbar {
  display: none;
}

#msb-pane-alerts {
  overflow: hidden;
}

#msb-pane-alerts #notif-footer {
  flex-shrink: 0;
  width: auto;
  pointer-events: all;
}

#msb-pane-alerts #notif-list-wrap {
  flex: 1;
  min-height: 0;
  visibility: visible;
  opacity: 1;
  pointer-events: all;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: hidden;
}

#msb-pane-alerts #notif-list {
  flex: 1;
  width: auto;
  max-height: none;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 0;
  align-items: stretch;
}

#msb-pane-alerts #notif-list::-webkit-scrollbar {
  display: none;
}

#msb-pane-alerts .notif-item {
  width: 100%;
}

#msb-pane-alerts .notif-item:first-child {
  margin-top: 16px;
}

#msb-pane-alerts #notif-scroll-hint {
  flex-shrink: 0;
  flex: 1;
}

#msb-alerts-empty {
  padding: 20px 14px;
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.18);
  text-align: center;
  width: 100%;
}

#msb-pane-tracking {
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
  padding-top: 13px;
}

#msb-pane-tracking::-webkit-scrollbar {
  display: none;
}

#msb-tracking-empty {
  padding: 7px 14px;
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.18);
  text-align: center;
}

#msb-map-controls {
  display: flex;
  flex-shrink: 0;
  padding: 6px 10px;
  gap: 6px;
  border-bottom: 1px solid var(--color-border);
}

#msb-tracks-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 28px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

#msb-tracks-btn:hover {
  color: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.25);
}

#msb-tracks-btn.msb-tracks-btn-active {
  color: var(--color-accent);
  border-color: rgba(200, 255, 0, 0.3);
  background: rgba(200, 255, 0, 0.06);
}

/* ---- Mobile-only close affordance — hidden on desktop ---- */
.msb-mobile-close {
  display: none;
  position: absolute;
  top: 6px;
  right: 8px;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
  z-index: 5;
  padding: 0;
}
.msb-mobile-close:hover {
  color: #fff;
}

/* ---- ≤768px: panel becomes full-width drawer ---- */
@media (max-width: 768px) {
  #map-sidebar {
    left: 44px;
    width: auto;
    right: 0;
  }
  /* Air & Space render a 44px right-edge control rail above the sidebar; keep the
     drawer clear of it so the rail can't cover the drawer's close button.
     !important: the ≤480 `#map-sidebar { right: 0 }` rule below otherwise wins
     despite this rule's higher specificity (the bundled sheet repeats the
     MapSidebar block, so a later same-specificity copy re-asserts right: 0). */
  body[data-domain='air'] #map-sidebar,
  body[data-domain='space'] #map-sidebar {
    right: 44px !important;
  }
  .msb-mobile-close {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ---- ≤480px: the tab rail stays a LEFT vertical strip ----
   It mirrors the Settings panel's left icon nav (#settings-sidebar): a vertical
   44px rail on the left, shown alongside the drawer (not relocated to a bottom
   bar). The rail + panel belong to the drawer — both appear when it's open and
   slide off the left edge when closed, leaving a clean footer bar over the map.
   The rail keeps its base vertical layout (top:nav…bottom:footer, column), so we
   only gate its visibility and size the panel beside it here. */
@media (max-width: 480px) {
  #map-sidebar-rail {
    display: none;
  }
  body[data-sidebar-open] #map-sidebar-rail {
    display: flex;
  }
  /* Panel fills the width to the right of the 44px rail. The air/space selectors
     override the ≤768px 44px right gutter — the right map-control rail is hidden
     while the drawer is open at this size, so the panel takes the full width. */
  #map-sidebar,
  body[data-domain='air'] #map-sidebar,
  body[data-domain='space'] #map-sidebar {
    left: 44px !important;
    right: 0 !important;
    width: auto !important;
    top: var(--nav-height);
    bottom: var(--footer-height);
  }
  /* Hidden: slide fully off the left edge (past the rail) so nothing bleeds. */
  #map-sidebar.msb-hidden {
    transform: translateX(calc(-100% - 44px));
  }
  /* SDR has its own 44px left rail (#sdr-sidebar-rail), so its drawer sits beside
     it — left: 0 would slide the panel under the rail and crop the content. */
  body[data-domain='sdr'] #map-sidebar {
    left: 44px !important;
    right: 0 !important;
    width: auto !important;
    top: var(--nav-height);
    bottom: var(--footer-height);
  }
}
</style>
