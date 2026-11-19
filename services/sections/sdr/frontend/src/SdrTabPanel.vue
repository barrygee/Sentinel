<template>
  <!-- Thin wrapper mounting SdrPanel in compact/tab mode for the map sidebar RADIO tab -->
  <SdrPanel :full-page="false" />
</template>

<script setup lang="ts">
import SdrPanel from './SdrPanel.vue'
</script>

<style>
/* The recording row's inner .sdr-recording-content / .sdr-recording-live own the horizontal
   inset now (matching the search wrap's 24px left / 20px right); the row itself
   spans full width so titles line up with the NAME header. */
#msb-pane-radio .sdr-recording-row {
  padding-left: 0;
  padding-right: 0;
}
</style>
