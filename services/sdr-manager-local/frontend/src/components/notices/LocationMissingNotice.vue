<template>
  <BaseWarningNotice
    v-if="store.locationMissing"
    message="This Sentinel’s location is not set, so other Sentinels using these SDRs can’t show where they are."
  >
    <template #action>
      <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="openLocation">
        SET LOCATION
      </BaseButton>
    </template>
  </BaseWarningNotice>
</template>

<script setup lang="ts">
/**
 * `LocationMissingNotice` — shown while Sentinel's own Location setting is
 * blank. SDR Manager has no position of its own (ADR 0007): it publishes
 * Sentinel's, so the fix is that setting, in App Settings.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useLocalSdrStore } from '../../stores/localSdrStore'

const store = useLocalSdrStore()
const settingsStore = useSettingsStore()

function openLocation(): void {
  settingsStore.openPanel('app')
}
</script>
