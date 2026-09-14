<template>
  <LabelFieldsTable :columns="COLUMNS" :rows="ROWS" :is-checked="isChecked" @toggle="onToggle" />
</template>

<script setup lang="ts">
/**
 * Settings control for which data fields appear on vessel map labels.
 *
 * The Sea counterpart of AprsLabelFieldsControl: one shared table, a single
 * column. The map picks changes up by watching the store, so no event bridge.
 */
import { ref, onMounted } from 'vue'
import LabelFieldsTable, { type LabelFieldColumn, type LabelFieldRow } from './LabelFieldsTable.vue'
import { useSeaStore, type SeaLabelFieldMap } from '@/stores/sea'
import * as settingsApi from '@/services/settingsApi'

const seaStore = useSeaStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<SeaLabelFieldMap>({ ...seaStore.labelFields })

const COLUMNS: LabelFieldColumn[] = [{ key: 'show', label: 'Show' }]

const ROWS: LabelFieldRow[] = [
  { key: 'name', abbr: 'NAME', label: 'Vessel name' },
  { key: 'type', abbr: 'TYPE', label: 'Vessel type' },
  { key: 'mmsi', abbr: 'MMSI', label: 'MMSI' },
  { key: 'destination', abbr: 'DEST', label: 'Destination' },
  { key: 'speed', abbr: 'SPD', label: 'Speed' },
  { key: 'course', abbr: 'CRS', label: 'Course' },
]

// Adopt the backend's stored choice on open, so the panel reflects what other
// devices set rather than this browser's last local edit.
onMounted(async () => {
  const data = await settingsApi.getNamespace('sea')
  const remote = data?.labelDataPoints as Partial<SeaLabelFieldMap> | undefined
  if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
    fields.value = { ...seaStore.labelFields, ...remote }
    seaStore.setLabelFields({ ...fields.value })
  }
})

function isChecked(_column: string, key: string): boolean {
  return fields.value[key as keyof SeaLabelFieldMap]
}

function onToggle(_column: string, key: string): void {
  const field = key as keyof SeaLabelFieldMap
  fields.value = { ...fields.value, [field]: !fields.value[field] }
  seaStore.setLabelFields({ ...fields.value })
  emit('stage', () => {
    settingsApi.put('sea', 'labelDataPoints', { ...fields.value })
  })
}
</script>
