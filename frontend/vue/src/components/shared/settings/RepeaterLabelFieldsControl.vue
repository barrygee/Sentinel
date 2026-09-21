<template>
  <LabelFieldsTable :columns="COLUMNS" :rows="ROWS" :is-checked="isChecked" @toggle="onToggle" />
</template>

<script setup lang="ts">
/**
 * Settings control for which data fields appear on amateur-radio repeater
 * map labels — the repeater counterpart of `AprsLabelFieldsControl` and
 * `SeaLabelFieldsControl`: the same shared table, a single column. The live
 * map picks changes up by watching the repeaters store, so no event bridge.
 */
import { ref, onMounted } from 'vue'
import LabelFieldsTable, { type LabelFieldColumn, type LabelFieldRow } from './LabelFieldsTable.vue'
import { useRepeatersStore } from '@/stores/repeaters'
import * as settingsApi from '@/services/settingsApi'
import type { RepeaterLabelFieldMap } from '@/types/repeaters'

const repeatersStore = useRepeatersStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<RepeaterLabelFieldMap>({ ...repeatersStore.labelFields })

const COLUMNS: LabelFieldColumn[] = [{ key: 'show', label: 'Show' }]

const ROWS: LabelFieldRow[] = [
  { key: 'symbol', abbr: 'SYM', label: 'Repeater symbol' },
  { key: 'callsign', abbr: 'CSS', label: 'Callsign' },
  { key: 'band', abbr: 'BAND', label: 'Band (colour-coded)' },
  { key: 'location', abbr: 'QTH', label: 'Location' },
  { key: 'modes', abbr: 'MODE', label: 'Modes' },
  { key: 'output', abbr: 'OUT', label: 'Output frequency' },
  { key: 'input', abbr: 'IN', label: 'Input frequency' },
  { key: 'tone', abbr: 'TONE', label: 'CTCSS tone / colour code' },
  { key: 'channel', abbr: 'CH', label: 'Channel' },
  { key: 'locator', abbr: 'LOC', label: 'Locator' },
  { key: 'keeper', abbr: 'KPR', label: 'Keeper' },
  { key: 'status', abbr: 'STATUS', label: 'Status' },
]

// Adopt the backend's stored choice on open, so the panel reflects what other
// devices set rather than this browser's last local edit.
onMounted(async () => {
  const data = await settingsApi.getNamespace('land')
  const remote = data?.repeaterLabelFields as Partial<RepeaterLabelFieldMap> | undefined
  if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
    fields.value = { ...repeatersStore.labelFields, ...remote }
    repeatersStore.setLabelFields({ ...fields.value })
  }
})

function isChecked(_column: string, key: string): boolean {
  return fields.value[key as keyof RepeaterLabelFieldMap]
}

function onToggle(_column: string, key: string): void {
  const field = key as keyof RepeaterLabelFieldMap
  fields.value = { ...fields.value, [field]: !fields.value[field] }
  repeatersStore.setLabelFields({ ...fields.value })
  emit('stage', () => {
    settingsApi.put('land', 'repeaterLabelFields', { ...fields.value })
  })
}
</script>
