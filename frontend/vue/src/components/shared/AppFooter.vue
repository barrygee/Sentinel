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
import { useDocsStore } from '@/docs/docsStore'

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
const docsStore = useDocsStore()
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
// shows/hides the settings left rail; while the docs page is up it shows/hides
// the docs navigation; otherwise it shows/hides the map sidebar.
const sidePanelOpen = computed(() => {
  if (settingsStore.open) return settingsStore.sidebarOpen
  if (docsStore.active) return docsStore.sidebarOpen
  return sidebarOpen.value
})

const sidebarToggleLabel = computed(() => {
  if (settingsStore.open) return 'Toggle settings sidebar'
  if (docsStore.active) return 'Toggle docs navigation'
  return 'Toggle map sidebar'
})

function onToggleSidePanel(): void {
  if (settingsStore.open) {
    settingsStore.toggleSidebar()
  } else if (docsStore.active) {
    docsStore.toggleSidebar()
  } else {
    emit('toggle-sidebar')
  }
}
</script>

<style scoped>
/* Fixed bar at the bottom of the viewport. Its edge buttons are 44px wide so
   they line up with the vertical rail columns: the side-panel button under the
   44px left rail, and — on Air/Space — the side-menu toggle under the 44px
   right rail. Without a right rail the settings button is the right-most
   element. --footer-height (a design token) embeds the iOS safe-area inset. */
#footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--footer-height);
  background: var(--chrome-bg);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 env(safe-area-inset-bottom);
  z-index: 1000;
}

#footer-left {
  display: flex;
  align-items: baseline;
  gap: 0;
}

#footer-center {
  flex: 1;
  min-width: 0;
}

#footer-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* The edge toggles and the settings gear are dim icon buttons that brighten on
   hover. The left toggle shows/hides the map sidebar; the right one
   (#side-menu-btn, Air/Space only) shows/hides the map's right controls rail. */
#map-sidebar-btn,
#side-menu-btn,
#settings-btn {
  width: 44px;
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rail-ink);
  opacity: 0.6;
  transition:
    background 0.2s,
    opacity 0.2s;
  flex-shrink: 0;
  margin: 0;
  position: relative;
}

#map-sidebar-btn:hover,
#side-menu-btn:hover {
  background: rgba(var(--rail-ink-rgb), 0.08);
  border-radius: 6px;
  opacity: 1;
}

#map-sidebar-btn.msb-btn-active,
#side-menu-btn.msb-btn-active {
  opacity: 1;
  color: var(--rail-ink);
  border-radius: 6px;
}

#settings-btn:hover {
  background: var(--color-border);
  border-radius: 6px;
  opacity: 1;
}

#settings-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  top: 50%;
  right: calc(100% + 6px);
  transform: translateY(-50%);
  background: var(--tooltip-bg);
  color: var(--tooltip-ink);
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

#settings-btn[data-tooltip]:hover::before {
  opacity: 1;
}

/* The right rail's toggle is only offered on small screens, where map space is
   scarce. On wider screens the rail always shows, so the toggle is hidden —
   matching the ≤768px gate on the rail's collapsed state. */
@media (min-width: 769px) {
  #side-menu-btn {
    display: none;
  }
}

/* Below 1024px the safe-area bottom padding has been dropped since the
   template.css days; kept as it was here, so this move changes nothing. */
@media (max-width: 1024px) {
  #footer {
    padding-bottom: 0;
  }
}

@media (max-width: 768px) {
  #footer-right {
    gap: 8px;
  }

  /* Settings is in the phone menu at this size, so the gear hides while the
     menu is open. */
  :global(body[data-nav-open] #settings-btn) {
    display: none;
  }

  /* Touch screens can't dismiss a hover tooltip. */
  #footer :deep([data-tooltip])::before {
    display: none !important;
  }
}

@media (max-width: 480px) {
  #footer-center {
    display: none;
  }
}
</style>
