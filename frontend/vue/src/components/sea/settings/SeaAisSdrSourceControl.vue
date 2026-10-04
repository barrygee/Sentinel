<template>
  <RadioSelect
    v-model="selectedRadioValue"
    accessible-name="AIS receive SDR"
    off-label="Not set — no off-grid AIS receiver"
    decode-name="Off-grid AIS decode"
  />
</template>

<script setup lang="ts">
/**
 * Settings › SEA › AIS › Off Grid AIS SDR — which configured SDR radio is the AIS
 * receiver when the Sea map is off grid, the Sea twin of LAND's Off Grid APRS SDR.
 *
 * This control only *designates* the receiver (`sea.aisSdrRadioId`, staged into
 * APPLY CHANGES like the rest of the panel). It deliberately does not start
 * decoding, which is where it differs from `AprsSdrSourceControl`: APRS runs
 * unattended from the moment a radio is picked, whereas AIS starts when the
 * operator opens the Sea section off grid (see `useOffgridAisDecode`). Naming a
 * receiver while online would otherwise tie up a dongle to duplicate a feed
 * already arriving from AISStream.
 *
 * Clearing the selection *does* act immediately, because the operator is
 * asking for the radio back: whatever is decoding is stopped here rather than
 * left holding the dongle until the next visit to Sea.
 */
import { onMounted, ref, watch } from 'vue'
import RadioSelect from '@/components/shared/settings/RadioSelect.vue'
import { useRadio } from '@/shell/useRadio'
import * as settingsApi from '@/services/settingsApi'

// The decoder is released through the radio platform's `radio.decoders` (F10).
const { radio } = useRadio()
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
    emit('stage', async () => {
      await settingsApi.put('sea', 'aisSdrRadioId', radioId)
      // Giving the radio back takes effect now; taking one waits until Sea is
      // actually opened off grid.
      const decoders = radio.value?.decoders
      const decodingRadioId = decoders?.activeRadioId('ais') ?? null
      if (radioId === null && decoders && decodingRadioId !== null) {
        const stopped = await decoders.stop('ais', decodingRadioId)
        if (!stopped) throw new Error('Off-grid AIS decode could not be stopped')
      }
    })
  },
  { flush: 'sync' },
)

onMounted(async () => {
  const sea = await settingsApi.getNamespace('sea')
  const stored = sea?.aisSdrRadioId
  isHydrating = true
  selectedRadioValue.value = typeof stored === 'number' ? String(stored) : ''
  isHydrating = false
  // The backend resumes the persisted AIS radio on startup, so the database —
  // not the store's localStorage cache — is the truth about what is decoding.
  await radio.value?.decoders.refresh('ais')
})
</script>
