<template>
  <div class="sdr-devices-list">
    <p v-if="!store.loaded" class="sdr-devices-empty">Looking for SDRs…</p>
    <p v-else-if="store.loadError" class="sdr-devices-empty" role="alert">{{ store.loadError }}</p>
    <p v-else-if="store.devices.length === 0" class="sdr-devices-empty">
      No SDRs found. Plug an RTL-SDR into a USB port on this machine.
    </p>
    <template v-else>
      <p v-if="store.presentDevices.length === 0" class="sdr-devices-empty">
        No SDRs are plugged in right now.
      </p>
      <LocalDeviceRow
        v-for="device in store.presentDevices"
        :key="device.device_id"
        :device="device"
        :open="openDeviceId === device.device_id"
        @toggle="toggle(device.device_id)"
      />
      <template v-if="store.absentDevices.length > 0">
        <h4 class="settings-group-label local-absent-heading">NOT PLUGGED IN</h4>
        <LocalDeviceRow
          v-for="device in store.absentDevices"
          :key="device.device_id"
          :device="device"
          :open="openDeviceId === device.device_id"
          @toggle="toggle(device.device_id)"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * `LocalDeviceList` — the dongles plugged into this machine, in USB port
 * order, then the configured ones that are unplugged. One row at a time is
 * open for editing; a collapsed row keeps its staged edit until APPLY CHANGES.
 */
import { useLocalDeviceEdits } from '../../composables/useLocalDeviceEdits'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import LocalDeviceRow from './LocalDeviceRow.vue'

const store = useLocalSdrStore()
const { openDeviceId } = useLocalDeviceEdits()

function toggle(deviceId: string): void {
  openDeviceId.value = openDeviceId.value === deviceId ? null : deviceId
}
</script>

<style scoped>
.local-absent-heading {
  margin: 12px 0 4px;
}
</style>
