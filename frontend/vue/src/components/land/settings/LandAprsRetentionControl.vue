<script setup lang="ts">
/**
 * Settings-panel control for the APRS station retention window (minutes) — how
 * long a heard station stays plotted on the Land map after its last signal
 * before it is dropped. The backend enforces this (aprs_store reads the
 * `land`/`aprsRetentionMinutes` setting); this control only reads/edits it.
 *
 * A thin wrapper around BaseNumberSetting supplying the land-store bindings.
 */
import { useLandStore } from '@/stores/land'
import * as settingsApi from '@/services/settingsApi'
import BaseNumberSetting from '@/components/base/BaseNumberSetting.vue'

const landStore = useLandStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

/** Reads the flat `land.aprsRetentionMinutes` field and mirrors a valid value into the store. */
async function hydrateRetentionFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('land')
  const raw = data?.aprsRetentionMinutes
  const minutes = typeof raw === 'number' ? raw : Number(raw)
  if (Number.isFinite(minutes) && minutes > 0 && minutes !== landStore.aprsRetentionMinutes) {
    landStore.setAprsRetentionMinutes(minutes)
  }
}

/** Persist the edited value on APPLY. */
function buildStagedWriter(value: number): () => Promise<unknown> {
  return () => settingsApi.put('land', 'aprsRetentionMinutes', value)
}
</script>

<template>
  <BaseNumberSetting
    accessible-name="APRS station retention in minutes"
    unit="MIN"
    :min-value="1"
    namespace="land"
    setting-key="aprsRetentionMinutes"
    :hydrate-from-db="hydrateRetentionFromDb"
    :read-from-store="() => landStore.aprsRetentionMinutes"
    :mirror-to-store="landStore.setAprsRetentionMinutes"
    :build-staged-writer="buildStagedWriter"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
