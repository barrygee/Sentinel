<template>
  <div class="settings-datasource-wrap">
    <div class="settings-datasource-row">
      <span class="settings-datasource-label">URL</span>
      <input
        v-model="urlValue"
        type="url"
        class="settings-datasource-input"
        placeholder="https://"
        spellcheck="false"
        autocomplete="off"
        @input="onInput"
        @keydown.enter="emit('commit')"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'

const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const LS_KEY = 'sentinel_app_connectivityProbeUrl'
const urlValue = ref('')

try {
  urlValue.value = localStorage.getItem(LS_KEY) ?? ''
} catch {}

onMounted(async () => {
  const data = await settingsApi.getNamespace('app')
  if (data?.connectivityProbeUrl && !urlValue.value) {
    urlValue.value = data.connectivityProbeUrl as string
    try { localStorage.setItem(LS_KEY, urlValue.value) } catch {}
  }
})

function onInput(): void {
  emit('stage', () => {
    const val = urlValue.value.trim()
    if (val) {
      new URL(val)
      try { localStorage.setItem(LS_KEY, val) } catch {}
      settingsApi.put('app', 'connectivityProbeUrl', val)
    } else {
      try { localStorage.removeItem(LS_KEY) } catch {}
      settingsApi.put('app', 'connectivityProbeUrl', '')
    }
  })
}
</script>
