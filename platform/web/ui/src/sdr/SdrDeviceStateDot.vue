<template>
  <span class="sdr-device-state-dot" :class="`sdr-device-state-dot--${tone}`" :title="statusText">
    <span class="sr-only">{{ statusText }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * `SdrDeviceStateDot` — an SDR Manager device's state as a coloured dot at the
 * start of its row: green while it streams, yellow while it is set up but not
 * streaming yet (new, ready, starting) or streaming with problems (degraded),
 * red when it has stopped, failed or is unplugged. Shared in `@sentinel/ui/sdr`
 * because this machine's SDRs and a Sentinel host's SDRs, in separate
 * packages, both show it and must look identical.
 *
 * State is never conveyed by colour alone (WCAG 2.2 AA): the state's name
 * (and an error's reason) is the dot's tooltip and is read out by a screen
 * reader through a visually hidden label.
 */
import { computed } from 'vue'

// The SDR Manager API's device states. Spelled out here because this package
// depends on nothing but Vue; `@sentinel/shell-api/types/sdrManager` names the same union.
type DeviceState =
  | 'detected'
  | 'configured'
  | 'starting'
  | 'streaming'
  | 'degraded'
  | 'stopped'
  | 'error'

const props = withDefaults(
  defineProps<{
    state: DeviceState
    /** The API's `state_reason`, set when the state is an error. */
    reason?: string | null
    /** False while the device is unplugged: red, whatever its last state. */
    present?: boolean
  }>(),
  { reason: null, present: true },
)

const STATE_NAMES: Record<DeviceState, string> = {
  detected: 'New',
  configured: 'Ready',
  starting: 'Starting',
  streaming: 'Streaming',
  degraded: 'Degraded',
  stopped: 'Stopped',
  error: 'Error',
}

const tone = computed(() => {
  if (!props.present) return 'off'
  if (props.state === 'streaming') return 'live'
  if (props.state === 'stopped' || props.state === 'error') return 'off'
  return 'waiting'
})

const statusText = computed(() => {
  if (!props.present) return 'Not plugged in'
  const name = STATE_NAMES[props.state]
  return props.reason ? `${name}: ${props.reason}` : name
})
</script>

<style scoped>
/* Sized and placed like SdrSourceStatusDot, so every row's dot lines up. */
.sdr-device-state-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  flex-shrink: 0;
  vertical-align: middle;
  position: relative;
  top: -1px;
}
.sdr-device-state-dot--live {
  background: var(--color-accent);
}
.sdr-device-state-dot--waiting {
  background: #eab308;
}
.sdr-device-state-dot--off {
  background: #ef4444;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
