<script setup lang="ts">
/**
 * Settings-panel control for how often the waterfall's time markers are drawn,
 * in seconds — the equivalent of SDR#'s time-marker interval. Thin wrapper
 * around `BaseNumberSetting` supplying the SDR store bindings; see that
 * component for the shared input/staging plumbing.
 */
import { useSdrStore } from '@/stores/sdr'
import BaseNumberSetting from '@/components/base/BaseNumberSetting.vue'

const sdr = useSdrStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()
</script>

<template>
  <BaseNumberSetting
    accessible-name="Waterfall timestamp interval in seconds"
    :max-length="4"
    :min-value="1"
    namespace="sdr"
    setting-key="waterfallTimestampIntervalSec"
    :hydrate-from-db="sdr.hydrateWaterfallTimestampIntervalFromDb"
    :read-from-store="() => sdr.waterfallTimestampIntervalSec"
    :mirror-to-store="sdr.setWaterfallTimestampIntervalSec"
    @stage="emit('stage', $event)"
    @commit="emit('commit')"
  />
</template>
