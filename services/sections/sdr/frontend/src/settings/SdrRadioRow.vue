<template>
  <div class="sdr-device-item" :class="{ 'sdr-device-item--open': open }">
    <div class="sdr-device-row">
      <span
        class="sdr-device-info sdr-device-info--named"
        :class="{ 'sdr-device-info--unavailable': isUnavailable }"
        :style="confirming ? 'opacity:0.4' : ''"
      >
        <!-- A host's SDR shows its state (streaming, ready, stopped…); a radio
             added by IP and port only whether it answers. -->
        <SdrDeviceStateDot
          v-if="sdrManagerDeviceStatus"
          :state="sdrManagerDeviceStatus.state"
          :reason="sdrManagerDeviceStatus.state_reason"
          :present="sdrManagerDeviceStatus.present"
        />
        <SdrSourceStatusDot v-else :connected="connected" />
        {{ radio.name }}<span class="sdr-device-meta">{{ addressText }}</span>
      </span>
      <span v-if="isUnavailable && !confirming" class="sdr-device-unavailable">
        {{ radio.unavailable_reason }}
      </span>
      <button
        v-if="!confirming"
        class="sdr-device-btn"
        :class="{ 'sdr-device-btn--active': open }"
        title="Edit"
        aria-label="Edit device"
        @click="emit('toggle-edit')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path
            d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        v-if="!confirming"
        class="sdr-device-btn sdr-device-btn--danger"
        title="Delete"
        aria-label="Delete device"
        @click="emit('start-delete')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <line
            x1="2.5"
            y1="2.5"
            x2="10.5"
            y2="10.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <line
            x1="10.5"
            y1="2.5"
            x2="2.5"
            y2="10.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div v-if="confirming" class="sdr-device-confirm" style="display: flex">
        <span class="sdr-device-confirm-label">DELETE?</span>
        <button
          class="sdr-device-confirm-btn sdr-device-confirm-btn--yes"
          @click="emit('confirm-delete')"
        >
          YES
        </button>
        <button class="sdr-device-confirm-btn" @click="emit('cancel-delete')">NO</button>
      </div>
    </div>
    <SdrDeviceForm
      v-if="open"
      :radio="radio"
      :sdr-manager-device-status="sdrManagerDeviceStatus"
      :edit-as-manual="editAsManual"
      @save="emit('save')"
      @cancel="emit('cancel-edit')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrRadioRow` — one configured-radio row shared by both groupings in
 * `SdrDevicesControl`: a manual radio and an SDR-Manager-mirrored radio render
 * identically here (name, host:port, reachability dot, edit/delete with
 * inline delete-confirm, and the `SdrDeviceForm` editor) — only the data and
 * the write path underneath differ, and `SdrDeviceForm` itself branches on
 * that. Extracted from the byte-identical row markup this app shipped for
 * manual radios only, so both groupings can reuse it instead of duplicating
 * the row chrome per grouping.
 */
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'
import SdrDeviceStateDot from '@sentinel/ui/sdr/SdrDeviceStateDot.vue'
import SdrDeviceForm from './SdrDeviceForm.vue'
import { computed } from 'vue'
import type { SdrRadioRecord } from '../services/sdrRadiosApi'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'

const props = defineProps<{
  radio: SdrRadioRecord
  /** Reachability dot state: manual radios read their rtl_tcp TCP probe;
   * SDR-Manager-mirrored radios read the device's live `present` flag. Null while
   * unknown. */
  connected: boolean | null
  open: boolean
  confirming: boolean
  /** Live SDR host status for this radio's device, when it mirrors one. */
  sdrManagerDeviceStatus?: SdrManagerDeviceStatus | null
  /** Edit a host radio whose host is gone as a manual radio (see `SdrDeviceForm`). */
  editAsManual?: boolean
  /** Under a host's title, which already gives its address: show only the port. */
  portOnly?: boolean
}>()

/** Where the radio connects: its port alone under a host's title, else address and port. */
const addressText = computed(() =>
  props.portOnly ? `port ${props.radio.port}` : `${props.radio.host}:${props.radio.port}`,
)

/**
 * Whether this radio's device is currently unusable.
 *
 * Reported by the backend against the live fleet snapshot rather than stored,
 * because a dongle can be unplugged or replugged elsewhere at any moment. Shown
 * here so the operator sees *why* before trying to connect, instead of after.
 *
 * Only an explicit `false` counts. An absent field means an older backend or a
 * manually-entered radio with no SDR Manager device behind it, and greying the row
 * out in either case would be a lie.
 */
const isUnavailable = computed(() => props.radio.device_available === false)

const emit = defineEmits<{
  'toggle-edit': []
  'start-delete': []
  'confirm-delete': []
  'cancel-delete': []
  save: []
  'cancel-edit': []
}>()
</script>
