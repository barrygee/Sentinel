<template>
  <div class="tle-manual-wrap">
    <div class="tle-file-row">
      <input
        id="tle-file-input"
        type="file"
        accept=".tle,.txt"
        class="tle-file-input"
        @change="onFileChange"
      />
      <label for="tle-file-input" class="tle-file-label">CHOOSE FILE</label>
      <span class="tle-file-name">{{ fileName }}</span>
    </div>
    <div class="tle-cat-row-ctrl">
      <SettingsDropdown
        v-model="selectedCategory"
        class="tle-category-dropdown"
        :options="TLE_CATEGORIES"
        accessible-name="TLE category"
      />
      <BaseButton
        variant="primary"
        class="tle-action-btn tle-action-btn--primary"
        style="
          --ba-primary-font-weight: 600;
          --ba-primary-letter-spacing: 0.16em;
          --ba-disabled-opacity: 0.4;
          --ba-disabled-cursor: default;
        "
        :disabled="applyLoading || !fileText"
        @click="apply"
      >
        {{ applyLoading ? 'UPDATING…' : 'UPDATE TLE' }}
      </BaseButton>
    </div>
    <div class="tle-status-line">
      <span v-if="statusMsg" class="tle-status-badge" :class="'tle-status-badge--' + statusType">{{
        statusMsg
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import SettingsDropdown from '@sentinel/ui/base/SettingsDropdown.vue'
import './TleCategoryRow.css'

const TLE_CATEGORIES = [
  { value: 'active', label: 'All Active (no category)' },
  { value: 'space_station', label: 'Space Stations' },
  { value: 'amateur', label: 'Amateur Radio' },
  { value: 'weather', label: 'Weather' },
  { value: 'military', label: 'Military' },
  { value: 'navigation', label: 'Navigation (GNSS)' },
  { value: 'science', label: 'Science' },
  { value: 'cubesat', label: 'CubeSats' },
  { value: 'unknown', label: 'Unknown' },
]

const selectedCategory = ref('active')
const fileText = ref('')
const fileName = ref('No file selected')
const applyLoading = ref(false)
const statusMsg = ref('')
const statusType = ref<'ok' | 'error' | 'info'>('ok')

function onFileChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => {
    fileText.value = (ev.target?.result as string) ?? ''
  }
  reader.readAsText(file)
}

async function apply(): Promise<void> {
  /* v8 ignore start -- defensive: the UPDATE TLE button is disabled until a
     file has been read, so apply() is never reached with empty fileText */
  if (!fileText.value) {
    statusMsg.value = 'Choose a file first'
    statusType.value = 'error'
    return
  }
  /* v8 ignore stop */
  applyLoading.value = true
  statusMsg.value = ''
  try {
    const resp = await fetch('/api/space/tle/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* v8 ignore start -- selectedCategory always defaults to a real value, so
         the `|| null` fallback is defensive only */
      body: JSON.stringify({ text: fileText.value, category: selectedCategory.value || null }),
      /* v8 ignore stop */
    })
    const data = (await resp.json()) as {
      inserted?: number
      updated?: number
      total?: number
      error?: string
    }
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

<style scoped>
.tle-manual-wrap {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: var(--settings-control-measure);
}

/* A hairline-ruled file picker: the native input is hidden behind the
   CHOOSE FILE label, with the chosen file's name beside it. */
.tle-file-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: transparent;
  box-shadow: inset 0 -1px 0 var(--settings-field-line);
  border-radius: 0;
  overflow: hidden;
}

.tle-file-input {
  display: none;
}

.tle-file-label {
  flex-shrink: 0;
  padding: 0 12px;
  background: none;
  border: none;
  color: var(--ink-secondary);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition:
    background 0.15s,
    color 0.15s;
  user-select: none;
}

.tle-file-label:hover {
  color: rgba(var(--ink-rgb), 0.85);
}

.tle-file-name {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  font-weight: 400;
  color: var(--ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.04em;
}
</style>
