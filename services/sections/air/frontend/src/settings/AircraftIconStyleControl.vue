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
 *
 * Each option shows an example above its name: an arrow label for ARROW; for
 * SILHOUETTE, an airliner with its callsign as on hover beside a light
 * aircraft with none, both at the size the map draws them.
 */
import BaseSegmentedSetting from '@sentinel/ui/base/BaseSegmentedSetting.vue'
import { useStagedSetting } from '@sentinel/shell-api/settings/useStagedSetting'
import { AIRCRAFT_ICON_STYLE_SETTING, useAirStore, type AircraftIconStyle } from '../stores/air'
import AircraftIconExampleTile from './aircraft-icon-examples/AircraftIconExampleTile.vue'
import ArrowLabelExample from './aircraft-icon-examples/ArrowLabelExample.vue'
import SilhouetteExample from './aircraft-icon-examples/SilhouetteExample.vue'

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
  >
    <template #option="{ option }">
      <span class="aircraft-icon-option">
        <AircraftIconExampleTile>
          <ArrowLabelExample v-if="option.value === 'arrow'" />
          <template v-else>
            <SilhouetteExample shape-key="type:A320" :track-deg="60" callsign="BAW123" />
            <SilhouetteExample shape-key="type:C172" :track-deg="300" />
          </template>
        </AircraftIconExampleTile>
        {{ option.label }}
      </span>
    </template>
  </BaseSegmentedSetting>
</template>

<style scoped>
.aircraft-icon-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
