<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="LAYER_ROWS"
    :is-checked="isLayerOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="(_columnKey, rowKey) => toggleLayer(rowKey as LandMapLayerKey)"
  />
</template>

<script setup lang="ts">
/**
 * Settings > LAND > Map Layers — the Land map's overlays as on/off switches,
 * the Land counterpart of `MapLayersControl`/`SeaMapLayersControl`.
 *
 * APRS has no row here: it is gated by whether an SDR has been named as the
 * APRS receiver (`land-aprs-sdr-source`), so its on/off lives on the FILTER
 * rail only, where that dependency is visible. Traffic cameras have no such
 * dependency — a feed just needs to be configured and enabled in LIVE FEEDS —
 * so it is a plain layer switch like Sea's.
 */
import { useLandStore } from '@/stores/land'
import * as settingsApi from '@/services/settingsApi'
import LabelFieldsTable, { type LabelFieldRow } from './LabelFieldsTable.vue'

type LandMapLayerKey = 'trafficCameras'

// One unlabelled column: every row is a plain on/off.
const COLUMNS = [{ key: 'on', label: 'Show' }]

const LAYER_ROWS: LabelFieldRow[] = [{ key: 'trafficCameras', label: 'Traffic cameras' }]

const landStore = useLandStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

function isLayerOn(_columnKey: string, _layer: string): boolean {
  return landStore.trafficCamerasLayerVisible
}

function toggleLayer(_layer: LandMapLayerKey): void {
  landStore.setTrafficCamerasLayerVisible(!landStore.trafficCamerasLayerVisible)
  emit('stage', () => {
    settingsApi.put('land', 'defaultLayers', landStore.currentDefaultLayers())
  })
}
</script>
