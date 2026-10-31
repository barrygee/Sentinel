<template>
  <div class="sdr-device-item sdr-device-item--open sdr-device-item--new">
    <RemoteHostForm :host="null" @save="onAdded" @cancel="emit('done')" />
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostAddForm` — "+ ADD A NEW SENTINEL HOST" in Settings › SDR › Radios: the new
 * host form. Adding acts at once and is announced (`announceHostsChanged`),
 * so the Radios card lists the host and its SDRs. `done` once added or
 * cancelled. Rendered by the SDR section through the `radioSites`
 * capability's `hostEditor`.
 */
import RemoteHostForm from './RemoteHostForm.vue'
import { announceHostsChanged } from '../hostsChanged'

const emit = defineEmits<{ done: [] }>()

function onAdded(): void {
  announceHostsChanged()
  emit('done')
}
</script>
