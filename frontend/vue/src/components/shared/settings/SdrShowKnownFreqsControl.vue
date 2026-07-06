<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useSdrStore } from '@/stores/sdr'

const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="SHOW KNOWN FREQUENCIES"
    accessible-name="Toggle known-frequency labels on the waterfall"
    namespace="sdr"
    setting-key="showKnownFreqs"
    :hydrate-from-db="sdr.hydrateShowKnownFreqsFromDb"
    :read-from-store="() => sdr.showKnownFreqs"
    :mirror-to-store="sdr.setShowKnownFreqs"
    @stage="emit('stage', $event)"
  />
</template>
