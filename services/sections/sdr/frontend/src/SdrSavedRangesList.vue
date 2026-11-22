<template>
  <div class="sdr-search-saved-ranges">
    <BaseAccordionSection
      v-model:expanded="expanded"
      title="SAVED RANGES"
      body-id="sdr-saved-ranges-section"
    >
      <div v-if="ranges.length > 0" class="sdr-search-range-list">
        <div
          v-for="range in ranges"
          :key="range.id"
          class="sdr-search-range-item"
          :class="{ 'sdr-search-range-item-active': selectedRangeId === range.id }"
          :title="`step ${(range.step_hz / 1000).toFixed(2)} kHz · ${range.mode}`"
        >
          <button
            type="button"
            class="sdr-search-range-item-body"
            :disabled="disabled"
            @click="emit('select', range.id)"
          >
            <span class="sdr-search-range-primary">{{ range.label }}</span>
            <span class="sdr-search-range-secondary"
              >{{ (range.low_hz / 1e6).toFixed(3) }}–{{
                (range.high_hz / 1e6).toFixed(3)
              }}
              MHz</span
            >
          </button>
          <BaseIconAction
            class="sdr-search-range-item-play"
            :active="isRangeSearching(range.id)"
            active-class="sdr-search-range-item-play--active"
            :disabled="disabled"
            :accessible-name="isRangeSearching(range.id) ? 'Stop search' : 'Start search'"
            :title="isRangeSearching(range.id) ? 'Stop search' : 'Start search'"
            @click.stop="emit('toggleSearch', range.id)"
          >
            <SdrPlayStopIcon :stop="isRangeSearching(range.id)" />
          </BaseIconAction>
        </div>
      </div>
      <div v-else class="sdr-scan-subsection-label" style="opacity: 0.6">
        No ranges defined — add some in Frequency Manager.
      </div>
    </BaseAccordionSection>
  </div>
</template>

<script setup lang="ts">
/**
 * The SAVED RANGES accordion nested in SEARCH: each range from the SEARCH
 * RANGES tab, with a click on the row to load it and a button to start or stop
 * a sweep of it.
 */
import './SdrSavedRangesList.css'
import BaseAccordionSection from '@sentinel/ui/base/BaseAccordionSection.vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import SdrPlayStopIcon from './SdrPlayStopIcon.vue'
import type { SdrSearchRange } from './services/sdrSearchApi'

/** The accordion is open. */
const expanded = defineModel<boolean>('expanded', { required: true })

defineProps<{
  ranges: SdrSearchRange[]
  selectedRangeId: number | null
  disabled: boolean
  /** Whether a sweep of this saved range is the one running. */
  isRangeSearching: (rangeId: number) => boolean
}>()

const emit = defineEmits<{
  select: [rangeId: number]
  toggleSearch: [rangeId: number]
}>()
</script>
