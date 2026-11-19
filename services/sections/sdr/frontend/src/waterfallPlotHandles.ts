/**
 * The waterfall's two sigplot plots and the frequency scale of its current
 * layers, in one plain object every waterfall composable shares.
 *
 * Deliberately NON-reactive: sigplot mutates the Plot object heavily, and
 * wrapping it in Vue reactivity breaks it and tanks performance.
 * `useWaterfallPlots` creates the plots and rewrites the scale on every retune;
 * the interaction composables read them through getters when an event arrives.
 */
import type { Plot } from 'sigplot'

/** The shared plot handles. */
export interface WaterfallPlotHandles {
  spectrum: Plot | null
  waterfall: Plot | null
  /** Frequency (Hz) of the first FFT bin of the current layers. */
  firstBinHz: number
  /** Hz per FFT bin of the current layers. */
  hzPerBin: number
}

/** Empty handles: no plots yet, a unit scale. */
export function createWaterfallPlotHandles(): WaterfallPlotHandles {
  return { spectrum: null, waterfall: null, firstBinHz: 0, hzPerBin: 1 }
}
