<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useThemeStore } from '@/stores/theme'

/**
 * Settings row for the BASEMAP palette, separate from the interface one
 * (`ThemeControl`). The maps repaint as the switch moves — MapLibre reloads
 * the light or dark style — while the persisted write waits for APPLY
 * CHANGES like every other staged setting.
 */
const theme = useThemeStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="LIGHT MAP"
    accessible-name="Use the light basemap"
    namespace="app"
    setting-key="lightMapTheme"
    :hydrate-from-db="theme.hydrateLightMapThemeFromDb"
    :read-from-store="() => theme.isMapLight"
    :mirror-to-store="theme.setLightMapTheme"
    @stage="emit('stage', $event)"
  />
</template>
