<template>
  <SdrRadioSelect
    v-model="selectedRadioValue"
    accessible-name="APRS decode SDR"
    off-label="Not set — APRS decode off"
    decode-name="APRS decode"
  />
</template>

<script setup lang="ts">
/**
 * Picks which SDR radio decodes APRS for the LAND domain.
 *
 * The twin of AIR's Off Grid SDR control (`AdsbSdrSourceControl`): LAND has no
 * receiver of its own, so until a radio is named here nothing feeds the APRS
 * station map — which is why the map's APRS layer button stays disabled until
 * this is set (see `LandView`/`LandSideMenu`).
 *
 * Radios come from the list already configured in Settings → SDR (the shared
 * `SdrRadioSelect`), so there is nothing to type. Choosing one starts
 * background APRS decode on it via the
 * store's start/stop endpoints — the same calls the SDR panel's APRS button
 * makes, and the same single backend bridge, so the two can never disagree
 * about which radio is decoding. The choice is *staged* like the panel's other
 * settings and runs on APPLY CHANGES, so the button reports what the operator
 * just did instead of "NO CHANGES".
 *
 * The backend's APRS bridge owns the radio's frequency: it tunes the chosen
 * receiver to the APRS channel (Settings › LAND › APRS Channel, 144.800 MHz by
 * default) and pulls it back if a viewer or satellite auto-tune moves it off,
 * so nothing needs retuning by hand here.
 */
import { onMounted, ref, watch } from 'vue'
import SdrRadioSelect from './SdrRadioSelect.vue'
import { useSdrStore } from '@/stores/sdr'

const sdrStore = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const selectedRadioValue = ref('')
/**
 * True while the control writes the persisted choice into the dropdown, so the
 * model watcher can tell hydration apart from an operator's pick and not stage
 * a "change" that only restated what the backend already had.
 */
let isHydrating = false

/** Mirror the backend's persisted APRS radio into the dropdown. */
function readSelection(): void {
  const radioId = sdrStore.aprsRadioId
  isHydrating = true
  selectedRadioValue.value = radioId === null ? '' : String(radioId)
  isHydrating = false
}

/**
 * Stage the chosen receiver. Runs on APPLY CHANGES, which reloads the panel —
 * so the store's flags are set here as well, keeping the SDR panel's APRS
 * button honest in the moment between the call landing and the reload.
 *
 * Throws on a refusal so the panel reports ERROR rather than SAVED: a radio
 * that could not be started is not a saved setting.
 */
function stageSelection(nextValue: string): void {
  emit('stage', async () => {
    const previousRadioId = sdrStore.aprsRadioId
    if (!nextValue) {
      // Clearing the choice stops decode. Nothing to stop if it was never set.
      if (previousRadioId === null) return
      const stopped = await sdrStore.stopAprs(previousRadioId)
      sdrStore.setAprsEnabled(false)
      if (!stopped) throw new Error('APRS decode could not be stopped')
      return
    }
    const radioId = Number(nextValue)
    // The backend runs a single APRS bridge, so starting on another radio hands
    // decode over rather than running two — no explicit stop of the old one.
    const started = await sdrStore.startAprs(radioId)
    if (!started) throw new Error('APRS decode could not be started')
    sdrStore.setAprsEnabled(true)
  })
}

// Watched rather than handled on a change event: the dropdown is a listbox, so
// its model is the only signal that the operator picked something.
watch(
  selectedRadioValue,
  (nextValue) => {
    if (isHydrating) return
    stageSelection(nextValue)
  },
  // Synchronous so the `isHydrating` flag still stands when the watcher runs:
  // the default pre-flush would fire after hydration had already cleared it,
  // and the restored choice would be treated as an operator's pick.
  { flush: 'sync' },
)

onMounted(async () => {
  // The backend resumes the persisted APRS radio on startup, so the database —
  // not the store's localStorage cache — is the truth about what is decoding.
  await sdrStore.hydrateAprsFromDb()
  readSelection()
})
</script>
