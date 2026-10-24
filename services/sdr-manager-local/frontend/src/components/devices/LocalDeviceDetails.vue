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
.local-device-details {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px 24px;
  margin: 0;
}
@media (min-width: 600px) {
  .local-device-details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.local-device-details div {
  display: flex;
  gap: 10px;
  min-width: 0;
}
.local-device-details dt {
  flex-shrink: 0;
  width: 80px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-secondary);
}
.local-device-details dd {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
