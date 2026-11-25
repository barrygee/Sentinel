<script setup lang="ts">
import BaseToggleSetting from '@sentinel/shell-api/settings/BaseToggleSetting.vue'
import { getNamespace } from '@sentinel/shell-api/services/settingsApi'
import { getRegisteredSections } from '@sentinel/shell-api/shell/sectionRegistry'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { computed } from 'vue'

/**
 * Settings › App Settings › SECTIONS › 3D Globe: the `globe.enabled` switch
 * that shows or hides the GLOBE section.
 *
 * The backing store is the shell's list of enabled sections
 * (`appStore.enabledDomains`), which is what the nav and router read. The
 * change waits for APPLY (`defer-mirror`), so GLOBE doesn't flash into the nav
 * before the setting is saved; APPLY then refreshes every section's
 * `<id>.enabled` from the backend anyway.
 */
const GLOBE_SECTION_ID = 'globe'

const app = useAppStore()
const globeEnabled = computed(() => app.enabledDomains.includes(GLOBE_SECTION_ID))

// A fixed caption and name: the switch only changes the store on APPLY, so
// wording read from the store would lag behind the switch until then. Its
// on/off state is the switch's own (`aria-checked`).
const TOGGLE_CAPTION = 'Show'
const TOGGLE_ACCESSIBLE_NAME = 'Show the globe section'

/** Adds or removes GLOBE from the enabled sections, keeping them in nav order. */
function setGlobeEnabled(enabled: boolean): void {
  const enabledIds = new Set(app.enabledDomains)
  if (enabled) enabledIds.add(GLOBE_SECTION_ID)
  else enabledIds.delete(GLOBE_SECTION_ID)
  const inNavOrder = getRegisteredSections()
    .map((section) => section.id)
    .filter((sectionId) => enabledIds.has(sectionId))
  app.setEnabledDomains(inNavOrder)
}

/** Reads `globe.enabled` into the store (on mount and after a config file upload); a missing key means off. */
async function hydrateGlobeEnabledFromDb(): Promise<void> {
  const stored = await getNamespace(GLOBE_SECTION_ID)
  if (!stored) return
  setGlobeEnabled(stored.enabled === true)
}

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    :label="TOGGLE_CAPTION"
    :accessible-name="TOGGLE_ACCESSIBLE_NAME"
    namespace="globe"
    setting-key="enabled"
    :hydrate-from-db="hydrateGlobeEnabledFromDb"
    :read-from-store="() => globeEnabled"
    :mirror-to-store="setGlobeEnabled"
    defer-mirror
    @stage="emit('stage', $event)"
  />
</template>
