<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="BASEMAP_ROWS"
    :is-checked="isBasemapLayerOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="(_columnKey, rowKey) => toggleBasemapLayer(rowKey as BasemapLayerKey)"
  />
</template>

<script setup lang="ts">
/**
 * Settings > LAND > Map Layers — the shared base-map switches for the Land map.
 *
 * The data layers (APRS stations, repeaters) are deliberately
 * not here: the map draws one at a time and that choice is the sidebar's tabs
 * beneath FILTER (`landStore.selectLayer`, saved as `land.defaultLayers`).
 * Location names is the shared base-map layer (`app.mapLayers.names`) — the
 * same switch as Settings › AIR's, offered here because the Land rail no
 * longer carries a button for it.
 */
import { useBasemapStore } from '@/stores/basemap'
import { useLandStore, isLandLayer } from '@/stores/land'
import { useRepeatersStore } from '@/stores/repeaters'
import * as settingsApi from '@/services/settingsApi'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import LabelFieldsTable, { type LabelFieldRow } from './LabelFieldsTable.vue'

type BasemapLayerKey = 'names'

// One unlabelled column: every row is a plain on/off.
const COLUMNS = [{ key: 'on', label: 'Show' }]
const BASEMAP_ROWS: LabelFieldRow[] = [{ key: 'names', label: 'Location names' }]

const landStore = useLandStore()
const basemapStore = useBasemapStore()
const repeatersStore = useRepeatersStore()

function isBasemapLayerOn(_columnKey: string, _layer: string): boolean {
  return basemapStore.layers.names
}

function toggleBasemapLayer(_layer: BasemapLayerKey): void {
  // The basemap store persists `app.mapLayers` itself, at once.
  basemapStore.setLayer('names', !basemapStore.layers.names)
}

/** Re-read every Land layer setting after an app-config JSON upload, so the
 *  switch (and the map's chosen data layer) show what the uploaded file says. */
async function hydrateFromDb(): Promise<void> {
  const [appSettings] = await Promise.all([
    settingsApi.getNamespace('app'),
    landStore.hydrateDefaultLayers(),
    repeatersStore.hydrateFiltersFromDb(),
  ])
  basemapStore.hydrateLayers(appSettings?.mapLayers)
  const [layer] = landStore.defaultLayers
  if (isLandLayer(layer)) landStore.selectLayer(layer)
}
useDocumentEvent('sentinel:config-uploaded', () => void hydrateFromDb())
</script>
