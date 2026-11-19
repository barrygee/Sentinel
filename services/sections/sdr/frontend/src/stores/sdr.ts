import { defineStore } from 'pinia'
import { useSdrBackgroundDecoders } from './sdrSlices/useSdrBackgroundDecoders'
import { useSdrDecodeFeed } from './sdrSlices/useSdrDecodeFeed'
import { useSdrFrequencyLibrary } from './sdrSlices/useSdrFrequencyLibrary'
import { useSdrPreferences } from './sdrSlices/useSdrPreferences'
import { useSdrSpectrumOverlay } from './sdrSlices/useSdrSpectrumOverlay'
import { useSdrTuningSession } from './sdrSlices/useSdrTuningSession'

export type {
  DecodeEvent,
  SdrFrequencyGroup,
  SdrMode,
  SdrRadio,
  SdrSpectrumFrame,
  SdrStoredFrequency,
  SdrTab,
} from './sdrSlices/sdrTypes'

/**
 * The SDR section's one store. It is composed from focused slices under
 * `sdrSlices/` — tuning session, preferences, frequency library, background
 * decoders, decode feed and spectrum overlay — each a setup function returning
 * its own refs and actions; the store spreads them into one flat API, so
 * callers read `useSdrStore().<member>` whichever slice owns it.
 */
export const useSdrStore = defineStore('sdr', () => {
  const tuningSession = useSdrTuningSession()
  const preferences = useSdrPreferences(tuningSession)
  const frequencyLibrary = useSdrFrequencyLibrary()
  const backgroundDecoders = useSdrBackgroundDecoders(tuningSession.radios)
  const decodeFeed = useSdrDecodeFeed(backgroundDecoders.aprsEnabled)
  const spectrumOverlay = useSdrSpectrumOverlay()

  return {
    ...tuningSession,
    ...preferences,
    ...frequencyLibrary,
    ...backgroundDecoders,
    ...decodeFeed,
    ...spectrumOverlay,
  }
})
