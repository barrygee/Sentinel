<template>
  <!-- No field heading: the rows are self-evidently the fields. -->
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="ROWS"
    :is-checked="isChecked"
    :is-disabled="isDisabled"
    field-header=""
    @toggle="onToggle"
  />
</template>

<script setup lang="ts">
/**
 * Settings control for which data fields appear on aircraft map labels, chosen
 * independently for civil and military traffic. The ALWAYS ON column keeps a field
 * on a silhouette's resting label too, rather than only on hover and click, so
 * it can only be ticked for a field switched on for one of them.
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
import { useAirStore, type AdsbTagFields, type AdsbTagFieldMap } from '../stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<AdsbTagFields>({
  civil: { ...airStore.adsbTagFields.civil },
  mil: { ...airStore.adsbTagFields.mil },
  always: { ...airStore.adsbTagFields.always },
})

const COLUMNS: LabelFieldColumn[] = [
  { key: 'civil', label: 'Civil' },
  { key: 'mil', label: 'Military' },
  { key: 'always', label: 'Always On' },
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
      always: { ...airStore.adsbTagFields.always, ...remote.always },
    }
    airStore.setAdsbTagFields({ ...fields.value })
    window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  }
})

function isChecked(group: string, key: string): boolean {
  return fields.value[group as keyof AdsbTagFields][key as keyof AdsbTagFieldMap]
}

/** An ALWAYS ON box needs its field switched on for civil or military. */
function isDisabled(group: string, key: string): boolean {
  if (group !== 'always') return false
  const fieldKey = key as keyof AdsbTagFieldMap
  return !fields.value.civil[fieldKey] && !fields.value.mil[fieldKey]
}

function onToggle(group: string, key: string): void {
  toggle(group as keyof AdsbTagFields, key as keyof AdsbTagFieldMap)
}

function toggle(group: keyof AdsbTagFields, key: keyof AdsbTagFieldMap): void {
  const toggled = {
    ...fields.value,
    [group]: { ...fields.value[group], [key]: !fields.value[group][key] },
  }
  // A field switched off everywhere can't stay ticked as ALWAYS ON.
  const fieldIsOn = toggled.civil[key] || toggled.mil[key]
  fields.value = fieldIsOn ? toggled : { ...toggled, always: { ...toggled.always, [key]: false } }
  airStore.setAdsbTagFields({ ...fields.value })
  window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  // Returned, so APPLY waits for the save before it re-reads every setting —
  // otherwise that re-read can land first and put the old fields back.
  emit('stage', () => settingsApi.put('air', 'labelDataPoints', { ...fields.value }))
}
</script>
