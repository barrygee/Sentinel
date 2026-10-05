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
      <!-- Live state sections show here on every page (e.g. SDR's tuned
           frequency) — registered in shell/footerRegistry.ts. -->
      <component
        :is="item.component"
        v-for="item in footerItems"
        :key="item.id"
        :active-section-id="activeSectionId ?? ''"
      />
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
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { getFooterItems } from '@sentinel/shell-api/shell/footerRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'

const props = defineProps<{
  sidebarOpen?: boolean
  /** The section on screen, e.g. 'sdr' — passed to registered footer items. */
  activeSectionId?: string
  // True on views that have a right-edge controls rail (Air/Space). The footer's
  // side-menu toggle only renders when this is set.
  hasRightMenu?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const settingsStore = useSettingsStore()
const footerItems = getFooterItems()
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
</script>
