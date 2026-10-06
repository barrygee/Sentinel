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
    <p v-if="modelValue > terrainMaxZoom" class="settings-location-hint oma-depth-terrain-note">
      Terrain is only available up to z{{ terrainMaxZoom }}.
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
import BaseSliderRow from '@sentinel/ui/base/BaseSliderRow.vue'

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

/* BaseSliderRow is styled for the dark SDR panel: inset 20px, with faint
   9px text. Here it spans the form column like the fields above it, its
   DEPTH label matches the NORTH … LABEL field captions, and its readout
   matches the rest of the group (12.5px, the size of a section description). */
.oma-depth-picker :deep(.sdr-radio-section) {
  padding: 0;
}

.oma-depth-picker :deep(.sdr-slider-header) {
  margin-bottom: 10px;
}

.oma-depth-picker :deep(.sdr-field-label) {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.6); /* matches .settings-location-label (AA) */
}

.oma-depth-picker :deep(.sdr-slider-val) {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--ink);
}

.oma-depth-picker :deep(.sdr-panel-slider) {
  background: rgba(var(--ink-rgb), 0.15);
}
</style>
