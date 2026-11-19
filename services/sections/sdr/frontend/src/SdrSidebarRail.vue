<template>
  <!-- Teleported so it persists when the side panel hides. -->
  <Teleport to="body">
    <div v-show="isSdrRoute" id="sdr-sidebar-rail">
      <BaseIconButton
        v-for="tab in tabs"
        :key="tab.id"
        class="sdr-rail-btn"
        :class="{ 'sdr-rail-btn-active': activeTab === tab.id && sidebarOpen }"
        style="
          --ba-icon-btn-tooltip-offset: 8px;
          --ba-icon-btn-tooltip-bg: rgba(var(--rail-rgb), 0.96);
          --ba-icon-btn-tooltip-color: var(--tooltip-ink);
          --ba-icon-btn-tooltip-font: var(--font-primary, 'Barlow', sans-serif);
          --ba-icon-btn-tooltip-padding: 0 10px;
          --ba-icon-btn-tooltip-height: 24px;
          --ba-icon-btn-tooltip-radius: 3px;
          --ba-rail-transition: color 0.15s ease;
        "
        :active="activeTab === tab.id && sidebarOpen"
        :data-tab="tab.id"
        tooltip-side="right"
        :tooltip="tab.label"
        :accessible-name="tab.label"
        @click="onTabClick(tab.id)"
      >
        <SdrRailTabIcon :tab-id="tab.id" />
      </BaseIconButton>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The SDR side rail: one button per panel tab, fixed to the viewport's left
 * edge. It tracks whether the side panel is open (`sentinel:sidebar-state`) so a
 * click on the tab already showing collapses the panel, and a click on any tab
 * while it is closed opens it.
 *
 * `.sdr-rail-btn` / `.sdr-rail-btn-active` carry no styling (BaseIconButton owns
 * the chrome); they stay for the specs' `.sdr-rail-btn[data-tab="…"]` queries.
 */
import './SdrSidebarRail.css'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import SdrRailTabIcon from './SdrRailTabIcon.vue'
import type { SdrTab } from './stores/sdr'

const props = defineProps<{
  tabs: ReadonlyArray<{ id: SdrTab; label: string }>
  activeTab: SdrTab
}>()

const emit = defineEmits<{
  /** The operator picked a tab that is not the one already showing in an open panel. */
  select: [tab: SdrTab]
}>()

const route = useRoute()
const isSdrRoute = computed(() => route.path.startsWith('/sdr'))

const sidebarOpen = ref<boolean>(readSidebarOpen())
function readSidebarOpen(): boolean {
  try {
    return sessionStorage.getItem('sentinel_sidebar_open') === '1'
  } catch {
    return false
  }
}
useDocumentEvent('sentinel:sidebar-state', (event: Event) => {
  sidebarOpen.value = !!(event as CustomEvent<{ open: boolean }>).detail?.open
})

function onTabClick(tab: SdrTab) {
  // A second click on the tab already showing collapses the panel instead.
  if (props.activeTab === tab && sidebarOpen.value) {
    document.dispatchEvent(new CustomEvent('sentinel:sdr-toggle-panel'))
    return
  }
  // The parent switches tab synchronously, before the panel is asked to open.
  emit('select', tab)
  if (!sidebarOpen.value) {
    document.dispatchEvent(new CustomEvent('sentinel:sdr-open-panel'))
  }
}
</script>
