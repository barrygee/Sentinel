<script setup lang="ts">
/**
 * Settings-panel control for the folder new recordings are saved in: a
 * subfolder of the recordings root (the `sdr_recordings` volume, or the host
 * folder `SENTINEL_RECORDINGS_DIRECTORY` names). Empty saves to the root.
 * Existing recordings stay where they were saved. Thin wrapper around
 * `BaseTextSetting` supplying the SDR store bindings and the folder rules.
 *
 * The empty field's hint is the recordings directory itself — the host path
 * (or Docker volume) recordings are saved in when no subfolder is set — so the
 * operator can see where files land. Until the backend answers, or if it
 * can't, the hint just says "Recordings directory".
 */
import { onMounted, ref } from 'vue'
import { useSdrStore } from '../stores/sdr'
import {
  describeRecordingsLocation,
  fetchRecordingsLocation,
} from '../services/recordingsLocationApi'
import BaseTextSetting from '@sentinel/shell-api/settings/BaseTextSetting.vue'
import { MAX_RECORDINGS_FOLDER_LENGTH, recordingsFolderError } from './recordingsFolder'

const sdr = useSdrStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const placeholder = ref('Recordings directory')

onMounted(async () => {
  const location = await fetchRecordingsLocation()
  if (location) placeholder.value = describeRecordingsLocation(location)
})
</script>

<template>
  <BaseTextSetting
    accessible-name="Recordings folder, inside the recordings directory"
    :placeholder="placeholder"
    :max-length="MAX_RECORDINGS_FOLDER_LENGTH"
    :validate="recordingsFolderError"
    namespace="sdr"
    setting-key="recordingsFolder"
    :hydrate-from-db="sdr.hydrateRecordingsFolderFromDb"
    :read-from-store="() => sdr.recordingsFolder"
    :mirror-to-store="sdr.setRecordingsFolder"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
