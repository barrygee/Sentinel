<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="LAYER_ROWS"
    :is-checked="isLayerOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="(_columnKey, rowKey) => toggleLayer(rowKey as SeaMapLayerKey)"
  />
</template>

<script setup lang="ts">
/**
 * Settings > SEA > Map Layers — the Sea map's overlays as on/off switches, the
 * Sea counterpart of the Air table (`MapLayersControl`).
 *
 * Each switch is a view of the Sea store's overlay flags — the flag the map
 * rail's range-ring button writes too — so a flip on either surface shows on
 * both and on the map at once. A flip also stages the `sea.defaultLayers`
 * config for APPLY CHANGES, the way the label-fields table stages its own
 * key: the choice then seeds other devices and fresh browsers too. Range
 * rings stay local — a ring is a per-station reading aid, not a chart layer.
 *
 * Live vessels have no row: they are always plotted at sea and narrowed
 * with FILTER instead. Ports are an overlay, not a FILTER category, so they
 * sit on the map beside any vessel family.
 */
import { useSeaStore, type SeaOverlayStates } from '@/stores/sea'
import * as settingsApi from '@/services/settingsApi'
import LabelFieldsTable, { type LabelFieldRow } from './LabelFieldsTable.vue'

type SeaMapLayerKey = Exclude<keyof SeaOverlayStates, 'vessels'>

// One unlabelled column: every row is a plain on/off.
const COLUMNS = [{ key: 'on', label: 'Show' }]

const LAYER_ROWS: LabelFieldRow[] = [
  { key: 'vesselLabels', label: 'Vessel labels' },
  { key: 'rangeRings', label: 'Range rings' },
  { key: 'ferryRoutes', label: 'Ferry routes' },
  { key: 'ports', label: 'Ports' },
]

const seaStore = useSeaStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

function isLayerOn(_columnKey: string, layer: string): boolean {
  return seaStore.overlayStates[layer as SeaMapLayerKey]
}

function toggleLayer(layer: SeaMapLayerKey): void {
  seaStore.setOverlay(layer, !seaStore.overlayStates[layer])
  if (layer === 'rangeRings') return
  emit('stage', () => {
    settingsApi.put('sea', 'defaultLayers', seaStore.currentDefaultLayers())
  })
}
</script>
