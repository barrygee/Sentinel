<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

/**
 * Re-reads `replayEnabled` from the `air` settings namespace and mirrors it
 * into the store if present. Unlike most toggles this control has no
 * dedicated store hydrate action — the store's `replayEnabled` field is a
 * plain flag, so we read the raw namespace here, matching the control's
 * pre-extraction behaviour exactly.
 */
async function hydrateReplayEnabledFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('air')
  const nextValue = data?.replayEnabled
  if (typeof nextValue === 'boolean') {
    airStore.setReplayEnabled(nextValue)
  }
}
</script>

<template>
  <!--
    deferMirror: the store change here shows/hides the REPLAY tab, so it (and
    the DB write) are deferred until APPLY CHANGES — only the switch position
    itself reflects the click immediately.
  -->
  <BaseToggleSetting
    label="RECORD FLIGHTS"
    accessible-name="Toggle air replay recording"
    namespace="air"
    setting-key="replayEnabled"
    :hydrate-from-db="hydrateReplayEnabledFromDb"
    :read-from-store="() => airStore.replayEnabled"
    :mirror-to-store="airStore.setReplayEnabled"
    defer-mirror
    @stage="emit('stage', $event)"
  />
</template>
