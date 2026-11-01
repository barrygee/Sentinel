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
      <span v-if="autoAdd" class="sdr-device-meta sdr-host-device-reason">{{
        hostDeviceNotRadioReason(device)
      }}</span>
      <SdrHostDeviceAddButton v-else :device="device" :adding="adding" @add="emit('add')" />
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
 * connect to). On a host that adds its SDRs automatically there is no ADD:
 * the row says why the SDR isn't a radio instead.
 */
import SdrDeviceStateDot from '@sentinel/ui/sdr/SdrDeviceStateDot.vue'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'
import { hostDeviceNotRadioReason } from './hostDeviceAvailability'

defineProps<{
  device: SdrManagerDeviceStatus
  /** True while this row's ADD request is in flight. */
  adding: boolean
  /**
   * The host adds its SDRs automatically: no ADD, only why this one isn't a
   * radio (private, or not set up).
   */
  autoAdd?: boolean
}>()
const emit = defineEmits<{ add: [] }>()
</script>
