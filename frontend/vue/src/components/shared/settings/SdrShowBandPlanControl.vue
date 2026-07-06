<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useSdrStore } from '@/stores/sdr'

const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="SHOW BAND PLAN"
    accessible-name="Toggle band-plan strip on the waterfall"
    namespace="sdr"
    setting-key="showBandPlan"
    :hydrate-from-db="sdr.hydrateShowBandPlanFromDb"
    :read-from-store="() => sdr.showBandPlan"
    :mirror-to-store="sdr.setShowBandPlan"
    @stage="emit('stage', $event)"
  />
</template>
