<template>
  <div class="tle-uncat-wrap">
    <div class="tle-uncat-count">{{ countLine }}</div>
    <div v-if="satellites.length > 0" class="tle-uncat-list">
      <div
        v-for="sat in satellites"
        :key="sat.norad_id"
        class="tle-uncat-row"
      >
        <span class="tle-uncat-name">{{ sat.name }}</span>
        <span class="tle-uncat-id">{{ sat.norad_id }}</span>
        <div class="tle-dropdown tle-uncat-drop" :class="{ 'tle-dropdown--open': openDrop === sat.norad_id }" tabindex="0" @blur="openDrop = ''">
          <div class="tle-dropdown-selected" @mousedown.prevent="openDrop = openDrop === sat.norad_id ? '' : sat.norad_id">
            <span class="tle-dropdown-selected-text" :class="{ 'tle-dropdown-selected-text--chosen': assignments[sat.norad_id] }">
              {{ assignments[sat.norad_id] ? catLabel(assignments[sat.norad_id]) : TLE_ASSIGN_CATEGORIES[0].label }}
            </span>
            <span class="tle-dropdown-arrow"></span>
          </div>
          <div class="tle-dropdown-menu" :class="{ 'tle-dropdown-menu--open': openDrop === sat.norad_id }">
            <div
              v-for="opt in TLE_ASSIGN_CATEGORIES"
              :key="opt.value"
              class="tle-dropdown-item"
              @mousedown.prevent="assignCategory(sat.norad_id, opt.value)"
            >{{ opt.label }}</div>
          </div>
        </div>
      </div>
    </div>
    <button
      v-if="satellites.length > 0"
      class="tle-action-btn"
      :disabled="saveLoading"
      @click="saveAll"
    >{{ saveLoading ? 'SAVING…' : 'SAVE ALL' }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDocumentEvent } from '../../../composables/useDocumentEvent'

const TLE_ASSIGN_CATEGORIES = [
  { value: 'space_station', label: 'Space Stations' },
  { value: 'amateur',       label: 'Amateur Radio' },
  { value: 'weather',       label: 'Weather' },
  { value: 'military',      label: 'Military' },
  { value: 'navigation',    label: 'Navigation (GNSS)' },
  { value: 'science',       label: 'Science' },
  { value: 'cubesat',       label: 'CubeSats' },
  { value: 'unknown',       label: 'Unknown' },
]

type Sat = { norad_id: string; name: string }

const satellites = ref<Sat[]>([])
const assignments = ref<Record<string, string>>({})
const openDrop = ref('')
const countLine = ref('Loading…')
const saveLoading = ref(false)

function catLabel(val: string): string {
  return TLE_ASSIGN_CATEGORIES.find(c => c.value === val)?.label ?? val
}

function assignCategory(noradId: string, val: string): void {
  assignments.value[noradId] = val
  openDrop.value = ''
}

async function load(): Promise<void> {
  try {
    const resp = await fetch('/api/space/tle/uncategorised')
    if (!resp.ok) throw new Error(resp.statusText)
    const data = await resp.json() as { satellites: Sat[] }
    satellites.value = data.satellites
    assignments.value = {}
    countLine.value = data.satellites.length === 0
      ? 'All satellites are categorised'
      : `${data.satellites.length} satellites have no category`
  } catch { countLine.value = 'Failed to load' }
}

async function saveAll(): Promise<void> {
  const toSave = Object.entries(assignments.value)
    .filter(([, cat]) => !!cat)
    .map(([norad_id, category]) => ({ norad_id, category }))
  if (!toSave.length) return
  saveLoading.value = true
  try {
    const resp = await fetch('/api/space/tle/category', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: toSave }),
    })
    if (!resp.ok) throw new Error((await resp.json() as { error?: string }).error ?? resp.statusText)
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    countLine.value = 'Error saving: ' + (err as Error).message
  } finally {
    saveLoading.value = false
  }
}

function onRefresh(): void { load() }

onMounted(() => { load() })
useDocumentEvent('tle:refreshStatus', onRefresh)
</script>
