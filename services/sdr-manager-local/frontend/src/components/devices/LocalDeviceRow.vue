<template>
  <div class="sdr-device-item" :class="{ 'sdr-device-item--open': open }">
    <div class="sdr-device-row">
      <span class="sdr-device-info" :class="{ 'sdr-device-info--unavailable': !device.present }">
        <SdrDeviceStateBadge :state="device.state" :reason="device.state_reason" />
        <span class="local-device-name">{{ label }}</span>
        <span v-if="device.output" class="local-device-address">
          {{ device.output.host }}:{{ device.output.iq_port }}
        </span>
        <span v-else-if="isNew" class="local-device-address">NOT SET UP</span>
        <span v-if="hasStagedEdit" class="local-device-staged">EDITED — APPLY TO SAVE</span>
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
 * while one is staged.
 */
import { computed, nextTick, ref, watch } from 'vue'
import BaseToggleSwitch from '@sentinel/ui/base/BaseToggleSwitch.vue'
import SdrDeviceStateBadge from '@sentinel/ui/sdr/SdrDeviceStateBadge.vue'
import type { LocalDeviceStatus } from '../../api/types'
import { useLocalDeviceEdits } from '../../composables/useLocalDeviceEdits'
import { deviceLabel, useLocalSdrStore } from '../../stores/localSdrStore'
import { deviceErrorMessage } from '../../utils/errorMessages'
import LocalDeviceForm from './LocalDeviceForm.vue'

const props = defineProps<{ device: LocalDeviceStatus; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const store = useLocalSdrStore()
const label = computed(() => deviceLabel(props.device))
const isNew = computed(() => props.device.record_id === null)
const deviceEdits = useLocalDeviceEdits()
const hasStagedEdit = computed(() => deviceEdits.edits.drafts.has(props.device.device_id))
const stagedEnabled = computed(() => deviceEdits.draftFor(props.device).enabled)
const confirmingForget = ref(false)
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
  gap: 6px 12px;
  min-width: 0;
}
.local-device-name {
  overflow-wrap: anywhere;
}
.local-device-address {
  color: var(--ink-secondary);
}
.local-device-staged {
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
}
.local-device-row-error {
  margin: 4px 16px;
}
</style>
