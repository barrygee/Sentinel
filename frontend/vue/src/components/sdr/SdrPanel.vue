<template>
  <!-- SDR Panel — shared between full-page SdrView and the sidebar RADIO tab.
       Full content migrated from sdr-panel.ts in Phase 5 (SDR domain).
       :full-page controls layout mode (full-width vs compact sidebar embed). -->
  <div id="sdr-panel" :class="{ 'sdr-panel-fullpage': fullPage, 'sdr-panel-tab': !fullPage }">
    <div id="sdr-panel-inner">
      <!-- Device selector -->
      <div class="sdr-section" id="sdr-device-section">
        <select id="sdr-radio-select">
          <option value="" disabled selected>Select radio…</option>
          <option v-for="radio in sdrStore.radios" :key="radio.id" :value="radio.id">
            {{ radio.name }}
          </option>
        </select>
      </div>
      <!-- Controls and frequency display populated in Phase 5 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSdrStore } from '@/stores/sdr'

const props = defineProps<{ fullPage?: boolean }>()
const sdrStore = useSdrStore()

onMounted(async () => {
  await sdrStore.loadRadios()
  await sdrStore.loadGroups()
  await sdrStore.loadFrequencies()
})
</script>
