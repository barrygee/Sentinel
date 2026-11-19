<template>
  <div class="apt-acc-body">
    <AirLocationGrid :coords="airport.coords" />
    <BaseDataGrid title="FREQUENCIES">
      <TuneFrequencyCell
        v-for="frequency in frequencies"
        :key="frequency.label"
        class="apt-acc-freq"
        :label="frequency.label.toUpperCase()"
        :frequency="frequency.display"
        :mode="frequency.mode"
        :sdr-connected="sdrConnected"
        @tune="emit('tune', frequency)"
      />
    </BaseDataGrid>
    <div v-if="showTuneNotice" class="apt-acc-notice" role="status">
      Connect an SDR before tuning
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * An expanded airport row in the Air FILTER pane: its location and its airband
 * channels, each tunable on the connected SDR. The pane does the tuning.
 */
import { computed } from 'vue'
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import TuneFrequencyCell from '@sentinel/ui/base/TuneFrequencyCell.vue'
import AirLocationGrid from './AirLocationGrid.vue'
import { airportFreqs, type AirportFreq } from './airportFrequencies'
import type { AirportResult } from './airFilterTypes'
import './AirAccordionBody.css'
import './AirAirportAccordion.css'

const props = defineProps<{
  airport: AirportResult
  sdrConnected: boolean
  /** A tune was tried with no SDR connected: say so under the channels. */
  showTuneNotice: boolean
}>()

const emit = defineEmits<{ tune: [frequency: AirportFreq] }>()

const frequencies = computed(() => airportFreqs(props.airport))
</script>
