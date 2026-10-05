<template>
  <LabelFieldsTable
    :columns="COLUMNS"
    :rows="ROWS"
    :is-checked="isIncluded"
    :is-disabled="isLocked"
    :show-header="false"
    control="switch"
    field-header="Content"
    @toggle="(_columnKey, rowKey) => toggleContent(rowKey as ContentKey)"
  />
</template>

<script setup lang="ts">
/**
 * `ContentChecks` — the Basemap/Terrain switches (D3 in the plan: content
 * choices, not theme choices, because all three basemap themes share the same
 * tiles — unticking a theme would save nothing). Drawn as the same switch list
 * as Settings › Map Layers. At least one must stay on: whichever is the only
 * one on is disabled, and the store ignores a request to switch it off, so
 * there is no way to reach "both off" rather than a validation message after
 * the fact.
 */
import LabelFieldsTable, { type LabelFieldRow } from '@sentinel/ui/base/LabelFieldsTable.vue'

type ContentKey = 'basemap' | 'terrain'

const props = defineProps<{
  includeBasemap: boolean
  includeTerrain: boolean
}>()

const emit = defineEmits<{
  'update:includeBasemap': [value: boolean]
  'update:includeTerrain': [value: boolean]
}>()

// One unlabelled column, as in Map Layers: every row is a plain on/off.
const COLUMNS = [{ key: 'on', label: 'Include' }]

const ROWS: LabelFieldRow[] = [
  { key: 'basemap', label: 'Basemap' },
  { key: 'terrain', label: 'Terrain' },
]

function isIncluded(_columnKey: string, rowKey: string): boolean {
  return rowKey === 'basemap' ? props.includeBasemap : props.includeTerrain
}

/** The one option still on is locked, so both can never be off. */
function isLocked(columnKey: string, rowKey: string): boolean {
  return isIncluded(columnKey, rowKey) && props.includeBasemap !== props.includeTerrain
}

function toggleContent(content: ContentKey): void {
  if (content === 'basemap') emit('update:includeBasemap', !props.includeBasemap)
  else emit('update:includeTerrain', !props.includeTerrain)
}
</script>
