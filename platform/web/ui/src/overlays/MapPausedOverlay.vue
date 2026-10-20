<template>
  <div class="map-paused-overlay" role="status">
    <div class="map-paused-overlay-box">
      <div class="map-paused-overlay-headline">{{ headline }}</div>
      <div v-if="detail" class="map-paused-overlay-detail">{{ detail }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dims a map whose live data is paused and says why in a black box at its
 * centre — the look the SDR waterfall has while a group scan runs, so a paused
 * view reads the same in every section.
 *
 * Click-through (`pointer-events: none`): the map stays pannable and the
 * sidebar usable underneath; it only says the data isn't updating. It covers
 * the page below the nav bar — where the full-screen maps sit — like
 * `MapNoticeBanner`, so it needs no positioned ancestor, and stays under the
 * sidebar and the map notices.
 */
defineProps<{
  /** What is paused and why, e.g. "Online Data Source daily limit reached." */
  headline: string
  /** A second line, e.g. when it resumes. */
  detail?: string | undefined
}>()
</script>

<style scoped>
.map-paused-overlay {
  position: fixed;
  inset: var(--nav-height) 0 0 0;
  /* Over the map and its markers, under the sidebar (1002) and notices (1004). */
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.55);
}

.map-paused-overlay-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: min(560px, 100%);
  background: #000;
  padding: 28px 44px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Phones: the SDR box's 44px sides leave too little room for the text. */
@media (max-width: 480px) {
  .map-paused-overlay-box {
    padding: 20px 20px;
  }
}

.map-paused-overlay-headline {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0.04em;
  /* Fixed rather than a theme ink: the box is black in either theme. */
  color: #fff;
  text-align: center;
}

.map-paused-overlay-detail {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 14px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  /* 0.75 white on black: well over AA's 4.5:1. */
  color: rgba(255, 255, 255, 0.75);
  text-align: center;
}
</style>
