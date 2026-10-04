<script setup lang="ts">
/**
 * Settings-panel control for the APRS channel (MHz) the decode bridge keeps its
 * radio on — 144.800 in Europe/UK, 144.390 in North America. The backend owns
 * the frequency (`land`/`aprsChannelHz`, stored in Hz): the bridge tunes the
 * radio there on start and pulls it back whenever something else moves the
 * span off it, so this control only reads/edits the value; it never touches
 * the tuner directly.
 *
 * A thin wrapper around BaseNumberSetting supplying the land-store bindings,
 * converting between the MHz the operator types and the Hz the backend stores.
 */
import { useLandStore } from '@/stores/land'
import * as settingsApi from '@/services/settingsApi'
import BaseNumberSetting from '@/components/base/BaseNumberSetting.vue'

const landStore = useLandStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const HZ_PER_MHZ = 1_000_000

/** Reads the flat `land.aprsChannelHz` field and mirrors a valid value (as MHz) into the store. */
async function hydrateChannelFromDb(): Promise<void> {
  const data = await settingsApi.getNamespace('land')
  const raw = data?.aprsChannelHz
  const hertz = typeof raw === 'number' ? raw : Number(raw)
  if (Number.isFinite(hertz) && hertz > 0) {
    const megahertz = hertz / HZ_PER_MHZ
    if (megahertz !== landStore.aprsChannelMhz) landStore.setAprsChannelMhz(megahertz)
  }
}

/** Persist the edited value (converted to integer Hz) on APPLY. */
function buildStagedWriter(megahertz: number): () => Promise<unknown> {
  return () => settingsApi.put('land', 'aprsChannelHz', Math.round(megahertz * HZ_PER_MHZ))
}
</script>

<template>
  <BaseNumberSetting
    accessible-name="APRS channel frequency in megahertz"
    unit="MHZ"
    allow-decimal
    :min-value="24"
    namespace="land"
    setting-key="aprsChannelHz"
    :hydrate-from-db="hydrateChannelFromDb"
    :read-from-store="() => landStore.aprsChannelMhz"
    :mirror-to-store="landStore.setAprsChannelMhz"
    :build-staged-writer="buildStagedWriter"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
