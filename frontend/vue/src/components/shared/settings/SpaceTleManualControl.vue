<template>
  <div class="tle-manual-wrap">
    <div class="tle-file-row">
      <input
        id="tle-file-input"
        type="file"
        accept=".tle,.txt"
        class="tle-file-input"
        @change="onFileChange"
      >
      <label for="tle-file-input" class="tle-file-label">CHOOSE FILE</label>
      <span class="tle-file-name">{{ fileName }}</span>
    </div>
    <div class="tle-cat-row-ctrl">
      <span class="settings-datasource-label tle-inline-label">CATEGORY</span>
      <div class="tle-dropdown" :class="{ 'tle-dropdown--open': dropOpen }" tabindex="0" @blur="dropOpen = false">
        <div class="tle-dropdown-selected" @mousedown.prevent="dropOpen = !dropOpen">
          <span class="tle-dropdown-selected-text" :class="{ 'tle-dropdown-selected-text--chosen': selectedCategory }">
            {{ selectedCategoryLabel }}
          </span>
          <span class="tle-dropdown-arrow"></span>
        </div>
        <div class="tle-dropdown-menu" :class="{ 'tle-dropdown-menu--open': dropOpen }">
          <div
            v-for="opt in TLE_CATEGORIES"
            :key="opt.value"
            class="tle-dropdown-item"
            @mousedown.prevent="selectCategory(opt.value)"
          >{{ opt.label }}</div>
        </div>
      </div>
      <button
        class="tle-action-btn tle-action-btn--primary"
        :disabled="applyLoading || !fileText"
        @click="apply"
      >{{ applyLoading ? 'UPDATING…' : 'UPDATE TLE' }}</button>
    </div>
    <div class="tle-status-line">
      <span v-if="statusMsg" class="tle-status-badge" :class="'tle-status-badge--' + statusType">{{ statusMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const TLE_CATEGORIES = [
  { value: 'active',        label: 'All Active (no category)' },
  { value: 'space_station', label: 'Space Stations' },
  { value: 'amateur',       label: 'Amateur Radio' },
  { value: 'weather',       label: 'Weather' },
  { value: 'military',      label: 'Military' },
  { value: 'navigation',    label: 'Navigation (GNSS)' },
  { value: 'science',       label: 'Science' },
  { value: 'cubesat',       label: 'CubeSats' },
  { value: 'unknown',       label: 'Unknown' },
]

const selectedCategory = ref('active')
const dropOpen = ref(false)
const fileText = ref('')
const fileName = ref('No file selected')
const applyLoading = ref(false)
const statusMsg = ref('')
const statusType = ref<'ok' | 'error' | 'info'>('ok')

const selectedCategoryLabel = computed(() =>
  TLE_CATEGORIES.find(c => c.value === selectedCategory.value)?.label ?? selectedCategory.value
)

function selectCategory(val: string): void {
  selectedCategory.value = val
  dropOpen.value = false
}

function onFileChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => { fileText.value = (ev.target?.result as string) ?? '' }
  reader.readAsText(file)
}

async function apply(): Promise<void> {
  if (!fileText.value) { statusMsg.value = 'Choose a file first'; statusType.value = 'error'; return }
  applyLoading.value = true
  statusMsg.value = ''
  try {
    const resp = await fetch('/api/space/tle/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fileText.value, category: selectedCategory.value || null }),
    })
    const data = await resp.json() as { inserted?: number; updated?: number; total?: number; error?: string }
    if (!resp.ok) throw new Error(data.error || resp.statusText)
    statusMsg.value = `${data.total ?? 0} satellites processed · ${data.inserted ?? 0} new · ${data.updated ?? 0} updated`
    statusType.value = 'ok'
    fileText.value = ''
    fileName.value = 'No file selected'
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    statusMsg.value = 'Error: ' + (err as Error).message
    statusType.value = 'error'
  } finally {
    applyLoading.value = false
  }
}
</script>
