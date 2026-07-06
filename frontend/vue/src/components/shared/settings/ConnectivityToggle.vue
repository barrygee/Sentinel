<template>
  <div class="settings-connectivity-wrap">
    <div class="settings-connectivity-switch">
      <span class="settings-connectivity-label">OFF GRID</span>
      <BaseToggleSwitch
        :model-value="offGrid"
        accessible-name="Toggle off grid mode"
        @update:model-value="toggle"
      />
    </div>
    <div v-if="overrideConflicts.length > 0" class="settings-connectivity-override-summary">
      <div class="settings-conn-override-heading">SECTION OVERRIDES</div>
      <div v-for="c in overrideConflicts" :key="c.ns" class="settings-conn-override-row">
        <span class="settings-conn-override-ns">{{ c.ns.toUpperCase() }}</span>
        <span class="settings-conn-override-arrow">→</span>
        <span
          class="settings-conn-override-val"
          :class="'settings-conn-override-val--' + c.override"
          >{{ c.override.toUpperCase() }}</span
        >
      </div>
    </div>
    <div v-if="warningVisible" class="settings-connectivity-warning">
      <span class="settings-connectivity-warning-msg"
        >Some domains have source overrides set. Switching will reset all overrides to AUTO.</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'
import { useAppStore } from '@/stores/app'
import type { ConnectivityMode } from '@/stores/app'
import BaseToggleSwitch from '@/components/base/BaseToggleSwitch.vue'

const appStore = useAppStore()

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const LS_KEY = 'sentinel_app_connectivityMode'
const DOMAIN_NAMESPACES = ['air', 'space', 'sea', 'land']

const offGrid = ref(false)
const warningVisible = ref(false)

try {
  offGrid.value = (localStorage.getItem(LS_KEY) ?? 'online') === 'offgrid'
} catch {}

const overrideConflicts = computed(() => {
  const appMode = offGrid.value ? 'offgrid' : 'online'
  return DOMAIN_NAMESPACES.flatMap((ns) => {
    let override = 'auto'
    try {
      override = localStorage.getItem('sentinel_' + ns + '_sourceOverride') ?? 'auto'
    } catch {}
    return override !== 'auto' && override !== appMode ? [{ ns, override }] : []
  })
})

function hasOverrides(): boolean {
  return DOMAIN_NAMESPACES.some((ns) => {
    try {
      const v = localStorage.getItem('sentinel_' + ns + '_sourceOverride')
      return !!v && v !== 'auto'
    } catch {
      return false
    }
  })
}

function resetAllOverrides(): void {
  DOMAIN_NAMESPACES.forEach((ns) => {
    try {
      localStorage.setItem('sentinel_' + ns + '_sourceOverride', 'auto')
    } catch {}
    settingsApi.put(ns, 'sourceOverride', 'auto')
  })
}

function toggle(nextOffGrid: boolean): void {
  offGrid.value = nextOffGrid
  const newMode = offGrid.value ? 'offgrid' : 'online'
  const needsOverrideReset = hasOverrides()
  if (needsOverrideReset) warningVisible.value = true
  emit('stage', () => {
    if (needsOverrideReset) {
      resetAllOverrides()
      window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
    }
    try {
      localStorage.setItem(LS_KEY, newMode)
    } catch {}
    settingsApi.put('app', 'connectivityMode', newMode)
    appStore.setConnectivityMode(newMode as ConnectivityMode)
  })
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('app')
  if (data?.connectivityMode) {
    const backendMode = data.connectivityMode as string
    const backendOffGrid = backendMode === 'offgrid'
    if (backendOffGrid !== offGrid.value) {
      offGrid.value = backendOffGrid
      try {
        localStorage.setItem(LS_KEY, backendMode)
      } catch {}
      appStore.setConnectivityMode(backendMode as ConnectivityMode)
    }
  }
})

window.addEventListener('sentinel:sourceOverrideChanged', () => {
  // computed re-evaluates automatically
})
</script>

<style scoped>
/* BaseToggleSwitch's default "on" color is a hardcoded lime (#c8ff00). This
   control's on-state previously referenced `--color-accent`, a custom
   property that is never actually defined anywhere in the app, so today it
   renders as transparent (the track never visibly changes color, though the
   thumb still slides and darkens). That's arguably a latent bug, but this
   phase is a pure markup/CSS consolidation with zero intended behaviour
   change, so this override reproduces the existing look exactly rather than
   silently "fixing" it as a side effect of the refactor. */
:deep(.toggle-track.is-on) {
  background: var(--color-accent);
}
</style>
