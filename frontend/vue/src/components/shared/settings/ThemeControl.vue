<script setup lang="ts">
import BaseSegmentedSetting from '@/components/base/BaseSegmentedSetting.vue'
import { useStagedSetting } from '@/composables/useStagedSetting'
import { useThemeStore, type AppTheme } from '@/stores/theme'

/**
 * Settings row for the INTERFACE palette — the panels, rails and chrome. The
 * basemap has its own row (`MapThemeControl`) so the two can be set
 * independently; a dark map under a light interface is a normal pairing.
 *
 * The choice mirrors into the theme store immediately — `<html data-theme>`
 * flips as the operator watches — while the persisted write waits for APPLY
 * CHANGES like every other staged setting. The DB still stores a boolean
 * (`app.lightTheme`), which is what the segments map onto.
 */
const theme = useThemeStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const OPTIONS: ReadonlyArray<{ value: AppTheme; label: string }> = [
  { value: 'dark', label: 'DARK' },
  { value: 'light', label: 'LIGHT' },
]

const { value, applyChange } = useStagedSetting<boolean>({
  namespace: 'app',
  key: 'lightTheme',
  hydrateFromDb: theme.hydrateLightThemeFromDb,
  readFromStore: () => theme.isLight,
  mirrorToStore: theme.setLightTheme,
  stageWrite: (staged) => emit('stage', staged),
})
</script>

<template>
  <BaseSegmentedSetting
    :model-value="value ? 'light' : 'dark'"
    :options="OPTIONS"
    accessible-name="Interface palette"
    @update:model-value="applyChange($event === 'light')"
  />
</template>
