<template>
  <div class="settings-datasource-wrap">
    <div class="settings-datasource-row">
      <span class="settings-datasource-label">URL</span>
      <input
        v-model="urlValue"
        type="url"
        class="settings-datasource-input"
        :placeholder="props.defaultUrl || 'https://'"
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

const props = defineProps<{ ns: string; defaultUrl: string }>()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const LS_KEY = `sentinel_${props.ns}_onlineUrl`
const urlValue = ref('')

const noDefault = props.defaultUrl === ''
function isPlaceholder(url: string): boolean {
  return !url.trim() || /^https?:\/\/?$/.test(url.trim())
}

try {
  const saved = localStorage.getItem(LS_KEY)
  if (saved && !(noDefault && isPlaceholder(saved))) urlValue.value = saved
  else if (noDefault && saved && isPlaceholder(saved)) {
    try { localStorage.removeItem(LS_KEY) } catch {}
  }
} catch {}

onMounted(async () => {
  const data = await settingsApi.getNamespace(props.ns)
  if (!data?.onlineUrl) return
  const backendVal = data.onlineUrl as string
  if (backendVal && !isPlaceholder(backendVal) && !urlValue.value) {
    urlValue.value = backendVal
    try { localStorage.setItem(LS_KEY, backendVal) } catch {}
  } else if (noDefault && backendVal && isPlaceholder(backendVal)) {
    try { localStorage.removeItem(LS_KEY) } catch {}
    settingsApi.put(props.ns, 'onlineUrl', '')
  }
})

function onInput(): void {
  emit('stage', () => {
    const val = urlValue.value.trim()
    if (val) {
      new URL(val)
      try { localStorage.setItem(LS_KEY, val) } catch {}
      settingsApi.put(props.ns, 'onlineUrl', val)
    } else {
      try { localStorage.removeItem(LS_KEY) } catch {}
      settingsApi.put(props.ns, 'onlineUrl', '')
    }
  })
}
</script>
