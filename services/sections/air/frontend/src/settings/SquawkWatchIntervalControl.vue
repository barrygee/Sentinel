<script setup lang="ts">
/**
 * Settings-panel control for how often the backend checks ADS-B for emergency
 * squawks (7700/7600/7500) on its own while no AIR map is open — one instance
 * per connectivity mode. The backend enforces it (adsb_squawk reads
 * `air.squawkWatchOnlineIntervalSec` / `air.squawkWatchOffgridIntervalSec`);
 * this control only reads/edits it.
 *
 * A thin wrapper around BaseNumberSetting supplying the air-store bindings.
 */
import { SQUAWK_WATCH_INTERVAL_SETTING, useAirStore, type SquawkWatchMode } from '../stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import BaseNumberSetting from '@sentinel/shell-api/settings/BaseNumberSetting.vue'

/** The backend can't honour less: its watcher only looks every 5 seconds. */
const MIN_INTERVAL_SEC = 5
/** The input takes four digits; the backend ignores anything larger. */
const MAX_INTERVAL_SEC = 9999

const props = defineProps<{
  /** Which mode's interval this instance edits. */
  mode: SquawkWatchMode
}>()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const airStore = useAirStore()
const settingKey = SQUAWK_WATCH_INTERVAL_SETTING[props.mode]

/**
 * Mirrors a stored value into the store when the backend would honour it
 * (a number from 5 to 9999); anything else leaves the default showing, as the
 * backend then uses its default too.
 */
async function hydrateIntervalFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('air')
  const seconds = data?.[settingKey]
  if (
    typeof seconds === 'number' &&
    seconds >= MIN_INTERVAL_SEC &&
    seconds <= MAX_INTERVAL_SEC &&
    seconds !== airStore.squawkWatchIntervalSec[props.mode]
  ) {
    airStore.setSquawkWatchIntervalSec(props.mode, seconds)
  }
}

/** Persist the edited value on APPLY. */
function buildStagedWriter(value: number): () => Promise<unknown> {
  return () => settingsApi.put('air', settingKey, value)
}
</script>

<template>
  <BaseNumberSetting
    :accessible-name="`${mode === 'online' ? 'Online' : 'Off grid'} squawk alert check interval in seconds`"
    unit="SEC"
    :min-value="MIN_INTERVAL_SEC"
    :max-length="4"
    namespace="air"
    :setting-key="settingKey"
    :hydrate-from-db="hydrateIntervalFromDb"
    :read-from-store="() => airStore.squawkWatchIntervalSec[mode]"
    :mirror-to-store="(seconds: number) => airStore.setSquawkWatchIntervalSec(mode, seconds)"
    :build-staged-writer="buildStagedWriter"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
