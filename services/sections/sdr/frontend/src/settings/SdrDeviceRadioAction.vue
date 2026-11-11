<template>
  <template v-if="radio">
    <span v-if="!confirming" class="sdr-device-radio-added">
      <span class="sdr-device-radio-added-label">ADDED</span>
      <!-- Added automatically, so no cross; the space keeps the pencils in line. -->
      <span v-if="autoAdd" class="sdr-device-btn-slot" aria-hidden="true" />
      <BaseIconAction
        v-else
        class="sdr-device-btn"
        variant="row"
        danger
        title="Remove from radios"
        :accessible-name="`Remove ${radio.name} from radios`"
        @click="emit('start-delete')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 2.5L10.5 10.5M10.5 2.5L2.5 10.5" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </BaseIconAction>
    </span>
    <BaseInlineConfirm
      v-else
      label="REMOVE?"
      :confirm-accessible-name="`Remove ${radio.name} from radios`"
      @confirm="emit('confirm-delete')"
      @cancel="emit('cancel-delete')"
    />
  </template>
  <span v-else-if="device && autoAdd" class="sdr-device-meta sdr-host-device-reason">{{
    hostDeviceNotRadioReason(device, true)
  }}</span>
  <SdrHostDeviceAddButton
    v-else-if="device"
    :device="device"
    :adding="adding"
    may-use-private
    @add="emit('add')"
  />
</template>

<script setup lang="ts">
/**
 * `SdrDeviceRadioAction` — the radio end of one of this machine's SDRs, in its
 * row under SENTINEL HOSTS › This machine (the row itself is
 * sdr-manager-local's): ADD while it isn't a radio yet, then ADDED with a
 * cross that removes the radio (after REMOVE? YES / NO) — the SDR stays.
 * Nothing until the host's device list has the SDR. When This machine adds
 * its SDRs automatically there is neither ADD nor a cross: ADDED, or why the
 * SDR isn't a radio (not set up). Private doesn't stop it here: that only keeps
 * an SDR from other machines.
 */
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import BaseInlineConfirm from '@sentinel/ui/base/BaseInlineConfirm.vue'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import type { SdrRadioRecord } from '../services/sdrRadiosApi'
import SdrHostDeviceAddButton from './SdrHostDeviceAddButton.vue'
import { hostDeviceNotRadioReason } from './hostDeviceAvailability'

defineProps<{
  /** The SDR as this machine's host reports it, or undefined until it does. */
  device: SdrManagerDeviceStatus | undefined
  /** The radio that mirrors it, or null while it isn't one. */
  radio: SdrRadioRecord | null
  /** True while its ADD request is in flight. */
  adding: boolean
  /** True while asking whether to remove the radio. */
  confirming: boolean
  /** This machine adds its SDRs automatically (`auto_add_sdrs`). */
  autoAdd?: boolean
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
