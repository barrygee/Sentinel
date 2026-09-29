<template>
  <div class="settings-connectivity-wrap">
    <BaseSegmentedSetting
      :model-value="mode"
      :options="SOURCE_MODE_OPTIONS"
      accessible-name="Connectivity mode"
      reselectable
      @update:model-value="selectMode"
    />
    <div v-if="differingSections.length > 0" class="settings-connectivity-override-summary">
      <div class="settings-conn-override-heading">SECTION OVERRIDES</div>
      <BaseWarningNotice
        v-if="hasPickedMode"
        :message="`These section overrides will be set to ${modeLabel(mode)} when you click APPLY CHANGES.`"
      />
      <div
        v-for="section in differingSections"
        :key="section.ns"
        class="settings-conn-override-row"
      >
        <span class="settings-conn-override-ns">{{ section.ns.toUpperCase() }}</span>
        <span
          class="settings-conn-override-val"
          :class="'settings-conn-override-val--' + section.mode"
          >{{ modeLabel(section.mode) }}</span
        >
        <template v-if="hasPickedMode">
          <span class="settings-conn-override-arrow" aria-hidden="true">→</span>
          <span class="sr-only">will become</span>
          <span class="settings-conn-override-val" :class="'settings-conn-override-val--' + mode">{{
            modeLabel(mode)
          }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The app-wide connectivity mode: ONLINE or OFF GRID.
 *
 * Each section (Air, Space, Sea) also stores its own mode in `sourceOverride`,
 * so picking one here sets every section to it — the sections' own pickers are
 * for running one section differently afterwards. Sections already set
 * differently are listed so that reset is never a surprise.
 */
import { computed, onMounted, ref } from 'vue'
import * as settingsApi from '@/services/settingsApi'
import { useAppStore } from '@/stores/app'
import BaseSegmentedSetting from '@/components/base/BaseSegmentedSetting.vue'
import BaseWarningNotice from '@/components/base/BaseWarningNotice.vue'
import {
  APP_MODE_STORAGE_KEY,
  SOURCE_MODE_LABELS,
  SOURCE_MODE_OPTIONS,
  SOURCE_MODE_SECTIONS,
  asSourceMode,
  sectionModeStorageKey,
  type SourceMode,
} from '@/utils/sourceMode'

const appStore = useAppStore()

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const mode = ref<SourceMode>(readCachedMode())
/** Each section's stored mode; null when unset, which means "follows the app". */
const sectionModes = ref<Record<string, SourceMode | null>>(readCachedSectionModes())
/** True once a mode has been picked here, so the list shows what each section becomes. */
const hasPickedMode = ref(false)

function readCachedMode(): SourceMode {
  try {
    return asSourceMode(localStorage.getItem(APP_MODE_STORAGE_KEY)) ?? 'online'
  } catch {
    return 'online'
  }
}

function readCachedSectionModes(): Record<string, SourceMode | null> {
  const modes: Record<string, SourceMode | null> = {}
  for (const section of SOURCE_MODE_SECTIONS) {
    try {
      modes[section] = asSourceMode(localStorage.getItem(sectionModeStorageKey(section)))
    } catch {
      modes[section] = null
    }
  }
  return modes
}

function modeLabel(sourceMode: SourceMode): string {
  return SOURCE_MODE_LABELS[sourceMode]
}

/** Sections running in a different mode from the one selected here. */
const differingSections = computed(() =>
  SOURCE_MODE_SECTIONS.flatMap((ns) => {
    const sectionMode = sectionModes.value[ns]
    return sectionMode && sectionMode !== mode.value ? [{ ns, mode: sectionMode }] : []
  }),
)

function selectMode(nextMode: SourceMode): void {
  hasPickedMode.value = true
  mode.value = nextMode
  // Awaited as one promise: APPLY CHANGES reloads the page shortly after the
  // staged work resolves, and an unfinished section write would be lost.
  emit('stage', () => {
    for (const section of SOURCE_MODE_SECTIONS) {
      try {
        localStorage.setItem(sectionModeStorageKey(section), nextMode)
      } catch {}
    }
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, nextMode)
    } catch {}
    appStore.setConnectivityMode(nextMode)
    window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
    return Promise.all([
      ...SOURCE_MODE_SECTIONS.map((section) =>
        settingsApi.put(section, 'sourceOverride', nextMode),
      ),
      settingsApi.put('app', 'connectivityMode', nextMode),
    ])
  })
}

onMounted(async () => {
  const appSettings = await settingsApi.getNamespace('app')
  const backendMode = asSourceMode(appSettings?.connectivityMode)
  if (backendMode && backendMode !== mode.value) {
    mode.value = backendMode
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, backendMode)
    } catch {}
    appStore.setConnectivityMode(backendMode)
  }
  // The backend is authoritative for section modes too (another device, or a
  // hand-edit of the config file, may have changed them).
  const sectionSettings = await Promise.all(
    SOURCE_MODE_SECTIONS.map((section) => settingsApi.getNamespace(section)),
  )
  SOURCE_MODE_SECTIONS.forEach((section, sectionIndex) => {
    const stored = asSourceMode(sectionSettings[sectionIndex]?.sourceOverride)
    if (stored) sectionModes.value[section] = stored
  })
})
</script>
