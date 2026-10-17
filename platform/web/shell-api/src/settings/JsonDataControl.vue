<template>
  <div class="settings-config-wrap">
    <JsonCodeEditor
      v-if="visible"
      ref="editorRef"
      v-model="text"
      :accessible-name="`Editable JSON data (${filename})`"
      @update:model-value="onEdit"
    />
    <div class="settings-config-action-row">
      <BaseButton
        variant="ghost"
        class="settings-config-btn"
        style="--ba-ghost-hover-color: rgba(16, 19, 29, 0.95)"
        @click="toggleVisible"
      >
        {{ visible ? 'HIDE' : 'EDIT' }}
      </BaseButton>
      <BaseButton
        v-if="visible"
        variant="ghost"
        class="settings-config-btn"
        style="--ba-ghost-hover-color: rgba(16, 19, 29, 0.95)"
        @click="editorRef?.format()"
        >FORMAT</BaseButton
      >
      <BaseButton
        variant="ghost"
        class="settings-config-btn"
        style="--ba-ghost-hover-color: rgba(16, 19, 29, 0.95)"
        @click="exportData"
        >EXPORT</BaseButton
      >
      <span v-if="error" class="satradio-error">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import JsonCodeEditor from '@sentinel/shell-api/settings/JsonCodeEditor.vue'

// Generic JSON editor that loads from `getUrl` and saves to `postUrl`
// (POSTing the raw JSON body). Mirrors ConfigCurrentControl's UX — EDIT/HIDE,
// FORMAT, EXPORT, stage-on-edit so the global APPLY CHANGES button commits
// it — but for a single dedicated data file rather than the whole app config.
const props = defineProps<{ getUrl: string; postUrl: string; filename: string }>()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const store = useSettingsStore()

const editorRef = ref<InstanceType<typeof JsonCodeEditor> | null>(null)
const text = ref('Loading…')
const visible = ref(false)
const dirty = ref(false)
const error = ref('')

async function load(): Promise<void> {
  if (dirty.value) return
  try {
    const res = await fetch(props.getUrl)
    if (!res.ok) throw new Error(res.status.toString())
    text.value = JSON.stringify(await res.json(), null, 2)
  } catch (err) {
    text.value = 'Failed to load: ' + (err as Error).message
  }
}

onMounted(load)
watch(
  () => store.open,
  (isOpen) => {
    if (isOpen) load()
  },
)

function toggleVisible(): void {
  visible.value = !visible.value
}

function onEdit(): void {
  dirty.value = true
  error.value = ''
  emit('stage', async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text.value)
    } catch (err) {
      error.value = 'Invalid JSON: ' + (err as Error).message
      throw err
    }
    const res = await fetch(props.postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    })
    if (!res.ok) {
      const msg =
        ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? res.statusText
      error.value = 'Save failed: ' + msg
      throw new Error(msg)
    }
    dirty.value = false
    // Notify the SDR store / waterfall to re-hydrate from the DB, matching the
    // app-config editor's broadcast.
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    return res
  })
}

async function exportData(): Promise<void> {
  await load()
  const content = text.value
  if ('showSaveFilePicker' in window) {
    try {
      // The File System Access API isn't in the TS DOM lib; cast to its shape.
      const picker = (
        window as unknown as {
          showSaveFilePicker: (options: {
            suggestedName?: string
            types?: { description: string; accept: Record<string, string[]> }[]
          }) => Promise<FileSystemFileHandle>
        }
      ).showSaveFilePicker
      const handle = await picker({
        suggestedName: props.filename,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.satradio-error {
  font-size: var(--settings-text-small);
  color: #ff6b6b;
  align-self: center;
}
</style>
