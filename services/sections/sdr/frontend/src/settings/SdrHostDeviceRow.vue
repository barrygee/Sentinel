<template>
  <div class="sdr-device-item">
    <div class="sdr-device-row">
      <span class="sdr-device-info sdr-device-info--named">
        <SdrDeviceStateDot
          :state="device.state"
          :reason="device.state_reason"
          :present="device.present"
        />
        {{ device.name || device.device_id
        }}<span v-if="device.output" class="sdr-device-meta">port {{ device.output.iq_port }}</span>
      </span>
      <SdrHostDeviceAddButton :device="device" :adding="adding" @add="emit('add')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrHostDeviceRow` — one row for an SDR-Manager-known device that has not yet
 * been mirrored into Sentinel's own radio list (ADR-0009). Shows the device's
 * live state as a coloured dot (`SdrDeviceStateDot`) and an ADD action that creates the mirroring Sentinel
 * radio; disabled until SDR host has allocated the device an output port (a
 * device SDR host has only just detected, not yet configured, has no port to
 * connect to).
 */
import SdrDeviceStateDot from '@sentinel/ui/sdr/SdrDeviceStateDot.vue'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'

defineProps<{
  device: SdrManagerDeviceStatus
  /** True while this row's ADD request is in flight. */
  adding: boolean
}>()
const emit = defineEmits<{ add: [] }>()
</script>
