<template>
  <div
    v-if="!hideTabs"
    id="map-sidebar-rail"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="msb-rail-btn"
      :class="{
        'msb-rail-btn-active': activeTab === tab.id && open,
        'msb-rail-btn-pulse': tab.id === 'alerts' && hasUnread,
      }"
      :data-tab="tab.id"
      :data-tooltip="tab.label"
      :aria-label="tab.label"
      @click="switchTab(tab.id)"
    >
      <!-- search -->
      <svg v-if="tab.id === 'search'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.8"/>
        <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="1.8"/>
      </svg>
      <!-- alerts -->
      <svg v-else-if="tab.id === 'alerts'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2C8 2 5 5 5 9v6H3v2h18v-2h-2V9c0-4-3-7-7-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" fill="none"/>
      </svg>
      <!-- tracking -->
      <svg v-else-if="tab.id === 'tracking'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
        <circle cx="12" cy="9" r="2.2" fill="currentColor"/>
      </svg>
      <!-- passes -->
      <svg v-else-if="tab.id === 'passes'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linecap="round">
        <path d="M2 22 C4 14, 10 6, 14 2"   stroke="currentColor" stroke-width="1.6"/>
        <path d="M10 22 C12 14, 18 6, 22 2" stroke="currentColor" stroke-width="1.6"/>
        <path d="M18 22 C20 17, 24 12, 26 9" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <!-- playback / replay -->
      <svg v-else-if="tab.id === 'playback'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 12 A8 8 0 1 1 16.5 5.4" stroke="currentColor" stroke-width="1.8" fill="none"/>
        <polyline points="20,2 20,6 16,6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="miter"/>
        <polygon points="9.5,8 9.5,16 16,12" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <div id="map-sidebar" :class="{ 'msb-hidden': !open }">
    <div id="map-sidebar-panes">
      <template v-if="!hideTabs">
        <div class="msb-pane" :class="{ 'msb-pane-active': activeTab === 'search' }" id="msb-pane-search">
          <slot name="search" />
        </div>
        <div class="msb-pane" :class="{ 'msb-pane-active': activeTab === 'alerts' }" id="msb-pane-alerts">
          <NotificationsPanel />
        </div>
        <div class="msb-pane" :class="{ 'msb-pane-active': activeTab === 'tracking' }" id="msb-pane-tracking">
          <TrackingPanel />
        </div>
        <div class="msb-pane" :class="{ 'msb-pane-active': activeTab === 'passes' }" id="msb-pane-passes">
          <slot name="passes" />
        </div>
        <div class="msb-pane" :class="{ 'msb-pane-active': activeTab === 'playback' }" id="msb-pane-playback">
          <slot name="playback" />
        </div>
      </template>
      <div class="msb-pane msb-pane-radio" :class="{ 'msb-pane-active': hideTabs || activeTab === 'radio' }" id="msb-pane-radio">
        <slot name="radio" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import NotificationsPanel from './NotificationsPanel.vue'
import TrackingPanel from './TrackingPanel.vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useNotificationsStore } from '@/stores/notifications'

const notifStore = useNotificationsStore()
const hasUnread = computed(() => notifStore.unreadCount > 0)

const DOMAIN_SPECIFIC_TABS: Record<string, string> = {
  passes:   'space',
  playback: 'air',
  radio:    'sdr',
}

withDefaults(defineProps<{ hideTabs?: boolean }>(), { hideTabs: false })

type SidebarTab = 'search' | 'alerts' | 'tracking' | 'passes' | 'playback' | 'radio'

const SS_KEY = 'sentinel_sidebar_open'
const SS_TAB_KEY = 'sentinel_sidebar_tab'

const open = ref(_restoreOpen())
const activeTab = ref<SidebarTab>(_restoreTab())

const tabs = computed(() => [
  { id: 'search' as SidebarTab,   label: 'SEARCH' },
  { id: 'alerts' as SidebarTab,   label: 'ALERTS' },
  { id: 'tracking' as SidebarTab, label: 'TRACKING' },
  { id: 'passes' as SidebarTab,   label: 'PASSES' },
  { id: 'playback' as SidebarTab, label: 'REPLAY' },
])

function switchTab(tab: SidebarTab) {
  activeTab.value = tab
  if (!open.value) { open.value = true; _persistOpen(true) }
  _persistTab(tab)
  tab === 'alerts' ? notifStore.openPanel() : notifStore.closePanel()
  document.dispatchEvent(new CustomEvent('msb-tab-switch', { detail: tab }))
}

function toggle() {
  open.value = !open.value
  _persistOpen(open.value)
}

function show() { open.value = true; _persistOpen(true) }
function hide() { open.value = false; _persistOpen(false) }

