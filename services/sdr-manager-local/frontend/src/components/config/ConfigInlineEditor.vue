<template>
  <div class="config-inline-editor">
    <JsonCodeEditor
      v-if="visible"
      ref="editorRef"
      v-model="configText"
      accessible-name="Editable SDR Manager configuration JSON"
      @update:model-value="onEdit"
    />
    <p v-if="loadError" class="sdr-devices-form-error config-inline-editor-error" role="alert">
      {{ loadError }}
    </p>
    <div class="sdr-devices-form-actions config-inline-editor-actions">
      <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="toggleVisible">
        {{ visible ? 'HIDE' : 'EDIT' }}
      </BaseButton>
      <BaseButton
        v-if="visible"
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        @click="editorRef?.format()"
      >
        FORMAT
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ConfigInlineEditor` — this machine's SDR Manager configuration as JSON,
 * edited in place like App Settings' Application Config: EDIT shows it, FORMAT
 * tidies it, and an edit is staged — APPLY CHANGES imports it, nothing sooner.
 *
 * Hotspot settings are applied only when the edit changed them: applying them
 * can change which network this machine offers (and with it the connection
 * this page arrived on), so an edit to a dongle's name must never also
 * re-apply the hotspot. The file import makes the same choice opt-in.
 */
import { ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import JsonCodeEditor from '@sentinel/shell-api/settings/JsonCodeEditor.vue'
import * as api from '../../api/sdrManagerLocalApi'
import type { LocalConfigFile } from '../../api/types'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { configErrorMessage } from '../../utils/errorMessages'
import '@sentinel/shell-api/settings/styles/deviceList.css'

const emit = defineEmits<{ stage: [apply: () => Promise<void>] }>()

const devices = useLocalSdrStore()
const auth = useLocalAuthStore()
const editorRef = ref<InstanceType<typeof JsonCodeEditor> | null>(null)
const visible = ref(false)
const configText = ref('')
const loadError = ref<string | null>(null)
/** The configuration as last read, to tell whether an edit touched the hotspot. */
let loaded: LocalConfigFile | null = null
/** Set by an edit; while set, the text is never replaced by a fresh read. */
let dirty = false

async function load(): Promise<void> {
  if (dirty) return
  loadError.value = null
  try {
    loaded = await api.getConfig()
    configText.value = JSON.stringify(loaded, null, 2)
  } catch (error) {
    loadError.value = configErrorMessage(error, 'Could not read this machine’s configuration.')
  }
}

function toggleVisible(): void {
  visible.value = !visible.value
  // Showing the editor is when the JSON is read, so it is current.
  if (visible.value) void load()
}

function onEdit(): void {
  dirty = true
  emit('stage', apply)
}

/** What APPLY CHANGES runs. Throws (and imports nothing) on JSON that doesn't parse. */
async function apply(): Promise<void> {
  const config = JSON.parse(configText.value) as LocalConfigFile
  const hotspotChanged =
    JSON.stringify(config.hotspot ?? null) !== JSON.stringify(loaded?.hotspot ?? null)
  const result = await api.importConfig({
    config,
    apply_devices: true,
    apply_hotspot: hotspotChanged,
  })
  devices.announce(`Configuration applied: ${result.devices_applied} applied.`)
  // Imported ports change which ones are free, and the file may set the console password.
  void devices.refreshConstraints()
  void auth.refresh()
  dirty = false
  await load()
}
</script>

<style scoped>
.config-inline-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-inline-editor-actions {
  justify-content: flex-start;
}
.config-inline-editor-error {
  margin-left: 0;
}
</style>
