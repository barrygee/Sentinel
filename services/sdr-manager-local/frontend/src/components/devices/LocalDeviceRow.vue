<template>
  <div class="sdr-device-item" :class="{ 'sdr-device-item--open': open }">
    <div class="sdr-device-row">
      <span
        class="sdr-device-info sdr-device-info--named"
        :class="{ 'sdr-device-info--unavailable': !device.present }"
      >
        <SdrDeviceStateDot
          :state="device.state"
          :reason="device.state_reason"
          :present="device.present"
        />
        <span class="local-device-name">{{ label }}</span>
        <span v-if="device.output" class="local-device-address sdr-device-meta">
          {{
            portOnly()
              ? `port ${device.output.iq_port}`
              : `${device.output.host}:${device.output.iq_port}`
          }}
        </span>
        <span v-else-if="isNew" class="local-device-address sdr-device-meta">NOT SET UP</span>
        <span v-if="hasStagedEdit" class="local-device-staged sdr-device-meta"
          >EDITED — APPLY TO SAVE</span
        >
      </span>
      <template v-if="!confirmingForget">
        <BaseToggleSwitch
          v-if="!isNew"
          :model-value="stagedEnabled"
          :accessible-name="`Stream ${label}`"
          @update:model-value="setEnabled"
        />
        <button
          type="button"
          class="sdr-device-btn"
          :class="{ 'sdr-device-btn--active': open }"
          :aria-expanded="open"
          :aria-label="`${isNew ? 'Set up' : 'Edit'} ${label}`"
          :title="isNew ? 'Set up' : 'Edit'"
          @click="emit('toggle')"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          v-if="!device.present"
          type="button"
          class="sdr-device-btn sdr-device-btn--danger"
          :aria-label="`Forget ${label}`"
          title="Forget"
          @click="confirmingForget = true"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M2.5 2.5L10.5 10.5M10.5 2.5L2.5 10.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
        <DeviceActions />
      </template>
      <div v-else class="sdr-device-confirm" style="display: flex">
        <span class="sdr-device-confirm-label">FORGET?</span>
        <button
          ref="confirmButton"
          type="button"
          class="sdr-device-confirm-btn sdr-device-confirm-btn--yes"
          :aria-label="`Forget ${label} and its saved settings`"
          @click="forget"
        >
          YES
        </button>
        <button type="button" class="sdr-device-confirm-btn" @click="confirmingForget = false">
          NO
        </button>
      </div>
    </div>
    <p v-if="rowError" class="sdr-devices-form-error local-device-row-error" role="alert">
      {{ rowError }}
    </p>
    <LocalDeviceForm v-if="open" :device="device" />
  </div>
</template>

<script setup lang="ts">
/**
 * `LocalDeviceRow` — one dongle plugged into (or remembered by) this machine:
 * its state, name and the address it streams on, a switch to start or stop
 * streaming, and an edit button that opens `LocalDeviceForm` below it.
 *
 * A device seen for the first time is "not set up" and has no switch: it needs
 * a name and port first. An absent device can be forgotten (its saved settings
 * discarded), after a YES / NO confirmation, which acts at once. The stream
 * switch and the form's edits wait for APPLY CHANGES, and the row says so
 * while one is staged. The host page's own action for the SDR (ADD, in
 * Settings › SDR) ends the row, through `LocalDevicesControl`'s slot.
 */
import { computed, nextTick, ref, watch, type VNodeChild } from 'vue'
import BaseToggleSwitch from '@sentinel/ui/base/BaseToggleSwitch.vue'
import SdrDeviceStateDot from '@sentinel/ui/sdr/SdrDeviceStateDot.vue'
import type { LocalDeviceStatus } from '../../api/types'
import { useLocalDeviceEdits } from '../../composables/useLocalDeviceEdits'
import { deviceLabel, useLocalSdrStore } from '../../stores/localSdrStore'
import { deviceErrorMessage } from '../../utils/errorMessages'
import LocalDeviceForm from './LocalDeviceForm.vue'
import { useDeviceActions, usePortOnly } from '../../composables/useDeviceActions'

const props = defineProps<{ device: LocalDeviceStatus; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const store = useLocalSdrStore()
const label = computed(() => deviceLabel(props.device))
const isNew = computed(() => props.device.record_id === null)
const deviceEdits = useLocalDeviceEdits()
const hasStagedEdit = computed(() => deviceEdits.edits.drafts.has(props.device.device_id))
const stagedEnabled = computed(() => deviceEdits.draftFor(props.device).enabled)
const confirmingForget = ref(false)

// The host page's action for this SDR (Settings › SDR's ADD), if it gave one.
const deviceActionsSlot = useDeviceActions()
// Under This machine's title in Settings › SDR the address is already given.
const portOnly = usePortOnly()
const DeviceActions = (): VNodeChild =>
  deviceActionsSlot()?.({ deviceId: props.device.device_id }) ?? null
const rowError = ref<string | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

watch(confirmingForget, async (confirming) => {
  if (!confirming) return
  await nextTick()
  confirmButton.value?.focus()
})

function setEnabled(enabled: boolean): void {
  deviceEdits.updateDraft(props.device, { ...deviceEdits.draftFor(props.device), enabled })
}

async function forget(): Promise<void> {
  rowError.value = null
  try {
    await store.forgetDevice(props.device.device_id)
  } catch (error) {
    confirmingForget.value = false
    rowError.value = deviceErrorMessage(error)
  }
}
</script>

<style scoped>
.sdr-device-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* 8px between name and address, as in the other SDR rows (.sdr-device-meta). */
  gap: 6px 8px;
  min-width: 0;
}
/* Placed as in the other SDR rows, where the dot sits inline before the name
   (8px margin and a space): here the row's 8px gap already follows it, and
   the flex row centres it a little above the name's text. */
.sdr-device-info :deep(.sdr-device-state-dot) {
  margin-right: 3px;
  top: 1px;
}
.local-device-name {
  overflow-wrap: anywhere;
}
/* The row is a flex box with its own gap: no extra margin before the meta. */
.sdr-device-info .sdr-device-meta {
  margin-left: 0;
}
.local-device-row-error {
  margin: 4px 16px;
}
</style>
