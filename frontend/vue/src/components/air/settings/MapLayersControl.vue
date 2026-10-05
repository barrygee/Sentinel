<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="LAYER_ROWS"
    :is-checked="isLayerOn"
    :show-header="false"
    control="switch"
    field-header="Layer"
    @toggle="(_columnKey, rowKey) => toggleLayer(rowKey as MapLayerKey)"
  />
</template>

<script setup lang="ts">
/**
 * Settings > Map Layers — every map overlay as an on/off switch, in one table.
 *
 * The map rails keep the handful of overlays an operator flips mid-task (range
 * rings, A2A refuelling, AWACS); the rest are set here and left alone. Both
 * surfaces are views of the same persisted state, so a rail toggle shows up in
 * this table and a switch here moves the layer on the map — there is one value,
 * not two that have to be kept in step.
 *
 * `terrain` lives on the shared basemap store because it describes the base
 * map every domain draws; the rest are Air overlays. Location names is also a
 * shared base-map layer, but its one switch is in App Settings › Map.
 *
 * A flip takes effect (and is saved) at once, but it also stages a re-save for
 * APPLY CHANGES, as the Sea and Land tables do — otherwise APPLY finds nothing
 * pending and reports "NO CHANGES" straight after the operator changed a layer.
 */
import { useAirStore, type OverlayStates } from '@/stores/air'
import { useBasemapStore } from '@/stores/basemap'
import * as settingsApi from '@/services/settingsApi'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import LabelFieldsTable, {
  type LabelFieldRow,
} from '@/components/shared/settings/LabelFieldsTable.vue'

/** An Air overlay flag, or the shared terrain base-map layer. */
type MapLayerKey = keyof OverlayStates | 'terrain'

// One unlabelled column: every row is a plain on/off, so a heading would say
// nothing the switch does not.
const COLUMNS = [{ key: 'on', label: 'Show' }]

const LAYER_ROWS: LabelFieldRow[] = [
  { key: 'rangeRings', label: 'Range rings' },
  { key: 'aara', label: 'A2A refuelling' },
  { key: 'awacs', label: 'AWACS' },
  { key: 'groundVehicles', label: 'Ground vehicles' },
  { key: 'towers', label: 'Towers' },
  { key: 'terrain', label: 'Terrain contours' },
  { key: 'airports', label: 'Airports' },
  { key: 'militaryBases', label: 'Military bases' },
]

const airStore = useAirStore()
const basemapStore = useBasemapStore()
const emit = defineEmits<{ stage: [fn: () => Promise<void>] }>()

function isLayerOn(_columnKey: string, layer: string): boolean {
  const key = layer as MapLayerKey
  if (key === 'terrain') return basemapStore.layers.terrain
  return airStore.overlayStates[key]
}

/**
 * Re-adopt both layer sets from the config database after the app-config JSON
 * is uploaded, so an edit made in the JSON editor moves these switches (and the
 * maps) without waiting for the post-apply reload.
 */
async function hydrateLayersFromDb(): Promise<void> {
  const [airSettings, appSettings] = await Promise.all([
    settingsApi.getNamespace('air'),
    settingsApi.getNamespace('app'),
  ])
  airStore.hydrateMapLayers(airSettings?.mapLayers)
  basemapStore.hydrateLayers(appSettings?.mapLayers)
}
useDocumentEvent('sentinel:config-uploaded', () => void hydrateLayersFromDb())

function toggleLayer(layer: MapLayerKey): void {
  if (layer === 'terrain') {
    basemapStore.setLayer('terrain', !basemapStore.layers.terrain)
  } else {
    airStore.setOverlay(layer, !airStore.overlayStates[layer])
  }
  // One staged entry covers both layer sets, so any number of flips is a single
  // idempotent write of the current state on APPLY.
  emit('stage', async () => {
    await Promise.all([airStore.persistMapLayers(), basemapStore.persistLayers()])
  })
}
</script>
