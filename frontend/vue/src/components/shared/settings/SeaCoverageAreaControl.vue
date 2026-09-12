<template>
  <div class="settings-location-wrap">
    <p class="settings-location-status">{{ statusText }}</p>
    <p v-if="errorText" class="settings-location-notice" role="alert">{{ errorText }}</p>

    <div class="settings-location-fields sea-coverage-fields">
      <div v-for="edge in EDGES" :key="edge.key" class="settings-location-field">
        <label class="settings-location-label" :for="inputIds[edge.key]">{{ edge.label }}</label>
        <input
          :id="inputIds[edge.key]"
          v-model="drafts[edge.key]"
          type="text"
          inputmode="decimal"
          class="settings-location-input"
          :class="{ 'settings-location-input--invalid': errorText !== null }"
          :aria-invalid="errorText !== null"
          :placeholder="edge.placeholder"
          spellcheck="false"
          @input="onInput"
        />
      </div>
    </div>

    <div class="settings-location-actions sea-coverage-actions">
      <BaseButton variant="ghost" bordered :disabled="!viewportBbox" @click="useCurrentView">
        USE CURRENT MAP VIEW
      </BaseButton>
      <BaseButton variant="ghost" bordered @click="useWorldwide">WORLDWIDE</BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › SEA › Coverage Area — the bounding box the AISStream subscription
 * asks for.
 *
 * Worldwide (the default) is hundreds of AIS messages a second; a regional box
 * keeps a small host comfortable and the map focused. Edits are staged for
 * APPLY CHANGES like the other Sea settings; the backend re-subscribes within
 * one watchdog tick of the write. Only a single box is edited here — the
 * setting itself allows several, for a config uploaded by hand.
 */
import { ref, computed, onMounted, reactive, useId } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import * as settingsApi from '@/services/settingsApi'
import { useSeaStore } from '@/stores/sea'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const seaStore = useSeaStore()

type EdgeKey = 'south' | 'west' | 'north' | 'east'
const EDGES: { key: EdgeKey; label: string; placeholder: string }[] = [
  { key: 'south', label: 'SOUTH', placeholder: '-90' },
  { key: 'west', label: 'WEST', placeholder: '-180' },
  { key: 'north', label: 'NORTH', placeholder: '90' },
  { key: 'east', label: 'EAST', placeholder: '180' },
]
const WORLD: Record<EdgeKey, string> = { south: '-90', west: '-180', north: '90', east: '180' }

const inputIds: Record<EdgeKey, string> = {
  south: useId(),
  west: useId(),
  north: useId(),
  east: useId(),
}
const drafts = reactive<Record<EdgeKey, string>>({ ...WORLD })
const errorText = ref<string | null>(null)
const viewportBbox = computed(() => seaStore.viewportBbox)

const statusText = computed(() => {
  const parsed = parseDrafts()
  if (!parsed) return 'Decimal degrees. South and west first, then north and east.'
  const [south, west, north, east] = parsed
  if (south <= -90 && west <= -180 && north >= 90 && east >= 180) {
    return 'Worldwide — every vessel AISStream hears.'
  }
  return `${Math.abs(south).toFixed(1)}°${south < 0 ? 'S' : 'N'} – ${Math.abs(north).toFixed(1)}°${north < 0 ? 'S' : 'N'}, ${Math.abs(west).toFixed(1)}°${west < 0 ? 'W' : 'E'} – ${Math.abs(east).toFixed(1)}°${east < 0 ? 'W' : 'E'}`
})

/** The four drafts as numbers, or null if any is blank or not a number. */
function parseDrafts(): [number, number, number, number] | null {
  const values = EDGES.map((edge) => Number(drafts[edge.key].trim()))
  if (
    values.some((value) => !Number.isFinite(value)) ||
    EDGES.some((edge) => !drafts[edge.key].trim())
  ) {
    return null
  }
  return values as [number, number, number, number]
}

function validate(): string | null {
  const parsed = parseDrafts()
  if (!parsed) return 'All four edges are needed, in decimal degrees.'
  const [south, west, north, east] = parsed
  if (Math.abs(south) > 90 || Math.abs(north) > 90) return 'Latitudes must be between -90 and 90.'
  if (Math.abs(west) > 180 || Math.abs(east) > 180)
    return 'Longitudes must be between -180 and 180.'
  if (south > north) return 'South must not be north of north.'
  return null
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('sea')
  const boxes = data?.aisBoundingBoxes
  if (Array.isArray(boxes) && Array.isArray(boxes[0]) && boxes[0].length === 2) {
    const [[south, west], [north, east]] = boxes[0] as [[number, number], [number, number]]
    drafts.south = String(south)
    drafts.west = String(west)
    drafts.north = String(north)
    drafts.east = String(east)
  }
})

function onInput(): void {
  errorText.value = validate()
  if (errorText.value) return
  const [south, west, north, east] = parseDrafts()!
  emit('stage', () =>
    settingsApi.put('sea', 'aisBoundingBoxes', [
      [
        [south, west],
        [north, east],
      ],
    ]),
  )
}

function useCurrentView(): void {
  const bbox = viewportBbox.value
  if (!bbox) return
  const [south, west, north, east] = bbox
  drafts.south = south.toFixed(2)
  drafts.west = west.toFixed(2)
  drafts.north = north.toFixed(2)
  drafts.east = east.toFixed(2)
  onInput()
}

function useWorldwide(): void {
  Object.assign(drafts, WORLD)
  onInput()
}
</script>

<style scoped>
.sea-coverage-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.sea-coverage-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
