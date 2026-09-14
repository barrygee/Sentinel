<template>
  <!-- No NAME / LOCODE cells: the row header above the accordion carries both. -->
  <BaseDataGrid title="LOCATION" :columns="2">
    <BaseDataCell label="LATITUDE" :value="formatLatitude(coordinates[1])" />
    <BaseDataCell label="LONGITUDE" :value="formatLongitude(coordinates[0])" />
  </BaseDataGrid>
  <BaseDataGrid title="VHF CHANNELS" :columns="2">
    <SeaPortChannelButton
      v-for="portChannel in tunableChannels"
      :key="portChannel.channel"
      :label="portChannel.label"
      :channel="portChannel.channel"
      :sdr-connected="sdrConnected"
      @tune="emit('tune', portChannel)"
    />
  </BaseDataGrid>
  <div v-if="tuneNotice" class="sea-port-notice" role="status">Connect an SDR before tuning</div>
</template>

<script setup lang="ts">
/**
 * The expanded detail of one port in the Sea FILTER pane: identity, position
 * and its VHF working channels, each channel a tune button. Mirrors the
 * airport accordion in the Air pane over the shared data-grid sections.
 */
import { computed } from 'vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import SeaPortChannelButton from './SeaPortChannelButton.vue'
import type { PortChannel, PortProperties } from './controls/ports/portsData'
import { marineVhfChannelHz } from '@/utils/marineVhf'

const props = defineProps<{
  port: PortProperties
  coordinates: [number, number]
  sdrConnected: boolean
  /** Show the "connect an SDR" hint under the channels. */
  tuneNotice: boolean
}>()
const emit = defineEmits<{ tune: [portChannel: PortChannel] }>()

/** Channels the plan can turn into a frequency — the only ones worth a button. */
const tunableChannels = computed(() =>
  props.port.channels.filter((portChannel) => marineVhfChannelHz(portChannel.channel) !== null),
)

function formatLatitude(latitude: number): string {
  return `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}`
}
function formatLongitude(longitude: number): string {
  return `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`
}
</script>

<style scoped>
.sea-port-notice {
  padding: 2px 24px 0;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
}
</style>
