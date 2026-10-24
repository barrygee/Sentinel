<template>
  <span class="sdr-state-badge" :class="`sdr-state-badge--${tone}`" :title="reason ?? undefined">
    {{ STATE_LABELS[state] }}<span v-if="reason" class="sr-only">: {{ reason }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * `SdrDeviceStateBadge` — an SDR Manager device's lifecycle state as a word in
 * a tinted box (STREAMING, STOPPED, ERROR…). Shared in `@sentinel/ui/sdr`
 * because every SDR Manager screen that lists devices shows the same states
 * and must name them identically.
 *
 * The word carries the state, never the colour alone (WCAG 2.2 AA); an error's
 * reason is in the tooltip and read out after the word.
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
  }>(),
  { reason: null },
)

const STATE_LABELS: Record<DeviceState, string> = {
  detected: 'NEW',
  configured: 'READY',
  starting: 'STARTING',
  streaming: 'STREAMING',
  degraded: 'DEGRADED',
  stopped: 'STOPPED',
  error: 'ERROR',
}

const tone = computed(() => {
  if (props.state === 'streaming') return 'live'
  if (props.state === 'error' || props.state === 'degraded') return 'danger'
  return 'idle'
})
</script>

<style scoped>
.sdr-state-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  white-space: nowrap;
}
.sdr-state-badge--idle {
  color: var(--ink-secondary);
  background: rgba(var(--ink-rgb), 0.06);
}
.sdr-state-badge--live {
  color: var(--accent-ink);
  background: var(--accent);
}
.sdr-state-badge--danger {
  color: var(--danger);
  background: rgba(var(--danger-wash-rgb), 0.12);
}
</style>
