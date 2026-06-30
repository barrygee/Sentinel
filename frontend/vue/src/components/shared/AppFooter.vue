<template>
  <footer id="footer">
    <div id="footer-left">
      <button
        id="map-sidebar-btn"
        :aria-label="sidebarToggleLabel"
        :class="{ 'msb-btn-active': sidePanelOpen }"
        @click="onToggleSidePanel"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect
            x="1.5"
            y="1.5"
            width="12"
            height="12"
            rx="1"
            stroke="currentColor"
            stroke-width="1.1"
          />
          <line x1="5.5" y1="1.5" x2="5.5" y2="13.5" stroke="currentColor" stroke-width="1.1" />
        </svg>
      </button>
    </div>

    <div id="footer-center"></div>

    <div id="footer-right">
      <div
        v-if="sdrIndicatorVisible"
        id="footer-sdr"
        class="footer-sdr"
        role="status"
        :aria-label="sdrIndicatorAriaLabel"
      >
        <span class="footer-code footer-sdr-freq">{{ sdrFreqDisplay }}</span>
        <span v-if="sdrFreqName" class="footer-code footer-sdr-name">{{ sdrFreqName }}</span>
      </div>
      <button
        id="settings-btn"
        aria-label="Settings"
        data-tooltip="SETTINGS"
        @click="settingsStore.togglePanel()"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6.18 1.5h2.64l.38 1.52a5 5 0 0 1 1.1.64l1.5-.5 1.32 2.28-1.16 1.03a5.06 5.06 0 0 1 0 1.26l1.16 1.03-1.32 2.28-1.5-.5a5 5 0 0 1-1.1.64l-.38 1.52H6.18l-.38-1.52a5 5 0 0 1-1.1-.64l-1.5.5L1.88 9.26l1.16-1.03a5.06 5.06 0 0 1 0-1.26L1.88 5.94 3.2 3.66l1.5.5a5 5 0 0 1 1.1-.64L6.18 1.5Z"
            stroke="currentColor"
            stroke-width="1.1"
            stroke-linejoin="round"
          />
          <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" stroke-width="1.1" />
        </svg>
      </button>
      <!-- Mirrors the left side-panel button, but for the map's right-edge
           controls rail. Only the Air/Space views have that rail, so the button
           is absent on SDR and while the (full-screen) settings panel is open. -->
      <button
        v-if="rightMenuAvailable"
        id="side-menu-btn"
        :aria-label="sideMenuToggleLabel"
        :class="{ 'msb-btn-active': appStore.sideMenuOpen }"
        @click="appStore.toggleSideMenu()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect
            x="1.5"
            y="1.5"
            width="12"
            height="12"
            rx="1"
            stroke="currentColor"
            stroke-width="1.1"
          />
          <line x1="9.5" y1="1.5" x2="9.5" y2="13.5" stroke="currentColor" stroke-width="1.1" />
        </svg>
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSdrStore } from '@/stores/sdr'
import { useAppStore } from '@/stores/app'

const props = defineProps<{
  sidebarOpen?: boolean
  sdrSectionActive?: boolean
  // True on views that have a right-edge controls rail (Air/Space). The footer's
  // side-menu toggle only renders when this is set.
  hasRightMenu?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const settingsStore = useSettingsStore()
const sdrStore = useSdrStore()
const appStore = useAppStore()

// The side-menu toggle is shown only where a right rail exists AND it is
// visible — the settings panel is a full-screen overlay that covers the rail,
// so the toggle hides while settings is open even on an Air/Space route.
const rightMenuAvailable = computed<boolean>(() => !!props.hasRightMenu && !settingsStore.open)

const sideMenuToggleLabel = computed<string>(() =>
  appStore.sideMenuOpen ? 'Hide map controls' : 'Show map controls',
)

// Vue coerces an absent boolean prop to false, so the `?? false` fallback path
// is unreachable from tests.
/* v8 ignore start */
const sidebarOpen = computed(() => props.sidebarOpen ?? false)
/* v8 ignore stop */

// The footer's side-panel button is shared: while the settings panel is open it
// shows/hides the settings left rail; otherwise it shows/hides the map sidebar.
const sidePanelOpen = computed(() =>
  settingsStore.open ? settingsStore.sidebarOpen : sidebarOpen.value,
)

const sidebarToggleLabel = computed(() =>
  settingsStore.open ? 'Toggle settings sidebar' : 'Toggle map sidebar',
)

function onToggleSidePanel(): void {
  if (settingsStore.open) {
    settingsStore.toggleSidebar()
  } else {
    emit('toggle-sidebar')
  }
}

// True when the radio is streaming AND parked on a single frequency — i.e.
// tuned to one channel, or locked onto a signal during a scan or search. While
// a scan/search is mid-sweep (hopping between frequencies) the store's scan/
// searchSweeping flags are set, so this stays false until it stops on one.
const sdrParkedOnFreq = computed<boolean>(
  () =>
    sdrStore.playing &&
    !sdrStore.scanSweeping &&
    !sdrStore.searchSweeping &&
    sdrStore.currentFreqHz > 0,
)

// Known label for the tuned frequency, matched against the saved frequency list
// by exact frequency; empty when it isn't a saved one (e.g. a manual tune or an
// arbitrary search step). Only read while the indicator is rendered, where the
// frequency is necessarily active.
const sdrFreqName = computed<string>(
  () =>
    sdrStore.frequencies.find((freq) => freq.frequency_hz === sdrStore.currentFreqHz)?.label ?? '',
)

// "145.800 MHz" — matches the radio panel's own tuned-frequency formatting.
const sdrFreqDisplay = computed<string>(() => `${(sdrStore.currentFreqHz / 1e6).toFixed(3)} MHz`)

// Hidden only on the SDR section's RADIO tab — that panel already shows the
// tuned frequency, so footer copy would be redundant there. It still shows on
// the SDR section's other tabs (Frequency Manager, Search Ranges, …) and on
// every other section.
const sdrIndicatorVisible = computed<boolean>(
  () => sdrParkedOnFreq.value && !(props.sdrSectionActive && sdrStore.activeTab === 'radio'),
)

const sdrIndicatorAriaLabel = computed<string>(() =>
  sdrFreqName.value
    ? `SDR active on ${sdrFreqDisplay.value}, ${sdrFreqName.value}`
    : `SDR active on ${sdrFreqDisplay.value}`,
)
</script>
