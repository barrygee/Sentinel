<template>
  <div class="settings-config-wrap">
    <JsonCodeEditor
      v-if="visible"
      ref="editorRef"
      v-model="configText"
      accessible-name="Editable app configuration JSON"
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
        @click="exportConfig"
        >EXPORT</BaseButton
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { SETTINGS_CHANGED_EVENT } from '@sentinel/shell-api/services/settingsApi'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { isValidLatLon } from '@sentinel/map-kit/utils/locationUtils'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import JsonCodeEditor from '@sentinel/shell-api/settings/JsonCodeEditor.vue'

// Same key useUserLocation seeds sharedLocation from on reload. Clearing it
// here when the config location is emptied keeps the post-reload seed correct
// from frame 0 (otherwise a stale manual entry redraws the old marker).
const LOCATION_LS_KEY = 'sentinel_user_location'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const store = useSettingsStore()

const SS_KEY = 'sentinel_config_preview_visible'
const editorRef = ref<InstanceType<typeof JsonCodeEditor> | null>(null)
const configText = ref('Loading…')
const visible = ref(false)
// Set once the user manually edits the JSON (EDIT mode). While dirty we never
// auto-refresh — that would silently discard their unsaved changes.
const dirty = ref(false)

try {
  visible.value = sessionStorage.getItem(SS_KEY) === '1'
} catch {}

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
watch(
  () => store.open,
  (isOpen) => {
    if (isOpen) loadPreview()
  },
)

// Settings saved elsewhere while the panel is open (a map-layer switch, the
// location card's own SAVE, a radio added, an APRS/ADS-B source picked) change
// what the config contains — refetch so the JSON always shows the UI's state.
// loadPreview no-ops while the user has unsaved JSON edits (`dirty`).
useDocumentEvent(SETTINGS_CHANGED_EVENT, () => void loadPreview())

function toggleVisible(): void {
  visible.value = !visible.value
  try {
    sessionStorage.setItem(SS_KEY, visible.value ? '1' : '0')
  } catch {}
  // Revealing the editor is the moment the JSON is read: make sure it is current.
  if (visible.value) void loadPreview()
}

function onEdit(): void {
  dirty.value = true
  emit('stage', () => {
    const parsed = JSON.parse(configText.value)
    // If the user emptied/invalidated app.location in the JSON, drop the
    // stale localStorage entry now so the post-reload seed is correct and
    // the old marker is never redrawn (belt-and-braces with hydrateFromConfig).
    const cfgLoc = parsed?.app?.location
    const lat = parseFloat(String(cfgLoc?.latitude))
    const lon = parseFloat(String(cfgLoc?.longitude))
    if (!cfgLoc || !isValidLatLon(lat, lon)) {
      try {
        localStorage.removeItem(LOCATION_LS_KEY)
      } catch {}
    }
    const blob = new Blob([configText.value], { type: 'application/json' })
    const file = new File([blob], 'sentinel_config.json', { type: 'application/json' })
    const fd = new FormData()
    fd.append('file', file)
    return fetch('/api/settings/config/upload', { method: 'POST', body: fd }).then((res) => {
      // The upload replaced DB settings, but running stores still hold their
      // own cached copies (e.g. the sdr store's autoCenterWaterfallOnTune
      // localStorage fast-path). Broadcast so they re-hydrate from the DB —
      // otherwise editing a setting via this JSON editor has no effect on the
      // live UI until reload. Listeners refetch their namespace.
      if (res.ok) document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
      return res
    })
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
        suggestedName: 'sentinel_config.json',
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
  a.download = 'sentinel_config.json'
  a.click()
  URL.revokeObjectURL(url)
}
</script>
