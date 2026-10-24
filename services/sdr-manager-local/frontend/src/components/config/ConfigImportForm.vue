<template>
  <form class="config-import" @submit.prevent="emitImport">
    <div class="sdr-devices-form-row">
      <label class="sdr-devices-form-label" :for="FILE_FIELD_ID">FILE</label>
      <input
        :id="FILE_FIELD_ID"
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="config-import-file"
        :aria-describedby="fileError ? FILE_ERROR_ID : undefined"
        :aria-invalid="fileError !== null"
        @change="pickFile"
      />
    </div>
    <p v-if="fileError" :id="FILE_ERROR_ID" class="sdr-devices-form-error">{{ fileError }}</p>
    <template v-if="staged">
      <p class="config-import-summary">
        {{ staged.fileName }}: {{ deviceCount }} {{ deviceCount === 1 ? 'device' : 'devices'
        }}{{ hasHotspot ? ' and hotspot settings' : '' }}.
      </p>
      <fieldset class="config-import-choices">
        <legend class="sdr-devices-form-label">APPLY</legend>
        <label class="config-import-check">
          <input v-model="applyDevices" type="checkbox" :disabled="deviceCount === 0" />
          Device settings
        </label>
        <label class="config-import-check">
          <input v-model="applyHotspot" type="checkbox" :disabled="!hasHotspot" />
          Hotspot settings (it can change which network this machine offers)
        </label>
      </fieldset>
      <div class="sdr-devices-form-actions">
        <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="clear">
          CLEAR
        </BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          class="sdr-devices-btn"
          :disabled="busy || (!applyDevices && !applyHotspot)"
        >
          {{ busy ? 'IMPORTING…' : 'IMPORT' }}
        </BaseButton>
      </div>
    </template>
  </form>
</template>

<script setup lang="ts">
/**
 * `ConfigImportForm` — pick a configuration file exported from this or
 * another SDR Manager, see what it holds, choose what to apply, import.
 *
 * The file is read and checked in the browser first (is it JSON, is it an
 * object); the API does the real validation. Hotspot settings are off by
 * default, because applying them can change which network this machine offers.
 */
import { computed, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { LocalConfigFile, LocalConfigImportRequest } from '../../api/types'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ import: [body: LocalConfigImportRequest] }>()

const FILE_FIELD_ID = 'sdr-manager-local-config-file'
const FILE_ERROR_ID = 'sdr-manager-local-config-file-error'

const fileInput = ref<HTMLInputElement | null>(null)
const staged = ref<{ fileName: string; config: LocalConfigFile } | null>(null)
const fileError = ref<string | null>(null)
const applyDevices = ref(true)
const applyHotspot = ref(false)

const deviceCount = computed(() => staged.value?.config.devices?.length ?? 0)
const hasHotspot = computed(() => (staged.value?.config.hotspot ?? null) !== null)

async function pickFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  staged.value = null
  fileError.value = null
  if (!file) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    fileError.value = `${file.name} is not valid JSON.`
    return
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fileError.value = `${file.name} doesn’t look like an SDR Manager configuration file.`
    return
  }
  staged.value = { fileName: file.name, config: parsed as LocalConfigFile }
  applyDevices.value = deviceCount.value > 0
  applyHotspot.value = false
}

function clear(): void {
  staged.value = null
  fileError.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function emitImport(): void {
  if (!staged.value) return
  emit('import', {
    config: staged.value.config,
    apply_devices: applyDevices.value,
    apply_hotspot: applyHotspot.value,
  })
}

defineExpose({ clear })
</script>

<style scoped>
.config-import {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.config-import-file {
  min-height: 24px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.config-import-summary {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.config-import-choices {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
}
.config-import-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-height: 24px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
</style>
