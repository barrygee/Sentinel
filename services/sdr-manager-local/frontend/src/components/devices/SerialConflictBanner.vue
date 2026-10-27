<template>
  <BaseWarningNotice :message="message">
    <template #action>
      <BaseButton
        v-for="deviceId in conflict.deviceIds"
        :key="deviceId"
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :aria-label="`Flash a new serial onto ${labelFor(deviceId)}`"
        @click="store.openSerialFlash(deviceId)"
      >
        FLASH {{ labelFor(deviceId) }}
      </BaseButton>
    </template>
  </BaseWarningNotice>
</template>

<script setup lang="ts">
/**
 * `SerialConflictBanner` — one warning per factory serial that two or more
 * plugged-in dongles share. Many cheap RTL-SDRs ship with the same serial,
 * so SDR Manager can only tell them apart by USB port until one is given a
 * unique serial; the banner offers to flash any of them.
 */
import { computed } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import { deviceLabel, useLocalSdrStore, type LocalSerialConflict } from '../../stores/localSdrStore'

const props = defineProps<{ conflict: LocalSerialConflict }>()

const store = useLocalSdrStore()

const message = computed(
  () =>
    `${props.conflict.deviceIds.length} SDRs share the serial ${props.conflict.serial}. Flash a unique serial onto all but one.`,
)

function labelFor(deviceId: string): string {
  const device = store.devicesById[deviceId]
  return device ? deviceLabel(device) : deviceId
}
</script>
