<template>
  <div id="map-sidebar" :class="{ 'msb-hidden': !open }">
    <div id="map-sidebar-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="msb-tab"
        :class="{ 'msb-tab-active': activeTab === tab.id }"
        :data-tab="tab.id"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
        <span
          v-if="tab.badge !== undefined && tab.badge > 0"
          class="msb-tab-badge msb-badge-active"
        >{{ tab.badge }}</span>
      </button>
    </div>
    <div id="map-sidebar-panes">
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
      <div class="msb-pane msb-pane-radio" :class="{ 'msb-pane-active': activeTab === 'radio' }" id="msb-pane-radio">
        <slot name="radio" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTrackingStore } from '@/stores/tracking'
import NotificationsPanel from './NotificationsPanel.vue'
import TrackingPanel from './TrackingPanel.vue'

type SidebarTab = 'search' | 'alerts' | 'tracking' | 'passes' | 'radio'

const SS_KEY = 'sentinel_sidebar_open'
const SS_TAB_KEY = 'sentinel_sidebar_tab'

const notificationsStore = useNotificationsStore()
const trackingStore = useTrackingStore()

const open = ref(_restoreOpen())
const activeTab = ref<SidebarTab>(_restoreTab())

const tabs = computed(() => [
  { id: 'search' as SidebarTab,   label: 'SEARCH',   badge: undefined },
  { id: 'alerts' as SidebarTab,   label: 'ALERTS',   badge: notificationsStore.unreadCount },
  { id: 'tracking' as SidebarTab, label: 'TRACKING', badge: trackingStore.count },
  { id: 'passes' as SidebarTab,   label: 'PASSES',   badge: undefined },
  { id: 'radio' as SidebarTab,    label: 'RADIO',    badge: undefined },
])

function switchTab(tab: SidebarTab) {
  activeTab.value = tab
  if (!open.value) { open.value = true; _persistOpen(true) }
  _persistTab(tab)
}

function toggle() {
  open.value = !open.value
  _persistOpen(open.value)
}

function show() { open.value = true; _persistOpen(true) }
function hide() { open.value = false; _persistOpen(false) }

function openRadioTab() { show(); switchTab('radio') }

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

defineExpose({ switchTab, openRadioTab, show, hide, toggle, open, activeTab })
</script>
