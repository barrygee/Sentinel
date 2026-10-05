<template>
  <div class="settings-source-override-wrap">
    <BaseSegmentedSetting
      :model-value="current"
      :options="SOURCE_MODE_OPTIONS"
      :accessible-name="`${props.ns.toUpperCase()} data source mode`"
      @update:model-value="select"
    />
    <div v-if="current !== appMode" class="settings-source-override-note">
      This section differs from the app-level connectivity mode.
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One section's data source mode: ONLINE or OFF GRID.
 *
 * Stored as `{ns}.sourceOverride`. The app-wide Connectivity Mode sets every
 * section at once; this picks a different mode for just this one. A section
 * with no stored mode (or the retired 'auto') shows — and runs in — the
 * app-level mode.
 */
import { computed, onMounted, ref } from 'vue'
import BaseSegmentedSetting from '@sentinel/ui/base/BaseSegmentedSetting.vue'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import {
  SOURCE_MODE_OPTIONS,
  asSourceMode,
  sectionModeStorageKey,
  type SourceMode,
} from '@sentinel/shell-api/utils/sourceMode'

const props = defineProps<{ ns: string }>()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const appStore = useAppStore()
const LS_KEY = sectionModeStorageKey(props.ns)

/** The app-level mode, which a section without its own mode runs in. */
const appMode = computed<SourceMode>(() => appStore.connectivityMode)
/** This section's own stored mode, or null when it has none. */
const storedMode = ref<SourceMode | null>(null)
const current = computed<SourceMode>(() => storedMode.value ?? appMode.value)

try {
  storedMode.value = asSourceMode(localStorage.getItem(LS_KEY))
} catch {}

onMounted(async () => {
  const data = await settingsApi.getNamespace(props.ns)
  const backendMode = asSourceMode(data?.sourceOverride)
  if (backendMode && backendMode !== storedMode.value) {
    storedMode.value = backendMode
    try {
      localStorage.setItem(LS_KEY, backendMode)
    } catch {}
  }
})

function select(nextMode: SourceMode): void {
  storedMode.value = nextMode
  emit('stage', () => {
    try {
      localStorage.setItem(LS_KEY, nextMode)
    } catch {}
    void settingsApi.put(props.ns, 'sourceOverride', nextMode)
    window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
  })
}
</script>
