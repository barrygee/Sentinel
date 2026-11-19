<template>
  <div class="sdr-radio-section sdr-scan-controls">
    <BaseAccordionSection v-model:expanded="expanded" title="SEARCH" body-id="sdr-search-section">
      <template #header-extra>
        <SdrSweepStateIndicator
          :active="searchActive"
          :paused="searchLocked"
          running-label="SEARCHING"
          paused-label="SEARCHING PAUSED"
        />
      </template>
      <SdrAdhocSearchRow
        v-model:low-mhz="lowMhz"
        v-model:high-mhz="highMhz"
        v-model:step-khz="stepKhz"
        :inputs-disabled="controlsDisabled || searchActive"
        :searching="adhocSearching"
        :play-disabled="tuningDisabled || (!adhocValid && !adhocSearching)"
        @toggle-search="emit('toggleAdhocSearch')"
      />
      <SdrSavedRangesList
        v-model:expanded="savedRangesExpanded"
        :ranges="ranges"
        :selected-range-id="selectedRangeId"
        :disabled="tuningDisabled"
        :is-range-searching="isRangeSearching"
        @select="emit('selectRange', $event)"
        @toggle-search="emit('toggleRangeSearch', $event)"
      />
    </BaseAccordionSection>
  </div>
</template>

<script setup lang="ts">
/**
 * The SEARCH accordion: sweep a one-off LOW–HIGH range or one of the saved
 * ranges, stopping on signal. The bar shows whether it is searching or holding
 * on a signal.
 */
import BaseAccordionSection from '@sentinel/ui/base/BaseAccordionSection.vue'
import SdrAdhocSearchRow from './SdrAdhocSearchRow.vue'
import SdrSavedRangesList from './SdrSavedRangesList.vue'
import SdrSweepStateIndicator from './SdrSweepStateIndicator.vue'
import type { SdrSearchRange } from './services/sdrSearchApi'

/** The SEARCH accordion is open. */
const expanded = defineModel<boolean>('expanded', { required: true })
/** The nested SAVED RANGES accordion is open. */
const savedRangesExpanded = defineModel<boolean>('savedRangesExpanded', { required: true })
const lowMhz = defineModel<string>('lowMhz', { required: true })
const highMhz = defineModel<string>('highMhz', { required: true })
const stepKhz = defineModel<string>('stepKhz', { required: true })

defineProps<{
  searchActive: boolean
  /** Holding on a frequency with signal. */
  searchLocked: boolean
  /** The running search is the one-off range. */
  adhocSearching: boolean
  /** The one-off LOW / HIGH / STEP make a range that can be swept. */
  adhocValid: boolean
  /** No usable radio: locks the one-off range's inputs. */
  controlsDisabled: boolean
  /** No usable radio, or another Sentinel drives the tuner: locks starting a sweep. */
  tuningDisabled: boolean
  ranges: SdrSearchRange[]
  selectedRangeId: number | null
  isRangeSearching: (rangeId: number) => boolean
}>()

const emit = defineEmits<{
  toggleAdhocSearch: []
  selectRange: [rangeId: number]
  toggleRangeSearch: [rangeId: number]
}>()
</script>
