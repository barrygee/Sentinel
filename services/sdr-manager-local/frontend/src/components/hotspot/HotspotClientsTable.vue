<template>
  <div class="hotspot-clients">
    <h4 class="settings-group-label">CONNECTED DEVICES</h4>
    <p v-if="clients === null" class="sdr-devices-empty">
      The hotspot’s connections can’t be read.
    </p>
    <p v-else-if="clients.length === 0" class="sdr-devices-empty">Nothing is connected.</p>
    <table v-else class="hotspot-clients-table">
      <thead>
        <tr>
          <th scope="col">NAME</th>
          <th scope="col">ADDRESS</th>
          <th scope="col">LEASE</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="client in clients" :key="client.mac_address">
          <td>{{ client.hostname ?? client.mac_address }}</td>
          <td>{{ client.ip_address }}</td>
          <td>
            {{ client.expired ? 'Expired' : `Until ${leaseEnd(client.lease_expires_at_ms)}` }}
          </td>
          <td>
            <BaseButton
              type="button"
              variant="ghost"
              class="sdr-devices-btn"
              :aria-label="`Release ${client.hostname ?? client.mac_address}`"
              @click="emit('release', client.mac_address)"
            >
              RELEASE
            </BaseButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
/**
 * `HotspotClientsTable` — the devices holding a DHCP lease on this machine's
 * hotspot, each of which can be released (forgotten by the DHCP server, so it
 * is given a fresh address next time it joins).
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { LocalHotspotClient } from '../../api/types'

defineProps<{ clients: LocalHotspotClient[] | null }>()
const emit = defineEmits<{ release: [macAddress: string] }>()

function leaseEnd(expiresAtMs: number): string {
  return new Date(expiresAtMs).toLocaleTimeString()
}
</script>

<style scoped>
.hotspot-clients {
  overflow-x: auto;
}
.hotspot-clients-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.hotspot-clients-table th {
  text-align: left;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-secondary);
  padding: 4px 8px 4px 0;
}
.hotspot-clients-table td {
  padding: 4px 8px 4px 0;
  border-top: 1px solid var(--settings-field-line);
  overflow-wrap: anywhere;
}
</style>
