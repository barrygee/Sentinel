<template>
  <BaseWarningNotice
    v-if="device.needs_identification"
    message="This dongle shares its serial with another one, so SDR Manager can’t tell them apart after a replug. Give it a unique serial."
  >
    <template #action>
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        @click="store.openSerialFlash(device.device_id)"
      >
        FLASH SERIAL
      </BaseButton>
    </template>
  </BaseWarningNotice>
  <p v-if="!device.present" class="sdr-devices-empty">
    Not plugged in{{
      device.usb_last_known
        ? ` — last seen on USB port ${device.usb_last_known.topology_path}`
        : ''
    }}. Its settings are kept until you forget it.
  </p>
</template>

<script setup lang="ts">
/**
 * `LocalDeviceNotices` — what an operator must know about one dongle before
 * editing it: it needs a unique serial flashed (and the way to do it), or it
 * is not plugged in.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import type { LocalDeviceStatus } from '../../api/types'
import { useLocalSdrStore } from '../../stores/localSdrStore'

defineProps<{ device: LocalDeviceStatus }>()

const store = useLocalSdrStore()
</script>
