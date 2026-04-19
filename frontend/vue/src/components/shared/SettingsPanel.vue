<template>
  <!-- Full settings panel — content migrated from settings.ts in a later phase -->
  <div id="settings-panel" :class="{ 'settings-panel-visible': settingsStore.open }">
    <div id="settings-panel-inner">
      <div id="settings-header">
        <span id="settings-title">SETTINGS</span>
        <button id="settings-close-btn" @click="settingsStore.closePanel()">✕</button>
      </div>
      <div id="settings-body">
        <!-- Settings sections rendered here in Phase 4 -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
const settingsStore = useSettingsStore()
</script>
