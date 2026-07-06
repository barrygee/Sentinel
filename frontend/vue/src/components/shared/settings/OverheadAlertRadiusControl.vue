<script setup lang="ts">
/**
 * Settings-panel control for the overhead-alert search radius (nautical
 * miles). Thin wrapper around `BaseNumberSetting` supplying the air store
 * bindings; see that component for the shared input/staging plumbing.
 *
 * This value is persisted nested inside the shared `air/overheadAlerts`
 * object alongside the civil/mil toggle flags owned by
 * `OverheadAlertsToggleControl` — so its staged write must read those
 * sibling flags live (via `buildStagedWriter`) rather than staging a bare
 * `radiusNm` value, to avoid clobbering them on APPLY. Hydration similarly
 * reads the nested `overheadAlerts.radiusNm` field directly rather than a
 * flat settings key, and (matching the pre-migration behaviour exactly)
 * does not listen for `sentinel:config-uploaded` — only the toggle control's
 * mount-time read performs the legacy flat-key migration/cleanup.
 */
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'
import BaseNumberSetting from '@/components/base/BaseNumberSetting.vue'

const airStore = useAirStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

interface OverheadAlertsConfig {
  civil?: boolean
  mil?: boolean
  radiusNm?: number
}

function readOverhead(data: Record<string, unknown> | null): OverheadAlertsConfig {
  const overheadAlertsValue = data?.overheadAlerts
  return overheadAlertsValue &&
    typeof overheadAlertsValue === 'object' &&
    !Array.isArray(overheadAlertsValue)
    ? (overheadAlertsValue as OverheadAlertsConfig)
    : {}
}

/** Reads the nested `overheadAlerts.radiusNm` field and mirrors it into the store if it's a valid, different value. */
async function hydrateOverheadRadiusFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('air')
  const overheadAlertsConfig = readOverhead(data)
  const numericRadius =
    typeof overheadAlertsConfig.radiusNm === 'number'
      ? overheadAlertsConfig.radiusNm
      : Number(overheadAlertsConfig.radiusNm)
  if (
    Number.isFinite(numericRadius) &&
    numericRadius > 0 &&
    numericRadius !== airStore.overheadAlertRadiusNm
  ) {
    airStore.setOverheadAlertRadiusNm(numericRadius)
  }
}

/** Builds the combined `overheadAlerts` payload, reading the sibling toggle flags live at APPLY time. */
function buildStagedWriter(): () => Promise<unknown> {
  return () =>
    settingsApi.put('air', 'overheadAlerts', {
      civil: airStore.overlayStates.overheadAlertsCivil,
      mil: airStore.overlayStates.overheadAlertsMil,
      radiusNm: airStore.overheadAlertRadiusNm,
    })
}
</script>

<template>
  <BaseNumberSetting
    accessible-name="Overhead alert radius in nautical miles"
    unit="NM"
    allow-decimal
    :min-value="0"
    min-exclusive
    namespace="air"
    setting-key="overheadAlerts"
    :hydrate-from-db="hydrateOverheadRadiusFromDb"
    :read-from-store="() => airStore.overheadAlertRadiusNm"
    :mirror-to-store="airStore.setOverheadAlertRadiusNm"
    :build-staged-writer="buildStagedWriter"
    :sync-on-config-upload="false"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
