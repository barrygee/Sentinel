<script setup lang="ts">
/**
 * Settings row choosing how aircraft are drawn on the Air map: the direction
 * ARROW inside each label (the original look), or a SILHOUETTE of the
 * aircraft's type, drawn to its real shape and relative size, with the label
 * beside it.
 *
 * The map redraws as the choice moves (the store change reaches the ADS-B
 * control through AirMap's watcher) while the persisted write waits for APPLY
 * CHANGES, like every other staged setting.
 */
import BaseSegmentedSetting from '@sentinel/ui/base/BaseSegmentedSetting.vue'
import { useStagedSetting } from '@sentinel/shell-api/settings/useStagedSetting'
import { AIRCRAFT_ICON_STYLE_SETTING, useAirStore, type AircraftIconStyle } from '../stores/air'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const OPTIONS: ReadonlyArray<{ value: AircraftIconStyle; label: string }> = [
  { value: 'arrow', label: 'ARROW' },
  { value: 'silhouette', label: 'SILHOUETTE' },
]

const { value, applyChange } = useStagedSetting<AircraftIconStyle>({
  namespace: 'air',
  key: AIRCRAFT_ICON_STYLE_SETTING,
  hydrateFromDb: airStore.hydrateAircraftIconStyleFromDb,
  readFromStore: () => airStore.aircraftIconStyle,
  mirrorToStore: airStore.setAircraftIconStyle,
  stageWrite: (staged) => emit('stage', staged),
})
</script>

<template>
  <BaseSegmentedSetting
    :model-value="value"
    :options="OPTIONS"
    accessible-name="Aircraft icons"
    @update:model-value="applyChange($event)"
  />
</template>
