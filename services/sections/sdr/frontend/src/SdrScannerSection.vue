<template>
  <div class="sdr-radio-section sdr-scan-controls">
    <BaseAccordionSection v-model:expanded="expanded" title="SCANNER" body-id="sdr-scanner-section">
      <template #header-extra>
        <SdrSweepStateIndicator
          :active="scanActive"
          :paused="scanLocked"
          running-label="SCANNING"
          paused-label="SCANNING PAUSED"
        />
      </template>
      <div class="sdr-scan-groups-row">
        <BaseChip :active="allGroupsSelected" :disabled="disabled" @click="emit('toggleAll')">
          All
        </BaseChip>
        <BaseChip
          v-for="group in groups"
          :key="group.id"
          :active="!allGroupsSelected && selectedGroupIds.includes(group.id)"
          :disabled="disabled"
          @click="emit('toggleGroup', group.id)"
        >
          {{ group.name }}
        </BaseChip>
      </div>
      <div class="sdr-scan-btns-row sdr-scan-btns-row--left">
        <SdrSweepPlayButton
          sweep-name="scan"
          :running="scanActive"
          :disabled="disabled"
          @click="emit('toggleScan')"
        />
      </div>
    </BaseAccordionSection>
  </div>
</template>

<script setup lang="ts">
/**
 * The SCANNER accordion: pick All or some frequency groups, then start or stop
 * the scan across their saved frequencies. The bar shows whether it is
 * scanning or holding on a signal.
 */
import './SdrScannerSection.css'
import BaseAccordionSection from '@sentinel/ui/base/BaseAccordionSection.vue'
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import SdrSweepPlayButton from './SdrSweepPlayButton.vue'
import SdrSweepStateIndicator from './SdrSweepStateIndicator.vue'
import type { SdrFrequencyGroup } from './stores/sdr'

/** The accordion is open. */
const expanded = defineModel<boolean>('expanded', { required: true })

defineProps<{
  /** The groups that hold at least one frequency. */
  groups: SdrFrequencyGroup[]
  allGroupsSelected: boolean
  selectedGroupIds: number[]
  scanActive: boolean
  /** Holding on a frequency with signal. */
  scanLocked: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  toggleAll: []
  toggleGroup: [groupId: number]
  toggleScan: []
}>()
</script>
