<template>
  <div id="settings-panel" :class="{ 'settings-panel-visible': store.open }">
    <div id="settings-sidebar">
      <div
        v-for="s in visibleSections"
        :key="s.key"
        class="settings-nav-item"
        :class="{ active: activeSection === s.key }"
        @click="selectSection(s.key)"
      >{{ s.label }}</div>
    </div>

    <div id="settings-content">
      <div id="settings-section-heading">{{ sectionHeading }}</div>

      <div id="settings-search-wrap" :class="{ 'settings-search-wrap--hidden': activeSection !== 'app' && !searchQuery }">
        <div id="settings-search-inner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <input
            id="settings-search-input"
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="SEARCH SETTINGS"
            autocomplete="off"
            spellcheck="false"
            @keydown.escape="store.closePanel()"
          >
          <button
            id="settings-search-clear"
            aria-label="Clear search"
            :class="{ 'settings-search-clear-visible': searchQuery.length > 0 }"
            @click="clearSearch"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="settings-body">
        <!-- Search results -->
        <template v-if="searchQuery.trim()">
          <template v-if="searchResults.length === 0">
            <div class="settings-empty">No results found</div>
          </template>
          <template v-else>
            <template v-for="group in searchResultGroups" :key="group.section">
              <div class="settings-section-label">{{ group.sectionLabel }}</div>
              <SettingRow
                v-for="item in group.items"
                :key="item.id"
                :item="item"
                :pending="pending"
                @stage="stagePending"
                @commit="commitAll"
              />
            </template>
          </template>
        </template>

        <!-- Section items -->
        <template v-else>
          <template v-if="currentSectionItems.length === 0">
            <div class="settings-empty">Settings coming soon</div>
          </template>
          <template v-else>
            <template v-for="(item, idx) in currentSectionItems" :key="item.id">
              <div
                v-if="item.groupLabel !== undefined && item.groupLabel !== currentSectionItems[idx - 1]?.groupLabel"
                class="settings-group-label"
                :class="{ 'settings-group-label--spaced': idx > 0 }"
              >{{ item.groupLabel }}</div>
              <SettingRow
                :item="item"
                :pending="pending"
                @stage="stagePending"
                @commit="commitAll"
              />
            </template>
          </template>
        </template>
      </div>

      <div id="settings-footer" v-show="activeSection !== 'sdr' && !searchQuery.trim()">
        <span id="settings-apply-status" :class="applyStatusClass">{{ applyStatusMsg }}</span>
        <button id="settings-apply-btn" @click="commitAll">APPLY CHANGES</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import './SettingsPanel.css'
