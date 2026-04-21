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
import { ref, nextTick, onMounted } from 'vue'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const SS_KEY = 'sentinel_config_preview_visible'
const configText = ref('Loading…')
const visible = ref(false)

try { visible.value = sessionStorage.getItem(SS_KEY) === '1' } catch {}

onMounted(async () => {
  try {
    const res = await fetch('/api/settings/config/preview')
    if (!res.ok) throw new Error(res.status.toString())
    const data = await res.json()
    configText.value = JSON.stringify(data, null, 2)
  } catch (err) {
    configText.value = 'Failed to load config: ' + (err as Error).message
  }
})

function toggleVisible(): void {
  visible.value = !visible.value
  try { sessionStorage.setItem(SS_KEY, visible.value ? '1' : '0') } catch {}
}

function onEdit(): void {
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
