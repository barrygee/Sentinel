<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useSdrStore } from '@/stores/sdr'
import * as settingsApi from '@/services/settingsApi'

const sdrStore = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

/**
 * Re-reads `trunkTrackingEnabled` from the `sdr` settings namespace and
 * mirrors it into the store if present — same pattern as
 * `AirReplayToggleControl`'s hydrate (no dedicated store hydrate action).
 */
async function hydrateTrunkTrackingFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('sdr')
  const nextValue = data?.trunkTrackingEnabled
  if (typeof nextValue === 'boolean') {
    sdrStore.setTrunkTrackingEnabled(nextValue)
  }
}
</script>

<template>
  <!--
    deferMirror: the store change here shows/hides the TRUNK SYSTEM section
    and the Trunk Channel Maps config row, so it (and the DB write) are
    deferred until APPLY CHANGES — only the switch position itself reflects
    the click immediately.
  -->
  <BaseToggleSetting
    label="ENABLE TRUNK TRACKING"
    accessible-name="Toggle trunk tracking"
    namespace="sdr"
    setting-key="trunkTrackingEnabled"
    :hydrate-from-db="hydrateTrunkTrackingFromDb"
    :read-from-store="() => sdrStore.trunkTrackingEnabled"
    :mirror-to-store="sdrStore.setTrunkTrackingEnabled"
    defer-mirror
    @stage="emit('stage', $event)"
  />
</template>
