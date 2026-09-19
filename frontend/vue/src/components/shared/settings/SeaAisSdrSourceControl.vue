<template>
  <SdrRadioSelect
    v-model="selectedRadioValue"
    accessible-name="AIS receive SDR"
    off-label="Not set — no off-grid AIS receiver"
    decode-name="Off-grid AIS decode"
  />
</template>

<script setup lang="ts">
/**
 * Settings › SEA › AIS › Off Grid SDR — which configured SDR radio is the AIS
 * receiver when the Sea map is off grid, the Sea twin of LAND's APRS SDR.
 *
 * The choice is a plain setting (`sea.aisSdrRadioId`, in the app-config JSON),
 * staged into APPLY CHANGES like the rest of the panel. Nothing decodes from
 * it yet — the AIVDM decode path from a radio is a follow-up — so for now it
 * only records the receiver.
 */
import { onMounted, ref, watch } from 'vue'
import SdrRadioSelect from './SdrRadioSelect.vue'
import * as settingsApi from '@/services/settingsApi'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const selectedRadioValue = ref('')
/** True while the persisted choice is written into the dropdown, so the model
 *  watcher does not stage a "change" that only restated the backend's value. */
let isHydrating = false

watch(
  selectedRadioValue,
  (nextValue) => {
    if (isHydrating) return
    const radioId = nextValue ? Number(nextValue) : null
    emit('stage', () => settingsApi.put('sea', 'aisSdrRadioId', radioId))
  },
  { flush: 'sync' },
)

onMounted(async () => {
  const sea = await settingsApi.getNamespace('sea')
  const stored = sea?.aisSdrRadioId
  isHydrating = true
  selectedRadioValue.value = typeof stored === 'number' ? String(stored) : ''
  isHydrating = false
})
</script>
