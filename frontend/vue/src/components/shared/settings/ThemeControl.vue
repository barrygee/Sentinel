<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useThemeStore } from '@/stores/theme'

/**
 * Settings row for the light/dark theme. The switch mirrors into the theme
 * store immediately — the maps repaint and `<html data-theme>` flips as the
 * operator watches — while the persisted write waits for APPLY CHANGES like
 * every other staged setting.
 */
const theme = useThemeStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="LIGHT THEME"
    accessible-name="Use the light theme for the maps and the interface"
    namespace="app"
    setting-key="lightTheme"
    :hydrate-from-db="theme.hydrateLightThemeFromDb"
    :read-from-store="() => theme.isLight"
    :mirror-to-store="theme.setLightTheme"
    @stage="emit('stage', $event)"
  />
</template>
