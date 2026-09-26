<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useThemeStore } from '@/stores/theme'

/**
 * Settings row for the INTERFACE palette — the panels, rails and chrome. The
 * basemap has its own row (`MapThemeControl`) so the two can be set
 * independently; a dark map under a light interface is a normal pairing.
 *
 * The switch mirrors into the theme store immediately — `<html data-theme>`
 * flips as the operator watches — while the persisted write waits for APPLY
 * CHANGES like every other staged setting.
 */
const theme = useThemeStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="LIGHT INTERFACE"
    accessible-name="Use the light palette for the interface"
    namespace="app"
    setting-key="lightTheme"
    :hydrate-from-db="theme.hydrateLightThemeFromDb"
    :read-from-store="() => theme.isLight"
    :mirror-to-store="theme.setLightTheme"
    @stage="emit('stage', $event)"
  />
</template>
