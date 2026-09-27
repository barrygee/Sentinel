<template>
  <div class="oma-depth-picker">
    <BaseSliderRow
      label="DEPTH"
      :readout="readout"
      accessible-name="Maximum zoom level to download"
      :min="minZoom"
      :max="maxZoom"
      :step="1"
      :value="modelValue"
      @input="onInput"
    />
    <p v-if="modelValue > terrainMaxZoom" class="oma-depth-terrain-note">
      Terrain is only available up to z{{ terrainMaxZoom }} — deeper zooms overzoom the same DEM
      tile, as they do online.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `DepthPicker` — the max-zoom (download depth) slider, reusing
 * `BaseSliderRow` (the same primitive the SDR panel's VOLUME/SQUELCH rows
 * use) rather than building a second slider component. Labels each level in
 * plain language rather than a bare zoom number, since "z12" alone means
 * nothing to an operator deciding how much to download.
 */
import { computed } from 'vue'
import BaseSliderRow from '@/components/base/BaseSliderRow.vue'

/** Plain-language description per zoom band, matching how OSM/Mapbox commonly describe them. */
const LEVEL_LABELS: { atOrAbove: number; label: string }[] = [
  { atOrAbove: 14, label: 'building level' },
  { atOrAbove: 12, label: 'street level' },
  { atOrAbove: 10, label: 'town level' },
  { atOrAbove: 8, label: 'city level' },
  { atOrAbove: 0, label: 'region level' },
]

function levelLabel(zoom: number): string {
  return LEVEL_LABELS.find((band) => zoom >= band.atOrAbove)?.label ?? 'region level'
}

const props = defineProps<{
  modelValue: number
  minZoom: number
  maxZoom: number
  /** Terrain's own extraction ceiling (min(maxZoom, 12) server-side) — used only to decide
   *  whether to show the "terrain up to zN" note, per the BUILD CONTRACT. */
  terrainMaxZoom: number
}>()

const emit = defineEmits<{
  'update:modelValue': [zoom: number]
}>()

const readout = computed(() => `z${props.modelValue} · ${levelLabel(props.modelValue)}`)

function onInput(event: Event): void {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}
</script>

<style scoped>
.oma-depth-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* BaseSliderRow's readout is styled for the dark SDR panel. On the light
   settings island that grey fails 4.5:1, so darken it here only. */
.oma-depth-picker :deep(.sdr-slider-val) {
  color: rgba(var(--ink-rgb), 0.8);
}

.oma-depth-terrain-note {
  margin: 0;
  font-size: 11px;
  color: rgba(var(--ink-rgb), 0.65);
}
</style>
