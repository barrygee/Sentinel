<template>
  <BaseFilterPanel
    :items="items"
    :query="landStore.searchQuery"
    :expanded-key="landStore.searchExpandedCallsign"
    id-prefix="land-filter"
    :input-label="inputLabel"
    :placeholder="placeholder"
    :listbox-label="listboxLabel"
    :empty-message="emptyMessage"
    groups-collapsed-by-default
    @update:query="landStore.setSearchQuery"
    @update:expanded-key="landStore.setSearchExpandedCallsign"
  >
    <!-- Band, mode and status chips narrow the REPEATERS list and the map
         together, folded under the search box. -->
    <template v-if="repeatersOn" #below-input>
      <LandRepeaterFilters />
    </template>
    <template #accordion="{ item }">
      <div class="land-filter-accordion">
        <LandRepeaterDetails
          v-if="repeaterFor(item.key)"
          :station="repeaterFor(item.key)!"
          :sdr-connected="radioConnected"
          :is-saved="isFrequencySaved"
          :tune-notice="tuneNotice === item.key"
          @locate="locateRepeater"
          @tune="(channel, side) => tuneRepeater(repeaterFor(item.key)!, channel, side)"
          @save="(channel, side) => saveRepeaterFrequency(repeaterFor(item.key)!, channel, side)"
          @unsave="
            (channel, side) => removeRepeaterFrequency(repeaterFor(item.key)!, channel, side)
          "
        />
        <LandAprsStationAccordion
          v-else-if="stationFor(item.key)"
          :station="stationFor(item.key)!"
        />
      </div>
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Land FILTER pane — one searchable list per data layer the map is drawing,
 * each under its own heading. The sidebar's sub-tabs beneath FILTER switch
 * the layers on and off (several at once), and the pane lists exactly what
 * is on:
 *
 * - APRS STATIONS — every station currently heard, expanding to
 *   `LandAprsStationAccordion` (every field the beacon carried rather than
 *   only those enabled for map labels).
 * - REPEATERS — every filtered UK repeater (ukrepeater.net) in the viewport,
 *   expanding to `LandRepeaterDetails`, with BAND/MODE/STATUS chips above the
 *   search box that narrow the map and the list together.
 *
 * Each list tracks the map exactly: it renders the same snapshot the map
 * plots, so a station that ages out or a repeater filtered away leaves both at
 * the same moment. Clicking a marker on the map expands its row here — the
 * pane holds all the detail; nothing opens on the map itself.
 *
 * This file only wires the pieces together: the rows and wording come from
 * `useLandFilterResults`, the repeater SDR actions from
 * `useRepeaterFrequencyActions`, and keeping the expanded row in step with the
 * map from `useLandExpandedRow` (all in `./filter/`).
 */
import BaseFilterPanel from '@sentinel/ui/base/BaseFilterPanel.vue'
import LandRepeaterFilters from './LandRepeaterFilters.vue'
import LandRepeaterDetails from './LandRepeaterDetails.vue'
import LandAprsStationAccordion from './filter/LandAprsStationAccordion.vue'
import { useLandStore } from './stores/land'
import { useLandFilterResults } from './filter/useLandFilterResults'
import { useRepeaterFrequencyActions } from './filter/useRepeaterFrequencyActions'
import { useLandExpandedRow } from './filter/useLandExpandedRow'

const landStore = useLandStore()

const {
  repeatersOn,
  items,
  inputLabel,
  placeholder,
  listboxLabel,
  emptyMessage,
  repeaterFor,
  stationFor,
} = useLandFilterResults()

const {
  radioConnected,
  tuneNotice,
  isFrequencySaved,
  tuneRepeater,
  saveRepeaterFrequency,
  removeRepeaterFrequency,
  locateRepeater,
} = useRepeaterFrequencyActions()

useLandExpandedRow()
</script>

<style scoped>
/* With the REPEATER FILTERS bar between the search box and the list, the
   shell's input→first-row gap (held inside the first row's header) would
   stack on the bar's own height; drop it so the first repeater sits as close
   under the bar as the rows do under each other. Unscoped selector by
   design — the results body is the shell's, rendered outside this scope. */
:global(.lrf ~ #land-filter-results .bfp-results-body) {
  --bfp-results-top-gap: 0px;
}

.land-filter-accordion {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
</style>
