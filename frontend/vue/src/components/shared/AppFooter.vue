<template>
  <footer id="footer">
    <div id="footer-left">
      <button id="map-sidebar-btn" aria-label="Toggle map sidebar" data-tooltip="SIDE PANEL"
        :class="{ 'msb-btn-active': sidebarOpen }"
        @click="emit('toggle-sidebar')">
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="1.5" y="1.5" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.1"/>
          <line x1="5.5" y1="1.5" x2="5.5" y2="13.5" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </button>
    </div>

    <div id="footer-center"></div>

    <div id="footer-right">
      <button id="docs-btn" aria-label="Documentation" data-tooltip="DOCUMENTATION"
        @click="emit('toggle-docs')">
        <svg width="17" height="17" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="2.5" y="1.5" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.1"/>
          <line x1="5" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </button>
      <button id="settings-btn" aria-label="Settings" data-tooltip="SETTINGS"
        @click="settingsStore.togglePanel()">
        <svg width="18" height="18" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6.18 1.5h2.64l.38 1.52a5 5 0 0 1 1.1.64l1.5-.5 1.32 2.28-1.16 1.03a5.06 5.06 0 0 1 0 1.26l1.16 1.03-1.32 2.28-1.5-.5a5 5 0 0 1-1.1.64l-.38 1.52H6.18l-.38-1.52a5 5 0 0 1-1.1-.64l-1.5.5L1.88 9.26l1.16-1.03a5.06 5.06 0 0 1 0-1.26L1.88 5.94 3.2 3.66l1.5.5a5 5 0 0 1 1.1-.64L6.18 1.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
          <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ sidebarOpen?: boolean }>()

const emit = defineEmits<{
  'toggle-sidebar': []
  'toggle-docs': []
}>()

const settingsStore = useSettingsStore()

const sidebarOpen = computed(() => props.sidebarOpen ?? false)
</script>
