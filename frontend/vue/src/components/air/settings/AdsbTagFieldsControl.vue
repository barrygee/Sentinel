<template>
  <!-- No field heading: the rows are self-evidently the fields. -->
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="ROWS"
    :is-checked="isChecked"
    field-header=""
    @toggle="onToggle"
  />
</template>

<script setup lang="ts">
/**
 * Settings control for which data fields appear on aircraft map labels, chosen
 * independently for civil and military traffic.
 *
 * Layout and chrome come from LabelFieldsTable; this component owns the ADS-B
 * field list and the three-way persistence (store → localStorage, backend, and
 * the live map via a DOM event the ADS-B control listens for).
 */
import { ref, onMounted } from 'vue'
import LabelFieldsTable, {
  type LabelFieldColumn,
  type LabelFieldRow,
} from '@sentinel/ui/base/LabelFieldsTable.vue'
import { useAirStore, type AdsbTagFields, type AdsbTagFieldMap } from '@/stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<AdsbTagFields>({
  civil: { ...airStore.adsbTagFields.civil },
  mil: { ...airStore.adsbTagFields.mil },
})

const COLUMNS: LabelFieldColumn[] = [
  { key: 'civil', label: 'Civil' },
  { key: 'mil', label: 'Military' },
]

const ROWS: LabelFieldRow[] = [
  { key: 'callsign', label: 'Callsign' },
  { key: 'altitude', label: 'Altitude' },
  { key: 'speed', label: 'Speed' },
  { key: 'heading', label: 'Heading' },
  { key: 'aircraftType', label: 'Aircraft Type' },
  { key: 'registration', label: 'Registration' },
  { key: 'squawk', label: 'Squawk' },
  { key: 'category', label: 'Category' },
]

onMounted(async () => {
  const data = await settingsApi.getNamespace('air')
  const remote = data?.labelDataPoints as AdsbTagFields | undefined
  if (
    remote &&
    typeof remote === 'object' &&
    !Array.isArray(remote) &&
    typeof remote.civil === 'object' &&
    typeof remote.mil === 'object'
  ) {
    fields.value = {
      civil: { ...airStore.adsbTagFields.civil, ...remote.civil },
      mil: { ...airStore.adsbTagFields.mil, ...remote.mil },
    }
    airStore.setAdsbTagFields({ ...fields.value })
    window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  }
})

function isChecked(group: string, key: string): boolean {
  return fields.value[group as keyof AdsbTagFields][key as keyof AdsbTagFieldMap]
}

function onToggle(group: string, key: string): void {
  toggle(group as keyof AdsbTagFields, key as keyof AdsbTagFieldMap)
}

function toggle(group: keyof AdsbTagFields, key: keyof AdsbTagFieldMap): void {
  fields.value = {
    ...fields.value,
    [group]: { ...fields.value[group], [key]: !fields.value[group][key] },
  }
  airStore.setAdsbTagFields({ ...fields.value })
  window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  emit('stage', () => {
    settingsApi.put('air', 'labelDataPoints', { ...fields.value })
  })
}
</script>
