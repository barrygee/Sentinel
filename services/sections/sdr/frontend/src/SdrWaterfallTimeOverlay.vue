<script setup lang="ts">
/**
 * The overlay down the waterfall raster's left edge: wall-clock labels on the
 * rows that crossed a whole interval, unlabelled per-second ticks between them,
 * and the start/end times of the hovered or pinned signal. Renders nothing when
 * there is none of the three.
 */
import './SdrWaterfallTimeOverlay.css'
import type { StyleValue } from 'vue'
import type {
  SignalMarkerLabel,
  WaterfallSecondTick,
  WaterfallTimeMarker,
} from './composables/useSignalMarkers'

defineProps<{
  timeMarkers: WaterfallTimeMarker[]
  secondTicks: WaterfallSecondTick[]
  signalLabels: SignalMarkerLabel[]
  /** Pinned to the raster's data box. */
  overlayStyle: StyleValue
}>()
</script>

<template>
  <div
    v-if="timeMarkers.length > 0 || secondTicks.length > 0 || signalLabels.length > 0"
    class="sdr-wf-time-overlay"
    :style="overlayStyle"
  >
    <div
      v-for="marker in timeMarkers"
      :key="marker.key"
      class="sdr-wf-time-marker"
      :style="{ top: marker.topPx + 'px' }"
    >
      <span class="sdr-wf-time-label">{{ marker.label }}</span>
    </div>
    <div
      v-for="tick in secondTicks"
      :key="`sec-${tick.key}`"
      class="sdr-wf-second-tick"
      :style="{ top: tick.topPx + 'px' }"
    ></div>
    <div
      v-for="signalLabel in signalLabels"
      :key="signalLabel.key"
      class="sdr-wf-time-marker"
      :style="{ top: signalLabel.topPx + 'px' }"
    >
      <span
        class="sdr-wf-time-label"
        :class="
          signalLabel.variant === 'start'
            ? 'sdr-wf-time-label--signal-start'
            : 'sdr-wf-time-label--signal-end'
        "
        >{{ signalLabel.label }}</span
      >
    </div>
  </div>
</template>
