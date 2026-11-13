<template>
  <span class="sdr-device-meta sdr-host-device-reason" :title="ADSB_SOURCE_EXPLANATION">
    ADS-B DECODER<span class="sdr-adsb-source-why">{{ ADSB_SOURCE_EXPLANATION }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * `SdrAdsbSourceTag` — stands in for ADD on the SDR that Air's ADS-B decoder
 * reads from (`useAdsbSourceDevice`): it is in use, and adding it as a radio
 * would let the SDR panel retune it off 1090 MHz. The why is its title for a
 * pointer, and visually hidden text for a screen reader (a title alone isn't
 * reliably announced).
 */
const ADSB_SOURCE_EXPLANATION =
  ': in use by the ADS-B decoder. Pick another Off Grid ADS-B SDR in Settings › AIR to use it as a radio.'
</script>

<style scoped>
.sdr-adsb-source-why {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
