<script setup lang="ts">
/**
 * Settings-panel control for the online ADS-B feed's daily call limit
 * (`air.onlineDailyCallLimit`), for a feed that has one but doesn't state it in
 * its `X-RateLimit-Limit` header. 0 (the default) uses the feed's own figure;
 * a feed stating none is then counted without warnings. The backend reads it
 * (sentinel_air.services.online_quota); this control only reads/edits it.
 *
 * A thin wrapper around BaseNumberSetting supplying the air-store bindings.
 */
import { ONLINE_DAILY_CALL_LIMIT_SETTING, useAirStore } from '../stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import BaseNumberSetting from '@sentinel/shell-api/settings/BaseNumberSetting.vue'

const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const airStore = useAirStore()

/**
 * Mirrors a stored whole number of 0 or more into the store; anything else
 * leaves 0 showing, as the backend then uses the feed's own figure too.
 */
async function hydrateLimitFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('air')
  const calls = data?.[ONLINE_DAILY_CALL_LIMIT_SETTING]
  if (typeof calls !== 'number' || !Number.isInteger(calls) || calls < 0) return
  if (calls !== airStore.onlineDailyCallLimit) airStore.setOnlineDailyCallLimit(calls)
}

/** Persist the edited value on APPLY. */
function buildStagedWriter(value: number): () => Promise<unknown> {
  return () => settingsApi.put('air', ONLINE_DAILY_CALL_LIMIT_SETTING, value)
}
</script>

<template>
  <BaseNumberSetting
    accessible-name="Online data source daily call limit, 0 to use the feed's own figure"
    unit="CALLS"
    :min-value="0"
    :max-length="6"
    namespace="air"
    :setting-key="ONLINE_DAILY_CALL_LIMIT_SETTING"
    :hydrate-from-db="hydrateLimitFromDb"
    :read-from-store="() => airStore.onlineDailyCallLimit"
    :mirror-to-store="airStore.setOnlineDailyCallLimit"
    :build-staged-writer="buildStagedWriter"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
