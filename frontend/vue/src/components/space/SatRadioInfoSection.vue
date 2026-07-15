<template>
  <div
    v-if="hasRadioInfo(radio)"
    :class="[`${classPrefix}-section`, `${classPrefix}-section--radio`]"
  >
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
    <div v-if="radio.packet_info" :class="`${classPrefix}-radio-line`">
      <div :class="`${classPrefix}-cell-label`">PACKET / DIGITAL</div>
      <ul :class="`${classPrefix}-radio-list`">
        <li v-for="(p, i) in splitNotes(radio.packet_info)" :key="i">{{ p }}</li>
      </ul>
    </div>
    <div v-if="radio.radio_notes" :class="`${classPrefix}-radio-line`">
      <div :class="`${classPrefix}-cell-label`">NOTES</div>
      <ul :class="`${classPrefix}-radio-list`">
        <li v-for="(n, i) in splitNotes(radio.radio_notes)" :key="i">{{ n }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SatRadioInfoSection — the RADIO accordion section (uplink/downlink/CTCSS/
 * transponder/beacon/status cells plus the PACKET and NOTES line lists) that
 * the Space search results and the upcoming-passes list rendered as
 * byte-identical ~40-line template blocks differing only in their CSS class
 * prefix. Renders nothing at all when the satellite carries no radio info
 * (the `hasRadioInfo` guard the callers previously wrapped it in).
 *
 * `classPrefix` selects the caller's existing CSS family (`sfr-acc` for
 * SpaceFilter, `spp-acc` for SpacePasses) — both families are global CSS
 * (SpaceFilter's unscoped style block / SpacePasses.css), so the rendered
 * markup stays byte-identical under either parent. The `.ba-data-cell-mode`
 * spans are slot content into BaseDataCell, whose `:slotted()` rule applies
 * regardless of which parent provides them.
 */
import BaseDataCell from '../base/BaseDataCell.vue'
import BaseDataGrid from '../base/BaseDataGrid.vue'
import { formatHz, formatStatus, hasRadioInfo, splitNotes, type SatRadioInfo } from './satRadioInfo'

defineProps<{
  /** The satellite's radio fields (SatEntry and SatPass both fit structurally). */
  radio: SatRadioInfo
  /** The caller's CSS family prefix for the section/line/list classes. */
  classPrefix: 'sfr-acc' | 'spp-acc'
}>()
</script>
