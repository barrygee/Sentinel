<template>
  <template v-if="radio">
    <span v-if="!confirming" class="sdr-device-radio-added">
      <span class="sdr-device-radio-added-label">ADDED</span>
      <button
        type="button"
        class="sdr-device-btn sdr-device-btn--danger"
        title="Remove from radios"
        :aria-label="`Remove ${radio.name} from radios`"
        @click="emit('start-delete')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 2.5L10.5 10.5M10.5 2.5L2.5 10.5" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    </span>
    <span v-else class="sdr-device-confirm" style="display: flex">
      <span class="sdr-device-confirm-label">REMOVE?</span>
      <button
        type="button"
        class="sdr-device-confirm-btn sdr-device-confirm-btn--yes"
        :aria-label="`Remove ${radio.name} from radios`"
        @click="emit('confirm-delete')"
      >
        YES
      </button>
      <button type="button" class="sdr-device-confirm-btn" @click="emit('cancel-delete')">
        NO
      </button>
    </span>
  </template>
  <SdrHostDeviceAddButton v-else-if="device" :device="device" :adding="adding" @add="emit('add')" />
</template>

<script setup lang="ts">
/**
 * `SdrDeviceRadioAction` — the radio end of one of this machine's SDRs, in its
 * row under SENTINEL HOSTS › This machine (the row itself is
 * sdr-manager-local's): ADD while it isn't a radio yet, then ADDED with a
 * cross that removes the radio (after REMOVE? YES / NO) — the SDR stays.
 * Nothing until the host's device list has the SDR.
 */
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import type { SdrRadioRecord } from '../services/sdrRadiosApi'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'

defineProps<{
  /** The SDR as this machine's host reports it, or undefined until it does. */
  device: SdrManagerDeviceStatus | undefined
  /** The radio that mirrors it, or null while it isn't one. */
  radio: SdrRadioRecord | null
  /** True while its ADD request is in flight. */
  adding: boolean
  /** True while asking whether to remove the radio. */
  confirming: boolean
}>()
const emit = defineEmits<{
  add: []
  'start-delete': []
  'confirm-delete': []
  'cancel-delete': []
}>()
</script>

<style scoped>
.sdr-device-radio-added {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sdr-device-radio-added-label {
  padding: 0 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink-secondary);
}
</style>
