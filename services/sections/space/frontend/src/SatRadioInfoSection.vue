<template>
  <div v-if="hasRadioInfo(radio)" class="sat-acc-section sat-acc-section--radio">
    <BaseDataGrid title="RADIO" collapse-on-narrow bare style="--ba-cell-align: flex-start">
      <BaseDataCell v-if="radio.uplink_hz" label="UPLINK">
        {{ formatHz(radio.uplink_hz)
        }}<span v-if="radio.uplink_mode" class="ba-data-cell-mode"> · {{ radio.uplink_mode }}</span>
      </BaseDataCell>
      <BaseDataCell v-if="radio.downlink_hz" label="DOWNLINK">
        {{ formatHz(radio.downlink_hz)
        }}<span v-if="radio.downlink_mode" class="ba-data-cell-mode">
          · {{ radio.downlink_mode }}</span
        >
      </BaseDataCell>
      <BaseDataCell
        v-if="radio.ctcss_hz"
        label="CTCSS"
        :value="`${radio.ctcss_hz.toFixed(1)} Hz`"
      />
      <BaseDataCell
        v-if="radio.transponder_type"
        label="TRANSPONDER"
        :value="radio.transponder_type"
      />
      <BaseDataCell v-if="radio.beacon_hz" label="BEACON" :value="formatHz(radio.beacon_hz)" />
      <BaseDataCell
        v-if="radio.radio_status"
        label="STATUS"
        :value="formatStatus(radio.radio_status)"
      />
    </BaseDataGrid>
    <SatRadioLinesAccordion
      v-if="radio.packet_info"
      title="PACKET / DIGITAL"
      :lines="splitNotes(radio.packet_info)"
    />
    <SatRadioLinesAccordion
      v-if="radio.radio_notes"
      title="NOTES"
      :lines="splitNotes(radio.radio_notes)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * SatRadioInfoSection — the RADIO accordion section (uplink/downlink/CTCSS/
 * transponder/beacon/status cells plus the collapsible PACKET and NOTES line
 * lists, see SatRadioLinesAccordion) that
 * the Space search results and the upcoming-passes list rendered as
 * byte-identical ~40-line template blocks differing only in their CSS class
 * prefix. Renders nothing at all when the satellite carries no radio info
 * (the `hasRadioInfo` guard the callers previously wrapped it in).
 *
 * Its section and caption classes come from SatelliteAccordion.css, shared with
 * the rest of the accordion. The `.ba-data-cell-mode` spans are slot content
 * into BaseDataCell, whose `:slotted()` rule applies regardless of the parent.
 */
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import SatRadioLinesAccordion from './SatRadioLinesAccordion.vue'
import './SatelliteAccordion.css'
import { formatHz, formatStatus, hasRadioInfo, splitNotes, type SatRadioInfo } from './satRadioInfo'

defineProps<{
  /** The satellite's radio fields (SatEntry and SatPass both fit structurally). */
  radio: SatRadioInfo
}>()
</script>
