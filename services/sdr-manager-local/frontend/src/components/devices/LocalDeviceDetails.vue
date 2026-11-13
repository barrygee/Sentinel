<template>
  <dl class="local-device-details">
    <div>
      <dt>MODEL</dt>
      <dd>{{ model }}</dd>
    </div>
    <div>
      <dt>SERIAL</dt>
      <dd>{{ serial ?? '—' }}</dd>
    </div>
    <div>
      <dt>USB PORT</dt>
      <dd>{{ usbPort ?? '—' }}</dd>
    </div>
    <div v-if="device.output">
      <dt>PORTS</dt>
      <dd>IQ {{ device.output.iq_port }} · CONTROL {{ device.output.control_port }}</dd>
    </div>
    <div v-if="device.tuner">
      <dt>TUNED TO</dt>
      <dd>
        {{ (device.tuner.center_hz / 1e6).toFixed(3) }} MHz ·
        {{ Math.round(device.tuner.sample_rate / 1e3) }} kS/s ·
        {{ device.tuner.gain_auto ? 'AUTO GAIN' : `${device.tuner.gain_db} dB` }}
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
/**
 * `LocalDeviceDetails` — what is known about one dongle that the operator
 * can't edit: its USB identity, the ports it streams on, and what its tuner
 * last reported. An absent device shows what it was last seen as.
 */
import { computed } from 'vue'
import type { LocalDeviceStatus } from '../../api/types'

const props = defineProps<{ device: LocalDeviceStatus }>()

const identity = computed(() => props.device.usb ?? props.device.usb_last_known)
const model = computed(
  () =>
    [identity.value?.manufacturer, identity.value?.product].filter(Boolean).join(' ') || 'Unknown',
)
const serial = computed(() => identity.value?.serial ?? null)
const usbPort = computed(() => identity.value?.topology_path ?? null)
</script>

<style scoped>
/* One row per fact, laid out like the form's fields above it: the caption in
   BaseFormField's label column (--ba-form-field-label-width, 110px, then a
   14px gap) in its caption style, the value where the inputs start, in their
   size. The card's own gap spaces it from the fields. */
.local-device-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Read-only facts, set apart from the editable fields above: the card's
     16px gap plus this makes 32px, a section break rather than a next row. */
  margin: 16px 0 0;
}
.local-device-details div {
  display: grid;
  grid-template-columns: var(--ba-form-field-label-width, 110px) minmax(0, 1fr);
  column-gap: 14px;
  align-items: baseline;
  min-width: 0;
}
.local-device-details dt {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.6);
}
.local-device-details dd {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
