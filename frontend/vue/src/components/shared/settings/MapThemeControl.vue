<script setup lang="ts">
import BaseSegmentedSetting from '@/components/base/BaseSegmentedSetting.vue'
import { useStagedSetting } from '@/composables/useStagedSetting'
import { useThemeStore, type MapTheme } from '@/stores/theme'

/**
 * Settings row for the BASEMAP palette, separate from the interface one
 * (`ThemeControl`). COLOUR is the cartographic build — for when the map is
 * being read as a map rather than used as ground for the overlays.
 *
 * The maps repaint as the choice moves (MapLibre reloads the style) while the
 * persisted write waits for APPLY CHANGES like every other staged setting.
 * It writes `app.mapTheme`; the store still reads the older boolean
 * `app.lightMapTheme` when that is all a config has.
 */
const theme = useThemeStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const OPTIONS: ReadonlyArray<{ value: MapTheme; label: string }> = [
  { value: 'dark', label: 'DARK' },
  { value: 'light', label: 'LIGHT' },
  { value: 'colour', label: 'COLOUR' },
]

const { value, applyChange } = useStagedSetting<MapTheme>({
  namespace: 'app',
  key: 'mapTheme',
  hydrateFromDb: theme.hydrateMapThemeFromDb,
  readFromStore: () => theme.mapTheme,
  mirrorToStore: theme.setMapTheme,
  stageWrite: (staged) => emit('stage', staged),
})
</script>

<template>
  <BaseSegmentedSetting
    :model-value="value"
    :options="OPTIONS"
    accessible-name="Basemap palette"
    @update:model-value="applyChange($event)"
  />
</template>
