<script setup lang="ts">
/**
 * The RF band-plan strip across the bottom of the spectrum: one translucent
 * box per allocation in view (e.g. "Medium Wave"), its name centred inside
 * when it fits. Positions are fractions of the data box, which the overlay
 * itself is inset to.
 */
import './SdrBandPlanOverlay.css'
import type { StyleValue } from 'vue'

/** One band in the visible window. */
export interface VisibleBand {
  key: string
  /** Full name, shown as the tooltip. */
  name: string
  /** The name, short form or empty — whatever fits the box uncropped. */
  label: string
  leftPct: number
  widthPct: number
}

defineProps<{
  bands: VisibleBand[]
  /** Insets matching the spectrum's data box. */
  overlayStyle: StyleValue
}>()
</script>

<template>
  <div class="sdr-wf-band-overlay" :style="overlayStyle">
    <div
      v-for="band in bands"
      :key="band.key"
      class="sdr-wf-band"
      :style="{ left: band.leftPct + '%', width: band.widthPct + '%' }"
      :title="band.name"
    >
      <span v-if="band.label">{{ band.label }}</span>
    </div>
  </div>
</template>
