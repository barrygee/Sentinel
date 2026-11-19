<script setup lang="ts">
/**
 * The frequency axis under the spectrum: a tick line per step and a label pill
 * on every tick that has room for one (see `layoutFrequencyTicks`). It sits in
 * the gutter below the data box, where a press starts a frequency pan.
 */
import './SdrFrequencyTickGutter.css'
import type { StyleValue } from 'vue'
import type { FrequencyTick } from './waterfallFrequencyTicks'

defineProps<{
  ticks: FrequencyTick[]
  /** Spans the data box horizontally and the label gutter vertically. */
  gutterStyle: StyleValue
}>()
</script>

<template>
  <div class="sdr-wf-tick-gutter" :style="gutterStyle">
    <div
      v-for="tick in ticks"
      :key="tick.key"
      class="sdr-wf-tick"
      :style="{ left: tick.leftPct + '%' }"
    ></div>
    <span
      v-for="tick in ticks"
      v-show="tick.labeled"
      :key="`l-${tick.key}`"
      class="sdr-wf-freq-label"
      :style="{ left: tick.leftPct + '%' }"
      >{{ tick.label }}</span
    >
  </div>
</template>
