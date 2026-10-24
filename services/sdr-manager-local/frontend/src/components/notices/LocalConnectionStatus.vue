<template>
  <p class="local-connection">
    <SdrSourceStatusDot
      :connected="connected"
      :labels="{ connected: 'Live', disconnected: 'Not connected', unknown: 'Connecting…' }"
    />
    <span aria-hidden="true">{{ CONNECTION_LABELS[store.connection] }}</span>
  </p>
</template>

<script setup lang="ts">
/**
 * `LocalConnectionStatus` — whether the devices below are live: the event
 * stream from this machine's SDR Manager is open, reconnecting, or closed.
 */
import { computed } from 'vue'
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'
import { useLocalSdrStore, type LocalConnectionState } from '../../stores/localSdrStore'

const store = useLocalSdrStore()

const CONNECTION_LABELS: Record<LocalConnectionState, string> = {
  connecting: 'CONNECTING…',
  live: 'LIVE',
  reconnecting: 'RECONNECTING…',
  offline: 'NOT CONNECTED',
}

const connected = computed(() => {
  if (store.connection === 'live') return true
  if (store.connection === 'connecting') return null
  return false
})
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
