<template>
  <div class="settings-config-wrap">
    <textarea
      v-model="configText"
      class="settings-config-preview settings-config-preview--textarea"
      :class="{ 'settings-config-preview--hidden': !visible }"
      spellcheck="false"
      autocomplete="off"
      @input="onEdit"
    ></textarea>
    <div class="settings-config-action-row">
      <button class="settings-config-btn" @click="toggleVisible">{{ visible ? 'HIDE' : 'EDIT' }}</button>
      <button class="settings-config-btn" @click="exportConfig">EXPORT</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const store = useSettingsStore()

const SS_KEY = 'sentinel_config_preview_visible'
const configText = ref('Loading…')
const visible = ref(false)
// Set once the user manually edits the JSON (EDIT mode). While dirty we never
// auto-refresh — that would silently discard their unsaved changes.
const dirty = ref(false)

try { visible.value = sessionStorage.getItem(SS_KEY) === '1' } catch {}

// Single source of truth for fetching the live config. Re-invoked on panel
// open and before export so the preview/export always reflect current state
// (e.g. SDR groups/frequencies added while the panel stayed open).
async function loadPreview(): Promise<void> {
  if (dirty.value) return
  try {
    const res = await fetch('/api/settings/config/preview')
    if (!res.ok) throw new Error(res.status.toString())
    const data = await res.json()
    configText.value = JSON.stringify(data, null, 2)
  } catch (err) {
    configText.value = 'Failed to load config: ' + (err as Error).message
  }
}

onMounted(loadPreview)

// Settings panel stays mounted (CSS toggle); refetch each time it reopens so
// a config changed elsewhere (SDR panel) is reflected without a remount.
watch(() => store.open, (isOpen) => {
  if (isOpen) loadPreview()
})

function toggleVisible(): void {
  visible.value = !visible.value
  try { sessionStorage.setItem(SS_KEY, visible.value ? '1' : '0') } catch {}
}

function onEdit(): void {
  dirty.value = true
  emit('stage', () => {
    JSON.parse(configText.value)
    const blob = new Blob([configText.value], { type: 'application/json' })
    const file = new File([blob], 'sentinel_config.json', { type: 'application/json' })
    const fd = new FormData()
    fd.append('file', file)
    return fetch('/api/settings/config/upload', { method: 'POST', body: fd })
  })
}

async function exportConfig(): Promise<void> {
  // Pull the latest server state first so the downloaded file is never stale,
  // however long the panel has been open. Skipped when the user has unsaved
  // edits (loadPreview no-ops on dirty) — we export their text as-is.
  await loadPreview()
  const content = configText.value
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'sentinel_config.json',
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (err: any) {
      if (err.name === 'AbortError') return
    }
  }
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sentinel_config.json'
  a.click()
  URL.revokeObjectURL(url)
}
</script>
