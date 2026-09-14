<template>
  <button
    type="button"
    class="sea-port-channel"
    :title="sdrConnected ? `Tune to ${frequencyMhz} ${MARINE_VHF_MODE}` : 'Connect an SDR to tune'"
    @click.stop="emit('tune')"
  >
    <BaseDataCell :label="`${label.toUpperCase()} · CH ${channel}`">
      {{ frequencyMhz }}<span class="sea-port-channel-mode"> · {{ MARINE_VHF_MODE }}</span>
    </BaseDataCell>
  </button>
</template>

<script setup lang="ts">
/**
 * One VHF working channel of a port in the Sea FILTER pane: the channel's
 * purpose and number as the label, its frequency and mode as the value, the
 * whole cell a button that asks the parent to tune the SDR — the Sea take on
 * the airport frequency cells in the Air pane.
 */
import { computed } from 'vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import { formatMarineVhfMhz, MARINE_VHF_MODE } from '@/utils/marineVhf'

const props = defineProps<{
  label: string
  channel: number
  sdrConnected: boolean
}>()
const emit = defineEmits<{ tune: [] }>()

const frequencyMhz = computed(() => formatMarineVhfMhz(props.channel))
</script>

<style scoped>
.sea-port-channel {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  color: inherit;
  font: inherit;
  transition: opacity 0.12s;
}
.sea-port-channel:hover {
  opacity: 0.7;
}
.sea-port-channel:focus-visible {
  outline: 2px solid #c8ff00;
  outline-offset: 2px;
}
.sea-port-channel-mode {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 400;
  margin-left: 2px;
}
</style>
