<script setup lang="ts">
/**
 * Settings-panel control for the folder new recordings are saved in: a
 * subfolder of the recordings root (the `sdr_recordings` volume, or the host
 * folder `SENTINEL_RECORDINGS_DIRECTORY` names). Empty saves to the root.
 * Existing recordings stay where they were saved. Thin wrapper around
 * `BaseTextSetting` supplying the SDR store bindings and the folder rules.
 */
import { useSdrStore } from '../stores/sdr'
import BaseTextSetting from '@sentinel/shell-api/settings/BaseTextSetting.vue'
import { MAX_RECORDINGS_FOLDER_LENGTH, recordingsFolderError } from './recordingsFolder'

const sdr = useSdrStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()
</script>

<template>
  <BaseTextSetting
    accessible-name="Recordings folder, inside the recordings root"
    placeholder="Recordings root"
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
