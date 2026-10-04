<template>
  <div
    v-if="indicatorVisible"
    id="footer-sdr"
    class="footer-sdr"
    role="status"
    :aria-label="indicatorAriaLabel"
  >
    <span class="footer-code footer-sdr-freq">{{ freqDisplay }}</span>
    <span v-if="freqName" class="footer-code footer-sdr-name">{{ freqName }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * The footer's "SDR tuned to …" readout, registered by the sdr section with
 * the shell's footer registry (moved out of `AppFooter`), so the footer
 * imports no SDR store. Styled by the global `.footer-sdr` rules.
 */
import { computed } from 'vue'
import { useSdrStore } from '@/stores/sdr'

const props = defineProps<{
  /** The section on screen, e.g. 'sdr'. */
  activeSectionId: string
}>()

const sdrStore = useSdrStore()

// True when the radio is streaming AND parked on a single frequency — i.e.
// tuned to one channel, or locked onto a signal during a scan or search. While
// a scan/search is mid-sweep (hopping between frequencies) the store's scan/
// searchSweeping flags are set, so this stays false until it stops on one.
const parkedOnFreq = computed<boolean>(
  () =>
    sdrStore.playing &&
    !sdrStore.scanSweeping &&
    !sdrStore.searchSweeping &&
    sdrStore.currentFreqHz > 0,
)

// Known label for the tuned frequency, matched against the saved frequency list
// by exact frequency; empty when it isn't a saved one (e.g. a manual tune or an
// arbitrary search step). Only read while the indicator is rendered, where the
// frequency is necessarily active.
const freqName = computed<string>(
  () =>
    sdrStore.frequencies.find((freq) => freq.frequency_hz === sdrStore.currentFreqHz)?.label ?? '',
)

// "145.800 MHz" — matches the radio panel's own tuned-frequency formatting.
const freqDisplay = computed<string>(() => `${(sdrStore.currentFreqHz / 1e6).toFixed(3)} MHz`)

// Hidden only on the SDR section's RADIO tab — that panel already shows the
// tuned frequency, so footer copy would be redundant there. It still shows on
// the SDR section's other tabs (Frequency Manager, Search Ranges, …) and on
// every other section.
const indicatorVisible = computed<boolean>(
  () => parkedOnFreq.value && !(props.activeSectionId === 'sdr' && sdrStore.activeTab === 'radio'),
)

const indicatorAriaLabel = computed<string>(() =>
  freqName.value
    ? `SDR active on ${freqDisplay.value}, ${freqName.value}`
    : `SDR active on ${freqDisplay.value}`,
)
</script>
