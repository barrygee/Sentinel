<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="ROWS"
    :is-checked="isLayerOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="(_columnKey, rowKey) => toggleLayer(rowKey as BasemapLayerGroup)"
  />
</template>

<script setup lang="ts">
/**
 * Settings › Map › Map Layers — show or hide the base map's roads, location
 * names and borders on every map. Each switch is a shared base-map layer in
 * the basemap store, the same value a map's rail button reads and writes, so a
 * flip here moves that layer on every domain map at once (the maps watch the
 * store).
 *
 * Like the per-domain Map Layers, the flip applies and saves immediately, and
 * also stages a re-save for APPLY CHANGES so the footer does not report
 * "NO CHANGES" straight after a change.
 */
import { useBasemapStore } from '@/stores/basemap'
import * as settingsApi from '@/services/settingsApi'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import type { BasemapLayerGroup } from '@/utils/basemapLayers'
import LabelFieldsTable, { type LabelFieldRow } from './LabelFieldsTable.vue'

// One unlabelled column: every row is a plain on/off.
const COLUMNS = [{ key: 'on', label: 'Show' }]
const ROWS: LabelFieldRow[] = [
  { key: 'roads', label: 'Roads' },
  { key: 'names', label: 'Location names' },
  { key: 'borders', label: 'Borders' },
]

const basemapStore = useBasemapStore()
const emit = defineEmits<{ stage: [fn: () => Promise<void>] }>()

function isLayerOn(_columnKey: string, rowKey: string): boolean {
  return basemapStore.layers[rowKey as BasemapLayerGroup]
}

/** Re-adopt the layers from the config database after the app-config JSON is
 *  uploaded, so an edit made in the JSON editor moves these switches (and the
 *  maps) without waiting for the post-apply reload. */
async function hydrateLayersFromDb(): Promise<void> {
  const appSettings = await settingsApi.getNamespace('app')
  basemapStore.hydrateLayers(appSettings?.mapLayers)
}
useDocumentEvent('sentinel:config-uploaded', () => void hydrateLayersFromDb())

function toggleLayer(group: BasemapLayerGroup): void {
  basemapStore.setLayer(group, !basemapStore.layers[group])
  emit('stage', () => basemapStore.persistLayers())
}
</script>
