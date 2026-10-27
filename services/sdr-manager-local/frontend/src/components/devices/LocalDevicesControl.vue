<template>
  <div class="sdr-devices-wrap local-devices">
    <LocalAnnouncer />
    <LocalAuthGate sign-in-here>
      <UnprotectedConsoleNotice />
      <LocationMissingNotice />
      <LocalConnectionStatus />
      <LocalNoticeList />
      <SerialConflictBanner
        v-for="conflict in store.serialConflicts"
        :key="conflict.serial"
        :conflict="conflict"
      />
      <SerialFlashPanel
        v-if="store.serialFlashDevice"
        :key="store.serialFlashDevice.device_id"
        :device="store.serialFlashDevice"
      />
      <LocalDeviceList />
    </LocalAuthGate>
  </div>
</template>

<script setup lang="ts">
/**
 * `LocalDevicesControl` — the DEVICES card of Settings › SDR Manager › THIS
 * MACHINE: the RTL-SDRs plugged into this machine, live from its
 * sdr-manager-local, with the warnings that concern them (no console
 * password, no location, a shared serial) and the serial-flash panel.
 *
 * It holds the page's one sign-in form and its one live region, and keeps the
 * event stream open while it is shown. Device edits are staged for APPLY
 * CHANGES (`useLocalDeviceEdits`); serial flash and forgetting a device act at once.
 */
import { onMounted } from 'vue'
import { provideLocalDeviceEdits } from '../../composables/useLocalDeviceEdits'
import { useLocalSdrEvents } from '../../composables/useLocalSdrEvents'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import LocalAuthGate from '../auth/LocalAuthGate.vue'
import LocalConnectionStatus from '../notices/LocalConnectionStatus.vue'
import LocalNoticeList from '../notices/LocalNoticeList.vue'
import LocationMissingNotice from '../notices/LocationMissingNotice.vue'
import UnprotectedConsoleNotice from '../notices/UnprotectedConsoleNotice.vue'
import SerialFlashPanel from '../serial/SerialFlashPanel.vue'
import LocalAnnouncer from '../shared/LocalAnnouncer.vue'
import LocalDeviceList from './LocalDeviceList.vue'
import SerialConflictBanner from './SerialConflictBanner.vue'

const emit = defineEmits<{ stage: [apply: () => Promise<void>] }>()

const store = useLocalSdrStore()

useLocalSdrEvents()
provideLocalDeviceEdits((apply) => emit('stage', apply))

onMounted(() => {
  // The stream's first snapshot usually lands at once; this covers a stream
  // that is slow to open (or refused) so the list never sits on "Looking…".
  if (!store.loaded) void store.refreshStatus()
})
</script>

<style scoped>
.local-devices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
