import { ref, shallowRef } from 'vue'
import type { SdrSpectrumFrame } from './sdrTypes'

/**
 * The SDR store's spectrum slice: the latest spectrum frame and what the
 * waterfall overlays while a search sweeps or the scanner steps.
 */
export function useSdrSpectrumOverlay() {
  // Latest spectrum frame from the control WebSocket. Non-persisted; held as a
  // single ref (the bins array is NOT deep-tracked — consumers read it
  // imperatively in their render/push loop). See SdrWaterfall.vue.
  // shallowRef: a fresh frame (with a 1024-number array) arrives ~12x/sec.
  // A deep `ref` would proxy that array every frame; shallowRef makes the
  // assignment O(1) while the watch still fires on identity change.
  const lastSpectrum = shallowRef<SdrSpectrumFrame | null>(null)

  function setSpectrum(frame: SdrSpectrumFrame) {
    lastSpectrum.value = frame
  }

  /**
   * Whether the operator has paused the spectrum and waterfall.
   *
   * Display only — the IQ stream, tuning and audio are untouched. It exists
   * because rendering competes for the main thread with the ScriptProcessor
   * audio fallback, which is what plays on any page that cannot use an
   * AudioWorklet (most devices, since Sentinel is normally reached over plain
   * HTTP at a LAN address). Freeing the thread is the difference between
   * choppy audio and clean audio on a phone.
   */
  const displayPaused = ref(false)
  // True only while a range search is actively stepping (sweeping). The
  // waterfall reads this to freeze rendering while the centre frequency is
  // jumping every dwell_ms — painting those frames produces meaningless noise.
  const searchSweeping = ref(false)
  // Range bounds + current step for the search overlay shown by SdrWaterfall.
  // Panel writes these as the sweep advances; null when not searching.
  const searchLowHz = ref<number | null>(null)
  const searchHighHz = ref<number | null>(null)
  const searchCurrentHz = ref<number | null>(null)
  // The saved range's name while searching one, shown as a chip under the
  // overlay headline; null for a typed-in (ad-hoc) range, which shows no chip.
  // The owner publishes it with its sweep state, so a read-only follower
  // mirrors it.
  const searchLabel = ref<string | null>(null)

  // True while the scanner is actively stepping between saved frequencies and
  // has not yet locked on an active signal. Drives the same paused/holding
  // overlay used during search sweeps. Group names label which groups are in
  // the scan queue (or a single "All" entry when every scannable freq is in).
  const scanSweeping = ref(false)
  const scanGroupNames = ref<string[]>([])

  return {
    lastSpectrum,
    setSpectrum,
    displayPaused,
    searchSweeping,
    searchLowHz,
    searchHighHz,
    searchCurrentHz,
    searchLabel,
    scanSweeping,
    scanGroupNames,
  }
}
