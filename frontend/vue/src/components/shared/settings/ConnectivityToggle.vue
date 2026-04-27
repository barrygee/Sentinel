<template>
  <div class="settings-connectivity-wrap">
    <div class="settings-connectivity-switch">
      <span class="settings-connectivity-label">OFF GRID</span>
      <button
        class="settings-connectivity-track"
        :class="{ 'is-online': isOnline }"
        role="switch"
        :aria-checked="isOnline"
        aria-label="Toggle connectivity mode"
        @click="toggle"
      ><span class="settings-connectivity-thumb"></span></button>
    </div>
    <div v-if="overrideConflicts.length > 0" class="settings-connectivity-override-summary">
      <div class="settings-conn-override-heading">SECTION OVERRIDES</div>
      <div v-for="c in overrideConflicts" :key="c.ns" class="settings-conn-override-row">
        <span class="settings-conn-override-ns">{{ c.ns.toUpperCase() }}</span>
        <span class="settings-conn-override-arrow">→</span>
        <span class="settings-conn-override-val" :class="'settings-conn-override-val--' + c.override">{{ c.override.toUpperCase() }}</span>
      </div>
    </div>
    <div v-if="warningVisible" class="settings-connectivity-warning">
      <span class="settings-connectivity-warning-msg">Some domains have source overrides set. Switching will reset all overrides to AUTO.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'
import { useAppStore } from '@/stores/app'
import type { ConnectivityMode } from '@/stores/app'

const appStore = useAppStore()

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const LS_KEY = 'sentinel_app_connectivityMode'
const DOMAIN_NAMESPACES = ['air', 'space', 'sea', 'land']

const isOnline = ref(true)
const warningVisible = ref(false)

try {
  isOnline.value = (localStorage.getItem(LS_KEY) ?? 'online') !== 'offgrid'
} catch {}

const overrideConflicts = computed(() => {
  const appMode = isOnline.value ? 'online' : 'offgrid'
  return DOMAIN_NAMESPACES.flatMap(ns => {
    let override = 'auto'
    try { override = localStorage.getItem('sentinel_' + ns + '_sourceOverride') ?? 'auto' } catch {}
    return override !== 'auto' && override !== appMode ? [{ ns, override }] : []
  })
})

function hasOverrides(): boolean {
  return DOMAIN_NAMESPACES.some(ns => {
    try { const v = localStorage.getItem('sentinel_' + ns + '_sourceOverride'); return !!v && v !== 'auto' } catch { return false }
  })
}

function resetAllOverrides(): void {
  DOMAIN_NAMESPACES.forEach(ns => {
    try { localStorage.setItem('sentinel_' + ns + '_sourceOverride', 'auto') } catch {}
    settingsApi.put(ns, 'sourceOverride', 'auto')
  })
}

function applyMode(mode: string): void {
  isOnline.value = mode === 'online'
  try { localStorage.setItem(LS_KEY, mode) } catch {}
  settingsApi.put('app', 'connectivityMode', mode)
  appStore.setConnectivityMode(mode as ConnectivityMode)
}

function toggle(): void {
  const newMode = isOnline.value ? 'offgrid' : 'online'
  if (hasOverrides()) {
    warningVisible.value = true
    resetAllOverrides()
    window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
  }
  applyMode(newMode)
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('app')
  if (data?.connectivityMode) {
    const backendMode = data.connectivityMode as string
    if ((backendMode === 'offgrid') === isOnline.value) {
      isOnline.value = backendMode === 'online'
      try { localStorage.setItem(LS_KEY, backendMode) } catch {}
      appStore.setConnectivityMode(backendMode as ConnectivityMode)
    }
  }
})

window.addEventListener('sentinel:sourceOverrideChanged', () => {
  // computed re-evaluates automatically
})
</script>
