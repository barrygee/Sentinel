<template>
  <dl class="hotspot-summary">
    <div>
      <dt>STATUS</dt>
      <dd>{{ statusText }}</dd>
    </div>
    <div v-if="state.ssid">
      <dt>NETWORK</dt>
      <dd>{{ state.ssid }}{{ state.hidden ? ' (hidden)' : '' }}</dd>
    </div>
    <div v-if="state.interface">
      <dt>INTERFACE</dt>
      <dd>{{ state.interface }}</dd>
    </div>
    <div v-if="state.gateway_address">
      <dt>ADDRESS</dt>
      <dd>{{ state.gateway_address }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
/**
 * `HotspotStatusSummary` — whether this machine's hotspot is running and
 * what joining devices see: the network name, the interface it runs on and
 * the address this machine answers on inside it.
 */
import { computed } from 'vue'
import type { LocalHotspotState } from '../../api/types'

const props = defineProps<{ state: LocalHotspotState }>()

const statusText = computed(() => {
  if (!props.state.configured) return 'Not set up'
  if (props.state.active)
    return props.state.enabled ? 'Running, starts with this machine' : 'Running'
  return props.state.enabled ? 'Stopped, starts with this machine' : 'Stopped'
})
</script>

<style scoped>
.hotspot-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.hotspot-summary div {
  display: flex;
  gap: 10px;
}
.hotspot-summary dt {
  flex-shrink: 0;
  width: 110px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-secondary);
}
.hotspot-summary dd {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
