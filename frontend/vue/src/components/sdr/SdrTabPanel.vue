<template>
  <!-- Thin wrapper mounting SdrPanel in compact/tab mode for the map sidebar RADIO tab -->
  <SdrPanel :full-page="false" />
</template>

<script setup lang="ts">
import SdrPanel from './SdrPanel.vue'
</script>

<style>
.sdr-tab-status-right {
    display: flex;
    align-items: center;
    margin-left: auto;
}

#sdr-tab-clips-scroll-hint {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 0 4px;
    font-family: var(--font-primary, 'Barlow', sans-serif);
    font-size: 8px;
    letter-spacing: 0.14em;
    color: rgba(255,255,255,0.2);
    cursor: default;
    user-select: none;
}

#sdr-tab-clips-list-wrap {
    max-height: 260px;
    overflow-y: auto;
    scrollbar-width: none;
}

#sdr-tab-clips-list-wrap::-webkit-scrollbar {
    display: none;
}

#msb-pane-radio .sdr-mini-section {
    padding: 10px 20px;
}

#msb-pane-radio .sdr-group-toggle {
    padding-left: 20px;
    padding-right: 20px;
}

#msb-pane-radio .sdr-clips-search-row {
    padding: 8px 20px 4px;
}

#msb-pane-radio #sdr-tab-clips-list,
#msb-pane-radio #sdr-tab-clips-empty {
    padding-left: 0;
    padding-right: 0;
}

#msb-pane-radio .sdr-clip-row {
    padding-left: 20px;
    padding-right: 20px;
}
</style>
