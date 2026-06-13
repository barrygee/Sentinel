<template>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header id="nav">
    <div id="nav-logo">
      <img id="logo-img" src="/assets/logo.svg" alt="SENTINEL" />
    </div>
    <nav id="nav-right" aria-label="Domains">
      <RouterLink
        v-for="[domain, label] in navDomains"
        :key="domain"
        :to="`/${domain}/`"
        class="nav-link"
        active-class="nav-link--active"
        :data-domain="domain"
        >{{ label }}</RouterLink
      >
    </nav>
  </header>

  <main id="main" ref="mainRef" tabindex="-1">
    <RouterView />
  </main>

  <MapSidebar ref="sidebarRef" :hide-tabs="isSdrRoute">
    <template #radio>
      <SdrTabPanel />
    </template>
  </MapSidebar>

  <AppFooter :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarRef?.toggle()" />

  <SettingsPanel />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import MapSidebar from '@/components/shared/MapSidebar.vue'
import AppFooter from '@/components/shared/AppFooter.vue'
import SettingsPanel from '@/components/shared/SettingsPanel.vue'
import SdrTabPanel from '@/components/sdr/SdrTabPanel.vue'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useAirAlertsService } from '@/composables/useAirAlertsService'
import { useSpaceAlertsService } from '@/composables/useSpaceAlertsService'
import { useAppStore } from '@/stores/app'
import { useNotificationsStore } from '@/stores/notifications'

const route = useRoute()
const appStore = useAppStore()
const { locationUnavailable, start: startGps, hydrateFromConfig } = useUserLocation()
const notificationsStore = useNotificationsStore()

onMounted(async () => {
  // Reconcile with the config first: a valid config location seeds the
  // marker, an explicitly-cleared one drops any stale manual override so
  // GPS (started next) can reposition rather than pinning the old marker.
  await hydrateFromConfig()
  startGps()
  // App-level alert services run independently of the active section so
  // aircraft/overhead/satellite-pass alerts fire from any page.
  useAirAlertsService().start()
  useSpaceAlertsService().start()
})

// Surface the "no location available" state as a single app-wide alerts-panel
// notification (consistent across Air/Space/SDR — App.vue is always mounted).
// Added when geolocation can't provide a fix and none is set; auto-dismissed
// the moment a location is obtained (right-click, Settings, or a GPS fix).
let _locNotifId: string | null = null
watch(
  locationUnavailable,
  (unavailable) => {
    if (unavailable && !_locNotifId) {
      _locNotifId = notificationsStore.add({
        type: 'system',
        title: 'LOCATION UNAVAILABLE',
        detail:
          'No location is set and the browser could not provide one. Right-click the map to set a location, or enable location access.',
      })
    } else if (!unavailable && _locNotifId) {
      notificationsStore.dismiss(_locNotifId)
      _locNotifId = null
    }
  },
  { immediate: true },
)

useDocumentEvent('air-open-search', () => sidebarRef.value?.switchTab('search'))
useDocumentEvent('open-space-search', () => sidebarRef.value?.switchTab('search'))

const isSdrRoute = computed(() => route.path.startsWith('/sdr'))

watch(isSdrRoute, (isSdr) => {
  if (isSdr) {
    sidebarRef.value?.openRadioTab()
  } else {
    sidebarRef.value?.closeRadioTab()
  }
})

const sidebarRef = ref<InstanceType<typeof MapSidebar> | null>(null)

const sidebarOpen = computed(() => sidebarRef.value?.open ?? false)

const ALL_NAV_DOMAINS: [string, string][] = [
  ['air', 'AIR'],
  ['space', 'SPACE'],
  ['sea', 'SEA'],
  ['land', 'LAND'],
  ['sdr', 'SDR'],
]

const navDomains = computed(() =>
  ALL_NAV_DOMAINS.filter(([d]) => appStore.enabledDomains.includes(d)),
)

// The routed view container. Focus moves here on navigation so screen-reader
// and keyboard users land on the new view rather than staying on the old one.
const mainRef = ref<HTMLElement | null>(null)

/** Per-view document title (WCAG 2.4.2): "SENTINEL — AIR" etc., or "SENTINEL". */
function titleForPath(path: string): string {
  const segment = path.split('/').filter(Boolean)[0] ?? ''
  const entry = ALL_NAV_DOMAINS.find(([domain]) => domain === segment)
  return entry ? `SENTINEL — ${entry[1]}` : 'SENTINEL'
}

// Announce SPA navigation to assistive tech: set the page title immediately, and
// on an actual route change (not the initial load) move focus to the main region
// so the change isn't silent. WCAG 2.4.2 Page Titled / 2.4.3 Focus Order.
watch(
  () => route.path,
  (path, previousPath) => {
    document.title = titleForPath(path)
    if (previousPath !== undefined) {
      nextTick(() => mainRef.value?.focus())
    }
  },
  { immediate: true },
)
</script>
