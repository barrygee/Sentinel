<template>
  <header id="nav">
    <div id="nav-logo">
      <img id="logo-img" src="/assets/logo.svg" alt="SENTINEL OS">
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

  <MapSidebar v-if="!isSdrRoute" ref="sidebarRef">
    <template #radio>
      <SdrTabPanel />
    </template>
  </MapSidebar>

  <AppFooter
    @toggle-sidebar="sidebarRef?.toggle()"
    @toggle-notifications="sidebarRef?.switchTab('alerts')"
    @toggle-tracking="sidebarRef?.switchTab('tracking')"
    @open-radio-tab="sidebarRef?.openRadioTab()"
    @toggle-docs="docsRef?.toggle()"
  />

  <SettingsPanel />
  <DocsPanel ref="docsRef" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import MapSidebar from '@/components/shared/MapSidebar.vue'
import AppFooter from '@/components/shared/AppFooter.vue'
import SettingsPanel from '@/components/shared/SettingsPanel.vue'
import DocsPanel from '@/components/shared/DocsPanel.vue'
import SdrTabPanel from '@/components/sdr/SdrTabPanel.vue'

const route = useRoute()

const isSdrRoute = computed(() => route.path.startsWith('/sdr'))

const sidebarRef = ref<InstanceType<typeof MapSidebar> | null>(null)
const docsRef    = ref<InstanceType<typeof DocsPanel>   | null>(null)

const navDomains: [string, string][] = [
  ['air',   'AIR'],
  ['space', 'SPACE'],
  ['sea',   'SEA'],
  ['land',  'LAND'],
  ['sdr',   'SDR'],
]
</script>