import { ref, computed, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import * as settingsApi from '@/services/settingsApi'
import SettingRow from './settings/SettingRow.vue'

const store = useSettingsStore()
const appStore = useAppStore()

const activeSection = ref('app')
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const pending = ref<Map<string, () => Promise<unknown> | void>>(new Map())
const applyStatusMsg = ref('')
const applyStatusClass = ref('')

interface NavSection { key: string; label: string }
const NAV_SECTIONS: NavSection[] = [
  { key: 'app',   label: 'App Settings' },
  { key: 'air',   label: 'AIR' },
  { key: 'space', label: 'SPACE' },
  { key: 'sea',   label: 'SEA' },
  { key: 'land',  label: 'LAND' },
  { key: 'sdr',   label: 'SDR' },
]

export interface SettingItem {
  section: string
  sectionLabel: string
  id: string
  label: string
  desc: string
  groupLabel?: string
  type: string
  // type-specific props
  ns?: string
  defaultUrl?: string
}

const ALL_SETTINGS: SettingItem[] = [
  { section: 'app', sectionLabel: 'App Settings', id: 'connectivity-mode', label: 'Connectivity Mode', desc: 'Use online or off grid data sources across the app', type: 'connectivity-toggle' },
  { section: 'app', sectionLabel: 'App Settings', id: 'app-connectivity-probe', label: 'Connectivity Probe URL', desc: 'URL polled every 2 seconds to detect internet access', type: 'probe-url' },
  { section: 'app', sectionLabel: 'App Settings', id: 'location', label: 'My Location', desc: 'Set a fixed latitude / longitude for your position', type: 'location' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-overhead-alerts', label: 'Overhead Aircraft Alerts', desc: 'Notify when aircraft are within range of your location, and show the zone on the map', type: 'overhead-alerts-toggle', groupLabel: 'ALERTS' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-overhead-alert-radius', label: 'Overhead Alert Radius', desc: 'Distance from your location (in nautical miles) used to trigger overhead aircraft alerts and define the zone shown on the map', type: 'overhead-alert-radius' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-tag-fields', label: 'Label Data Points', desc: 'Choose which data fields appear on aircraft labels for civil and military aircraft', type: 'air-tag-fields', groupLabel: 'LABELS' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-source-override', label: 'Source Override', desc: 'Override the app-level connectivity mode for this domain', type: 'source-override', ns: 'air', groupLabel: 'DATA SOURCES' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-online-source', label: 'Online Data Source', desc: 'URL for live air data feed', type: 'online-source', ns: 'air', defaultUrl: 'https://api.airplanes.live/v2' },
  { section: 'air', sectionLabel: 'AIR', id: 'air-offline-source', label: 'Off Grid Data Source', desc: 'Local server URL and port for air data', type: 'offline-source', ns: 'air', defaultUrl: '' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-online-source', label: 'Online Data Source', desc: 'URL to fetch TLE data from — select a category and click UPDATE TLE', type: 'space-tle-online', groupLabel: 'DATA SOURCES' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-manual-tle', label: 'TLE Import', desc: 'Upload a .txt file of TLE data', type: 'space-tle-manual' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-tle-database', label: 'TLE Database', desc: 'Satellite count, sources, and per-category last-updated times', type: 'space-tle-db' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-tle-uncategorised', label: 'Uncategorised Satellites', desc: 'Assign categories to satellites imported without one', type: 'space-tle-uncat' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-tle-satlist', label: 'Satellite List', desc: 'Full list of all TLE records stored in the database', type: 'space-tle-satlist' },
  { section: 'space', sectionLabel: 'SPACE', id: 'space-filter-hover-preview', label: 'Filter Hover Behaviour', desc: 'When hovering over a satellite in the search results, choose whether the map stays in place or flies to that satellite', type: 'space-hover-preview', groupLabel: 'FILTER HOVER' },
  { section: 'sea', sectionLabel: 'SEA', id: 'sea-source-override', label: 'Source Override', desc: 'Override the app-level connectivity mode for this domain', type: 'source-override', ns: 'sea' },
  { section: 'sea', sectionLabel: 'SEA', id: 'sea-online-source', label: 'Online Data Source', desc: 'URL for live sea data feed', type: 'online-source', ns: 'sea', defaultUrl: '' },
  { section: 'sea', sectionLabel: 'SEA', id: 'sea-offline-source', label: 'Off Grid Data Source', desc: 'Local server URL and port for sea data', type: 'offline-source', ns: 'sea', defaultUrl: '' },
  { section: 'land', sectionLabel: 'LAND', id: 'land-source-override', label: 'Source Override', desc: 'Override the app-level connectivity mode for this domain', type: 'source-override', ns: 'land' },
  { section: 'land', sectionLabel: 'LAND', id: 'land-online-source', label: 'Online Data Source', desc: 'URL for live land data feed', type: 'online-source', ns: 'land', defaultUrl: '' },
  { section: 'land', sectionLabel: 'LAND', id: 'land-offline-source', label: 'Off Grid Data Source', desc: 'Local server URL and port for land data', type: 'offline-source', ns: 'land', defaultUrl: '' },
  { section: 'sdr', sectionLabel: 'SDR', id: 'sdr-devices', label: 'SDR Devices', desc: 'Configure RTL-SDR devices reachable via rtl_tcp', type: 'sdr-devices' },
  { section: 'sdr', sectionLabel: 'SDR', id: 'sdr-chirp-import', label: 'Frequency Import', desc: 'Drop a Sentinel .json file to populate the frequency manager', type: 'sdr-chirp-import' },
  { section: 'app', sectionLabel: 'App Settings', id: 'config-current', label: 'Application Config', desc: 'Settings currently stored in the database', type: 'config-current' },
]

const DOMAIN_SECTIONS = new Set(['air', 'space', 'sea', 'land', 'sdr'])
const visibleSections = computed(() =>
  NAV_SECTIONS.filter(s => !DOMAIN_SECTIONS.has(s.key) || appStore.enabledDomains.includes(s.key))
)

const sectionHeading = computed(() => {
  if (searchQuery.value.trim()) return 'SEARCH RESULTS'
  const s = NAV_SECTIONS.find(n => n.key === activeSection.value)
  if (!s) return activeSection.value
  return s.key === 'app' ? s.label : s.label + ' SETTINGS'
})

const currentSectionItems = computed(() =>
  ALL_SETTINGS.filter(s => s.section === activeSection.value)
)

const searchResults = computed<SettingItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return ALL_SETTINGS.filter(s =>
    (!DOMAIN_SECTIONS.has(s.section) || appStore.enabledDomains.includes(s.section)) &&
    (s.label.toLowerCase().includes(q) ||
    s.desc.toLowerCase().includes(q) ||
    s.sectionLabel.toLowerCase().includes(q))
  )
})

const searchResultGroups = computed(() => {
  const groups: Record<string, { section: string; sectionLabel: string; items: SettingItem[] }> = {}
  const order: string[] = []
  searchResults.value.forEach(item => {
    if (!groups[item.section]) {
      groups[item.section] = { section: item.section, sectionLabel: item.sectionLabel, items: [] }
      order.push(item.section)
    }
    groups[item.section].items.push(item)
  })
  return order.map(k => groups[k])
})

function selectSection(key: string): void {
  activeSection.value = key
  searchQuery.value = ''
  pending.value.clear()
}

function clearSearch(): void {
  searchQuery.value = ''
  searchInputRef.value?.focus()
}

function stagePending(id: string, fn: () => Promise<unknown> | void): void {
  pending.value.set(id, fn)
}

function showApplyStatus(msg: string, isError: boolean): void {
  applyStatusMsg.value = msg
  applyStatusClass.value = isError ? 'settings-apply-status--error' : 'settings-apply-status--ok'
  setTimeout(() => {
    applyStatusMsg.value = ''
    applyStatusClass.value = ''
  }, 2500)
}

async function commitAll(): Promise<void> {
  if (pending.value.size === 0) {
    showApplyStatus('NO CHANGES', false)
    return
  }
  const promises: Promise<unknown>[] = []
  let hasError = false
  pending.value.forEach(fn => {
    try {
      const result = fn()
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        promises.push(result as Promise<unknown>)
      }
    } catch {
      hasError = true
    }
  })
  if (hasError) { showApplyStatus('ERROR', true); return }
  try {
    await Promise.all(promises)
  } catch {
    showApplyStatus('ERROR', true)
    return
  }
  pending.value.clear()
  showApplyStatus('SAVED', false)
  setTimeout(() => {
    try { sessionStorage.setItem('sentinel_settings_reopen', activeSection.value) } catch {}
    location.reload()
  }, 400)
}

watch(() => store.open, (isOpen) => {
  if (isOpen) {
    setTimeout(() => searchInputRef.value?.focus(), 50)
    if (store.activeSection) {
      activeSection.value = store.activeSection
    }
    try {
      const reopenSection = sessionStorage.getItem('sentinel_settings_reopen')
      if (reopenSection) {
        sessionStorage.removeItem('sentinel_settings_reopen')
        activeSection.value = reopenSection
      }
    } catch {}
  } else {
    searchQuery.value = ''
    pending.value.clear()
  }
})

window.addEventListener('sentinel:locationChanged', (e: Event) => {
  if (!store.open || activeSection.value !== 'app') return
  const detail = (e as CustomEvent).detail as { longitude: number; latitude: number }
  pending.value.delete('location')
  window.dispatchEvent(new CustomEvent('settings:locationSynced', { detail }))
})
</script>

