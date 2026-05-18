<template>
  <header id="nav">
    <div id="nav-logo">
      <img id="logo-img" src="/assets/logo.svg" alt="SENTINEL">
    </div>
    <nav id="nav-right">
      <RouterLink
        v-for="[domain, label] in navDomains"
        :key="domain"
        :to="`/${domain}/`"
        class="nav-link"
        active-class="nav-link--active"
        :data-domain="domain"
      >{{ label }}</RouterLink>
    </nav>
  </header>

  <RouterView />

  <MapSidebar ref="sidebarRef" :hide-tabs="isSdrRoute">
    <template #radio>
      <SdrTabPanel />
    </template>
  </MapSidebar>

  <AppFooter
    :sidebar-open="sidebarOpen"
    @toggle-sidebar="sidebarRef?.toggle()"
    @toggle-docs="docsRef?.toggle()"
  />

  <SettingsPanel />
  <DocsPanel ref="docsRef" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import MapSidebar from '@/components/shared/MapSidebar.vue'
import AppFooter from '@/components/shared/AppFooter.vue'
import SettingsPanel from '@/components/shared/SettingsPanel.vue'
import DocsPanel from '@/components/shared/DocsPanel.vue'
import SdrTabPanel from '@/components/sdr/SdrTabPanel.vue'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
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
})

// Surface the "no location available" state as a single app-wide alerts-panel
// notification (consistent across Air/Space/SDR — App.vue is always mounted).
// Added when geolocation can't provide a fix and none is set; auto-dismissed
// the moment a location is obtained (right-click, Settings, or a GPS fix).
let _locNotifId: string | null = null
watch(locationUnavailable, (unavailable) => {
  if (unavailable && !_locNotifId) {
    _locNotifId = notificationsStore.add({
      type: 'system',
      title: 'LOCATION UNAVAILABLE',
      detail: 'No location is set and the browser could not provide one. Right-click the map to set a location, or enable location access.',
    })
  } else if (!unavailable && _locNotifId) {
    notificationsStore.dismiss(_locNotifId)
    _locNotifId = null
  }
}, { immediate: true })

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
const docsRef    = ref<InstanceType<typeof DocsPanel>   | null>(null)

const sidebarOpen = computed(() => sidebarRef.value?.open ?? false)

const ALL_NAV_DOMAINS: [string, string][] = [
  ['air',   'AIR'],
  ['space', 'SPACE'],
  ['sea',   'SEA'],
  ['land',  'LAND'],
  ['sdr',   'SDR'],
]

const navDomains = computed(() =>
  ALL_NAV_DOMAINS.filter(([d]) => appStore.enabledDomains.includes(d))
)
</script>
