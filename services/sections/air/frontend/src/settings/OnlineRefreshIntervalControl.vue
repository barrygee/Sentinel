<script setup lang="ts">
/**
 * Settings-panel control for how often the backend calls the online ADS-B feed
 * (`air.onlineRefreshIntervalSec`). adsb.lol allows 500 requests a day, so the
 * map and the background squawk checks share one call per interval between
 * them. The backend enforces it (and clamps it to 5–280); this control only
 * reads/edits it.
 *
 * A thin wrapper around BaseNumberSetting supplying the air-store bindings.
 */
import { ONLINE_REFRESH_INTERVAL_SETTING, useAirStore } from '../stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import BaseNumberSetting from '@sentinel/shell-api/settings/BaseNumberSetting.vue'

/** Faster than the local decoder's spacing gets a client banned from the public feeds. */
const MIN_INTERVAL_SEC = 5
/** Past this the map removes every aircraft between two refreshes (its 5-minute feed-silence limit). */
const MAX_INTERVAL_SEC = 280

const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const airStore = useAirStore()

/**
 * Mirrors a stored value into the store, clamped the way the backend clamps it,
 * so the field shows the interval actually in force.
 */
async function hydrateIntervalFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('air')
  const seconds = data?.[ONLINE_REFRESH_INTERVAL_SETTING]
  if (typeof seconds !== 'number') return
  const inForce = Math.min(Math.max(seconds, MIN_INTERVAL_SEC), MAX_INTERVAL_SEC)
  if (inForce !== airStore.onlineRefreshIntervalSec) airStore.setOnlineRefreshIntervalSec(inForce)
}

/** Persist the edited value on APPLY. */
function buildStagedWriter(value: number): () => Promise<unknown> {
  return () => settingsApi.put('air', ONLINE_REFRESH_INTERVAL_SETTING, value)
}
</script>

<template>
  <BaseNumberSetting
    accessible-name="Online refresh interval in seconds"
    unit="SECONDS"
    :min-value="MIN_INTERVAL_SEC"
    :max-length="3"
    namespace="air"
    :setting-key="ONLINE_REFRESH_INTERVAL_SETTING"
    :hydrate-from-db="hydrateIntervalFromDb"
    :read-from-store="() => airStore.onlineRefreshIntervalSec"
    :mirror-to-store="airStore.setOnlineRefreshIntervalSec"
    :build-staged-writer="buildStagedWriter"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