function openPlaybackTab() { show(); switchTab('playback') }
function openRadioTab() { show(); switchTab('radio') }
function closeRadioTab() {
  if (activeTab.value === 'radio') {
    switchTab('search')
    hide()
  }
}

function _persistOpen(val: boolean) {
  try { val ? sessionStorage.setItem(SS_KEY, '1') : sessionStorage.removeItem(SS_KEY) } catch {}
}

function _persistTab(tab: SidebarTab) {
  try {
    tab === 'radio' ? sessionStorage.setItem(SS_TAB_KEY, tab) : sessionStorage.removeItem(SS_TAB_KEY)
  } catch {}
}

function _restoreOpen(): boolean {
  try { return sessionStorage.getItem(SS_KEY) === '1' } catch { return false }
}

function _restoreTab(): SidebarTab {
  try {
    const saved = sessionStorage.getItem(SS_TAB_KEY)
    if (saved === 'radio') return 'radio'
  } catch {}
  return 'search'
}

useDocumentEvent('sentinel:domain-changed', (e: Event) => {
  const { domain } = (e as CustomEvent<{ domain: string; prev: string }>).detail
  const required = DOMAIN_SPECIFIC_TABS[activeTab.value]
  if (required && required !== domain) {
    switchTab('search')
  }
})

defineExpose({ switchTab, openPlaybackTab, openRadioTab, closeRadioTab, show, hide, toggle, open, activeTab })
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
    transition: background 0.2s, opacity 0.2s, color 0.2s;
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

#radio-mini-btn[data-tooltip]:hover::before { opacity: 1; }
#radio-mini-btn.radio-mini-btn-active[data-tooltip]::before { opacity: 0 !important; }

#map-sidebar-btn {
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
    transition: background 0.2s, opacity 0.2s;
    flex-shrink: 0;
    margin: 4px 0;
    position: relative;
}

#map-sidebar-btn:hover {
    background: var(--color-border);
    border-radius: 6px;
    opacity: 1;
}

#map-sidebar-btn.msb-btn-active {
    opacity: 1;
    color: var(--color-accent);
    background: rgba(200, 255, 0, 0.08);
    border-radius: 6px;
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

#map-sidebar-btn[data-tooltip]:hover::before { opacity: 1; }
#map-sidebar-btn.msb-btn-active[data-tooltip]::before { opacity: 0 !important; }

/* Align footer side-panel button with the vertical rail column */
#footer {
    padding-left: 0;
}

#footer-left {
    gap: 0;
}

#footer-left > #map-sidebar-btn {
    width: 44px;
    height: 28px;
    margin: 0;
    border-radius: 0;
    opacity: 1;
}

#footer-left > #map-sidebar-btn:hover {
    border-radius: 0;
    background: var(--color-border);
}

#footer-left > #map-sidebar-btn.msb-btn-active {
    border-radius: 0;
}

#map-sidebar-rail {
    position: fixed;
    top: var(--nav-height);
    bottom: var(--footer-height);
    left: 0;
    width: 44px;
    background: rgba(10, 13, 20, 0.98);
    border-right: 1px solid var(--color-border);
    z-index: 1003;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
}

.msb-rail-btn {
    height: 40px;
    width: 100%;
    background: none;
    border: none;
    border-left: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
    position: relative;
    flex-shrink: 0;
}

.msb-rail-btn:hover {
    color: var(--color-text-muted);
    background: var(--color-border);
}

.msb-rail-btn.msb-rail-btn-active {
    color: var(--color-accent);
    background: rgba(200, 255, 0, 0.08);
    border-left-color: var(--color-accent);
}

@keyframes msb-alert-pulse {
    0%   { color: #fff; }
    50%  { color: var(--color-accent); }
    100% { color: #fff; }
}

.msb-rail-btn.msb-rail-btn-pulse:not(.msb-rail-btn-active) {
    animation: msb-alert-pulse 1.2s ease-in-out infinite;
}

.msb-rail-btn[data-tooltip]::before {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 6px);
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

.msb-rail-btn[data-tooltip]:hover::before { opacity: 1; }

body:not([data-domain="space"]) #map-sidebar-rail .msb-rail-btn[data-tab="passes"] {
    display: none;
}

body:not([data-domain="air"]) #map-sidebar-rail .msb-rail-btn[data-tab="playback"] {
    display: none;
}

body[data-domain="sdr"] #map-sidebar-rail {
    display: none;
}

#map-sidebar {
    position: fixed;
    top: var(--nav-height);
    bottom: var(--footer-height);
    left: 44px;
    width: 386px;
    background: rgba(10, 13, 20, 0.98);
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

body[data-domain="sdr"] #map-sidebar {
    left: 0;
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
    transition: color 0.15s, border-color 0.15s, background 0.15s;
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
</style>
