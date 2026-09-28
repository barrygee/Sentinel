<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="ROWS"
    :is-checked="isRoadsOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="toggleRoads"
  />
</template>

<script setup lang="ts">
/**
 * Settings › Maps › Roads — show or hide road lines, road names and road
 * numbers on every map. It is the shared base-map `roads` layer, the same value
 * each map's roads button reads and writes, so a flip here moves the roads on
 * every domain map at once (the maps watch the basemap store).
 *
 * Like Map Layers, the flip applies and saves immediately, and also stages a
 * re-save for APPLY CHANGES so the footer does not report "NO CHANGES" straight
 * after a change.
 */
import { useBasemapStore } from '@/stores/basemap'
import LabelFieldsTable, { type LabelFieldRow } from './LabelFieldsTable.vue'

const COLUMNS = [{ key: 'on', label: 'Show' }]
const ROWS: LabelFieldRow[] = [{ key: 'roads', label: 'Roads' }]

const basemapStore = useBasemapStore()
const emit = defineEmits<{ stage: [fn: () => Promise<void>] }>()

function isRoadsOn(): boolean {
  return basemapStore.layers.roads
}

function toggleRoads(): void {
  basemapStore.setLayer('roads', !basemapStore.layers.roads)
  emit('stage', () => basemapStore.persistLayers())
}
</script>
