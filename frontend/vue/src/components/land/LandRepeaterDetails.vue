<template>
  <div class="land-repeater-details">
    <BaseDataGrid title="SITE" :columns="3">
      <!-- No callsign cell: the row's header already carries it. The position
           cells are links that fly the map to the site — the row's way back
           to the map. -->
      <BaseDataCell label="LOCATION" :value="station.location ?? '—'" />
      <BaseDataCell label="LOCATOR" :value="station.locator ?? '—'" />
      <BaseDataCell label="POSTCODE" :value="station.postcode ?? '—'" />
      <button
        type="button"
        class="land-repeater-locate"
        :title="`Show ${station.callsign} on the map`"
        @click.stop="emit('locate', station.callsign)"
      >
        <BaseDataCell label="LATITUDE" :value="station.latitude.toFixed(4)" />
      </button>
      <button
        type="button"
        class="land-repeater-locate"
        :title="`Show ${station.callsign} on the map`"
        @click.stop="emit('locate', station.callsign)"
      >
        <BaseDataCell label="LONGITUDE" :value="station.longitude.toFixed(4)" />
      </button>
      <BaseDataCell label="REGION" :value="station.region ?? '—'" />
      <BaseDataCell label="KEEPER" :value="station.keeper ?? '—'" />
    </BaseDataGrid>
    <!-- Shown above the channels, since it is their frequencies it concerns. -->
    <div v-if="tuneNotice" class="land-repeater-notice" role="status">
      Connect an SDR before tuning
    </div>
    <!-- One section per licensed channel: a dual-band site lists both, each
         with the frequencies a rig needs (listen on OUTPUT, transmit on INPUT)
         and the access tone or colour code that opens it. -->
    <BaseDataGrid
      v-for="channel in station.channels"
      :key="channelKey(channel)"
      :title="channelTitle(channel)"
      :columns="3"
    >
      <!-- Output (listen) and input (transmit) are tune buttons with a save
           bookmark; both demodulate as NFM on the SDR, digital modes included. -->
      <LandRepeaterFrequencyCell
        label="OUTPUT"
        :mhz="channel.txMhz"
        :mode="REPEATER_SDR_MODE"
        :sdr-connected="sdrConnected"
        :saved="isSaved(channel.txMhz)"
        @tune="emit('tune', channel, 'output')"
        @save="emit('save', channel, 'output')"
        @unsave="emit('unsave', channel, 'output')"
      />
      <LandRepeaterFrequencyCell
        label="INPUT"
        :mhz="channel.rxMhz"
        :mode="REPEATER_SDR_MODE"
        :sdr-connected="sdrConnected"
        :saved="isSaved(channel.rxMhz)"
        tooltip-side="left"
        @tune="emit('tune', channel, 'input')"
        @save="emit('save', channel, 'input')"
        @unsave="emit('unsave', channel, 'input')"
      />
      <BaseDataCell label="OFFSET" :value="formatRepeaterOffset(channel)" />
      <BaseDataCell label="CTCSS / CC" :value="formatRepeaterAccess(channel)" />
      <!-- "REDUCED OUTPUT" overruns a third-column cell, so it wraps onto
           two lines rather than ellipsising to "REDUCED OU…". -->
      <div class="land-repeater-wrapping">
        <BaseDataCell label="STATUS" :value="formatRepeaterStatus(channel.status)" />
      </div>
      <BaseDataCell label="HEIGHT" :value="formatHeight(channel.heightMagl)" />
      <BaseDataCell label="ERP" :value="formatErp(channel.erpDbw)" />
      <!-- A multimode site lists up to six modes: the whole row, wrapping,
           rather than a third-column cell that ellipsises after two. -->
      <div class="land-repeater-wrapping">
        <BaseDataCell label="MODES" :value="formatRepeaterModes(channel.modes)" wide />
      </div>
    </BaseDataGrid>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandRepeaterDetails` — the accordion body for one repeater site in the
 * Land FILTER pane, the counterpart of `LandCameraDetails`: the site's
 * identity and position, then one BaseDataGrid per licensed channel with its
 * frequencies, modes and access details. The output and input frequencies
 * are tune buttons with a save bookmark (`LandRepeaterFrequencyCell`); the
 * parent does the tuning and saving, as the Sea pane does for port channels.
 */
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import LandRepeaterFrequencyCell from './LandRepeaterFrequencyCell.vue'
import {
  formatRepeaterAccess,
  formatRepeaterModes,
  formatRepeaterOffset,
  formatRepeaterStatus,
  REPEATER_SDR_MODE,
} from '@/constants/repeaters'
import type { RepeaterChannel, RepeaterStation } from '@/types/repeaters'

/** Which end of a channel a tune/save refers to. */
export type RepeaterFrequencySide = 'output' | 'input'

defineProps<{
  station: RepeaterStation
  sdrConnected: boolean
  /** Whether the Frequency Manager already holds a frequency (MHz). */
  isSaved: (mhz: number) => boolean
  /** Show the "connect an SDR" hint under the channels. */
  tuneNotice: boolean
}>()

const emit = defineEmits<{
  locate: [callsign: string]
  tune: [channel: RepeaterChannel, side: RepeaterFrequencySide]
  save: [channel: RepeaterChannel, side: RepeaterFrequencySide]
  unsave: [channel: RepeaterChannel, side: RepeaterFrequencySide]
}>()

/** "70CM · RB0" — the band plus the UK channel designator when allocated. */
function channelTitle(channel: RepeaterChannel): string {
  return channel.channel ? `${channel.band} · ${channel.channel}` : channel.band
}

/** Stable list key: the register id, or band+output for a row without one. */
function channelKey(channel: RepeaterChannel): string {
  return channel.id !== null ? String(channel.id) : `${channel.band}:${channel.txMhz}`
}

function formatHeight(heightMagl: number | null): string {
  return heightMagl === null ? '—' : `${heightMagl} m AGL`
}

function formatErp(erpDbw: number | null): string {
  return erpDbw === null ? '—' : `${erpDbw} dBW`
}
</script>

<style scoped>
/* The modes list spans the grid and wraps, at the cells' own weight. */
/* Cells whose value may run past the column (MODES, STATUS) wrap instead
   of ellipsising. */
.land-repeater-wrapping {
  display: contents;
  --ba-cell-value-white-space: normal;
  --ba-cell-value-word-break: break-word;
  --ba-cell-align: flex-start;
}
.land-repeater-details {
  display: flex;
  flex-direction: column;
  /* Values read in capitals throughout — units ("m AGL", "dBW", "MHz") and
     register text alike — matching the Air pane's all-caps readings. The
     size is BaseDataCell's shared 14px, the same as Air. */
  text-transform: uppercase;
  padding-bottom: 12px;
}
/* The position cells as links to the map, styled like the frequency cells'
   tune buttons, with the value underlined so they read as links. */
.land-repeater-locate {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  color: inherit;
  font: inherit;
  min-width: 0;
}
.land-repeater-locate :deep(.ba-data-cell-value) {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(255, 255, 255, 0.35);
}
.land-repeater-locate:hover {
  opacity: 0.7;
}
.land-repeater-locate:focus-visible {
  outline: 2px solid #c8ff00;
  outline-offset: 2px;
}
/* The same hint as the Sea pane's port channels, but as a warning: red and
   regular weight, sitting above the frequencies it applies to. */
.land-repeater-notice {
  padding: 12px 24px 0;
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  color: rgb(255, 90, 80);
  text-transform: uppercase;
}
</style>
