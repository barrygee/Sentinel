<template>
  <LocalAuthGate>
    <div class="sdr-devices-accordion config-transfer">
      <p class="config-transfer-note sdr-devices-note">
        Save this machine’s device names, ports and tuning, and its hotspot, to a file — to back it
        up, or to set up another SDR Manager the same way. The hotspot and console passwords are
        never written to it.
      </p>
      <ConfigInlineEditor @stage="(apply) => emit('stage', apply)" />
      <div class="sdr-devices-form-actions config-transfer-export">
        <BaseButton
          type="button"
          variant="ghost"
          class="sdr-devices-btn"
          :disabled="busy"
          @click="exportFile"
        >
          DOWNLOAD CONFIGURATION
        </BaseButton>
      </div>
      <h4 class="settings-group-label">IMPORT</h4>
      <ConfigImportForm ref="importForm" :busy="busy" @import="importFile" />
      <p v-if="errorMessage" class="sdr-devices-form-error config-transfer-error" role="alert">
        {{ errorMessage }}
      </p>
      <ConfigImportReport v-if="result" :result="result" />
    </div>
  </LocalAuthGate>
</template>

<script setup lang="ts">
/**
 * `ConfigTransferControl` — the CONFIGURATION card: this machine's SDR
 * Manager configuration, edited in place (`ConfigInlineEditor`, staged for
 * APPLY CHANGES), downloaded as a JSON file, or imported from one.
 *
 * The download is fetched and saved by the page rather than linked, so a
 * signed-out browser gets an error here instead of a bare 401 page.
 */
import { ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import * as api from '../../api/sdrManagerLocalApi'
import type { LocalConfigImportRequest, LocalConfigImportResult } from '../../api/types'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { configErrorMessage } from '../../utils/errorMessages'
import LocalAuthGate from '../auth/LocalAuthGate.vue'
import ConfigImportForm from './ConfigImportForm.vue'
import ConfigInlineEditor from './ConfigInlineEditor.vue'
import ConfigImportReport from './ConfigImportReport.vue'
import '@sentinel/shell-api/settings/styles/deviceList.css'

/** The name the API gives the same file at `/config/download`. */
const EXPORT_FILE_NAME = 'sdr-manager-local-config.json'

const emit = defineEmits<{ stage: [apply: () => Promise<void>] }>()

const devices = useLocalSdrStore()
const auth = useLocalAuthStore()
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<LocalConfigImportResult | null>(null)
const importForm = ref<InstanceType<typeof ConfigImportForm> | null>(null)

async function exportFile(): Promise<void> {
  busy.value = true
  errorMessage.value = null
  try {
    const config = await api.getConfig()
    const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = EXPORT_FILE_NAME
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    errorMessage.value = configErrorMessage(error, 'Could not read this machine’s configuration.')
  } finally {
    busy.value = false
  }
}

async function importFile(body: LocalConfigImportRequest): Promise<void> {
  busy.value = true
  errorMessage.value = null
  result.value = null
  try {
    result.value = await api.importConfig(body)
    importForm.value?.clear()
    devices.announce(`Configuration imported: ${result.value.devices_applied} applied.`)
    // Imported ports change which ones are free, and a provisioning file may
    // have set the console password.
    void devices.refreshConstraints()
    void auth.refresh()
  } catch (error) {
    errorMessage.value = configErrorMessage(error, 'The configuration could not be imported.')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.config-transfer-export {
  justify-content: flex-start;
}
.config-transfer-error {
  margin-left: 0;
}
</style>
