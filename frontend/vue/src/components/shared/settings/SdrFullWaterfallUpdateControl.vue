<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useSdrStore } from '@/stores/sdr'

// "Full waterfall update" toggle — matches SDR++ User Guide v1.1 p. 34. ON
// resets the waterfall history each time Zoom changes so new rows fill the
// narrower viewport cleanly. Persistence and DB hydration mirror
// SdrAutoCenterControl exactly.
const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="FULL WATERFALL UPDATE"
    accessible-name="Toggle full waterfall update on zoom change"
    namespace="sdr"
    setting-key="fullWaterfallUpdate"
    :hydrate-from-db="sdr.hydrateFullWaterfallUpdateFromDb"
    :read-from-store="() => sdr.fullWaterfallUpdate"
    :mirror-to-store="sdr.setFullWaterfallUpdate"
    @stage="emit('stage', $event)"
  />
</template>
