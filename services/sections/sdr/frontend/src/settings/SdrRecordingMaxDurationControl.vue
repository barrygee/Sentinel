<script setup lang="ts">
/**
 * Settings-panel control for the longest a recording may run, in minutes.
 * Past it the backend treats a recording as abandoned (its browser never sent
 * stop): the SDR section marks it failed and the radio hub stops its raw-IQ
 * capture, so a lost stop can't fill the disk. Thin wrapper around
 * `BaseNumberSetting` supplying the SDR store bindings.
 */
import { useSdrStore } from '../stores/sdr'
import BaseNumberSetting from '@sentinel/shell-api/settings/BaseNumberSetting.vue'

const sdr = useSdrStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()
</script>

<template>
  <BaseNumberSetting
    accessible-name="Maximum recording length in minutes"
    :max-length="5"
    :min-value="1"
    namespace="sdr"
    setting-key="recordingMaxDurationMinutes"
    :hydrate-from-db="sdr.hydrateRecordingMaxDurationFromDb"
    :read-from-store="() => sdr.recordingMaxDurationMinutes"
    :mirror-to-store="sdr.setRecordingMaxDurationMinutes"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
