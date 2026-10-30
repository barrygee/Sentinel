<template>
  <p v-if="store.connection !== 'live'" class="local-connection">
    <SdrSourceStatusDot
      :connected="connected"
      :labels="{ connected: 'Live', disconnected: 'Not connected', unknown: 'Connecting…' }"
    />
    <span aria-hidden="true">{{ CONNECTION_LABELS[store.connection] }}</span>
  </p>
</template>

<script setup lang="ts">
/**
 * `LocalConnectionStatus` — says when the devices below may be out of date:
 * the event stream from this machine's SDR Manager is still opening,
 * reconnecting, or closed. Nothing shows while it is live, the normal state.
 */
import { computed } from 'vue'
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'
import { useLocalSdrStore, type LocalConnectionState } from '../../stores/localSdrStore'

const store = useLocalSdrStore()

const CONNECTION_LABELS: Record<Exclude<LocalConnectionState, 'live'>, string> = {
  connecting: 'CONNECTING…',
  reconnecting: 'RECONNECTING…',
  offline: 'NOT CONNECTED',
}

// The dot: grey while the first connection is opening, otherwise a failure.
const connected = computed(() => (store.connection === 'connecting' ? null : false))
</script>

<style scoped>
.local-connection {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-secondary);
}
</style>
