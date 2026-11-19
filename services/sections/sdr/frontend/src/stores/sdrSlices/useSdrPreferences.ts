import { ref, type Ref } from 'vue'
import { usePersistedFlag, usePersistedWholeNumber } from './persistedSetting'

/** What the auto-centre toggle needs from the tuning slice. */
interface TuningAccess {
  tuningOffsetHz: Ref<number>
  currentFreqHz: Ref<number>
  requestTune: (hz: number, center?: boolean) => void
}

// How often the waterfall's time markers are drawn, in seconds — SDR#'s
// time-marker interval (it defaults to 10 s). Clamped to at least 1 s: a 0 s
// interval would mark every single raster row.
const WATERFALL_TIMESTAMP_INTERVAL_DEFAULT_SEC = 5
const WATERFALL_TIMESTAMP_INTERVAL_MIN_SEC = 1

const RECORDING_MAX_DURATION_DEFAULT_MINUTES = 360

/**
 * The SDR store's preferences slice: the waterfall and tuning options edited
 * from Settings → SDR, the scan/search resume delay, the recording options and
 * the waterfall view sliders. Each persisted option follows the
 * {@link usePersistedFlag} pattern (localStorage cache, DB hydrate).
 */
export function useSdrPreferences(tuning: TuningAccess) {
  // Auto-centre toggle (user preference; lives in the `sdr` settings namespace,
  // edited from Settings → SDR → WATERFALL). localStorage is a fast-path cache
  // so the very first click after load behaves correctly before the async
  // settings fetch resolves; SdrAutoCenterControl reconciles it with the DB.
  //  ON  → clicking the spectrum/waterfall retunes the hardware so the clicked
  //        freq becomes the new span centre (display recenters).
  //  OFF → clicking moves the demod target (tuning bar) to the clicked freq
  //        WITHOUT retuning the hardware; the display stays put and the audio
  //        follows via an NCO offset (see useSdrAudio.setOffsetHz).
  // Turning it ON while the demod sits off-centre retunes the hardware to the
  // current demod freq so the display recenters on it and the NCO offset clears
  // (otherwise the bar would stay off-centre with a stale offset). The DB
  // hydrate re-reads it when the config JSON editor (Settings → App Settings →
  // Application Config) uploads a new config, so the running SDR UI follows the
  // edit without a reload.
  const autoCenter = usePersistedFlag({
    storageKey: 'sdrAutoCenterWaterfallOnTune',
    defaultValue: true,
    settingKey: 'autoCenterWaterfallOnTune',
    afterSet: (on) => {
      if (on && tuning.tuningOffsetHz.value !== 0) {
        tuning.tuningOffsetHz.value = 0
        tuning.requestTune(tuning.currentFreqHz.value)
      }
    },
  })

  // Snap-to-known-frequency toggle. When ON, clicking a known-frequency marker in
  // the spectrum jumps to it, and dragging the tuner bar snaps to a nearby known
  // frequency. Default ON.
  const snapToKnown = usePersistedFlag({
    storageKey: 'sdrSnapToKnown',
    defaultValue: true,
    settingKey: 'snapToKnown',
  })

  // Waterfall overlay visibility toggles (bandplan strip and known-frequency
  // labels). Default ON.
  const displayBandPlan = usePersistedFlag({
    storageKey: 'sdrShowBandPlan',
    defaultValue: true,
    settingKey: 'displayBandPlan',
  })
  const displayKnownFrequencies = usePersistedFlag({
    storageKey: 'sdrShowKnownFreqs',
    defaultValue: true,
    settingKey: 'displayKnownFrequencies',
  })

  // Waterfall time markers — clock labels down the left edge of the raster,
  // the equivalent of SDR#'s "Use Time Markers" waterfall option. Default ON.
  const displayWaterfallTimestamps = usePersistedFlag({
    storageKey: 'sdrShowWaterfallTimestamps',
    defaultValue: true,
    settingKey: 'displayWaterfallTimestamps',
  })
  const waterfallTimestampInterval = usePersistedWholeNumber({
    storageKey: 'sdrWaterfallTimestampIntervalSec',
    settingKey: 'waterfallTimestampIntervalSec',
    minimum: WATERFALL_TIMESTAMP_INTERVAL_MIN_SEC,
    defaultValue: WATERFALL_TIMESTAMP_INTERVAL_DEFAULT_SEC,
  })

  // Resume delay (seconds) for scan + search auto-resume. When the radio locks
  // on a signal during scan/search, it waits until the signal drops below its
  // threshold AND this many seconds have elapsed before continuing. 0 → resume
  // immediately on drop.
  const resumeDelay = usePersistedWholeNumber({
    storageKey: 'sdrResumeDelaySec',
    settingKey: 'resumeDelaySec',
    minimum: 0,
    defaultValue: 0,
  })

  // Longest a recording may run, in minutes, before the backend treats it as
  // abandoned (its browser never sent stop): the SDR section marks it failed and
  // the radio hub stops its raw-IQ capture. Only the backend acts on it, so it
  // has no localStorage cache — the Settings control hydrates it from the DB.
  const recordingMaxDuration = usePersistedWholeNumber({
    storageKey: null,
    settingKey: 'recordingMaxDurationMinutes',
    minimum: 1,
    defaultValue: RECORDING_MAX_DURATION_DEFAULT_MINUTES,
  })

  // Whether a recording also captures the radio's raw IQ (`<id>.u8`) on the
  // server. Read only by the backend when a recording starts, so unlike the
  // display options above there is no localStorage cache: the Settings box
  // adopts the stored value when it opens.
  const recordRawIq = ref<boolean>(false)
  function setRecordRawIq(on: boolean) {
    recordRawIq.value = on
  }

  // Waterfall view settings (Zoom / Max / Min sliders in SdrWaterfall). These
  // live in the store — not as plain local refs in the component — so they
  // survive the component being torn down and rebuilt when the user navigates
  // away from the SDR section and back. SdrWaterfall seeds its local working
  // copies from these on mount and writes back on every slider change. zmin/
  // zmax of 0/0 means "unset" (use the device default range); autoScale true
  // means the Min/Max sliders haven't been touched. Persisted in localStorage
  // (like the SDR toggle preferences above) so they also survive a full page
  // reload / tab close, not just in-app navigation.
  function readCachedNumber(key: string, fallback: number): number {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback
      const parsed = parseFloat(raw)
      return isFinite(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }
  const viewZoom = ref(readCachedNumber('sdrViewZoom', 1))
  const viewZmin = ref(readCachedNumber('sdrViewZmin', 0))
  const viewZmax = ref(readCachedNumber('sdrViewZmax', 0))
  const viewAutoScale = ref<boolean>(
    (() => {
      try {
        return localStorage.getItem('sdrViewAutoScale') !== '0'
      } catch {
        return true
      }
    })(),
  )
  function setViewSettings(viewSettings: {
    zoom?: number
    zmin?: number
    zmax?: number
    autoScale?: boolean
  }) {
    if (viewSettings.zoom !== undefined) viewZoom.value = viewSettings.zoom
    if (viewSettings.zmin !== undefined) viewZmin.value = viewSettings.zmin
    if (viewSettings.zmax !== undefined) viewZmax.value = viewSettings.zmax
    if (viewSettings.autoScale !== undefined) viewAutoScale.value = viewSettings.autoScale
    try {
      localStorage.setItem('sdrViewZoom', String(viewZoom.value))
      localStorage.setItem('sdrViewZmin', String(viewZmin.value))
      localStorage.setItem('sdrViewZmax', String(viewZmax.value))
      localStorage.setItem('sdrViewAutoScale', viewAutoScale.value ? '1' : '0')
    } catch {}
  }

  return {
    autoCenterWaterfallOnTune: autoCenter.value,
    setAutoCenterWaterfallOnTune: autoCenter.set,
    hydrateAutoCenterFromDb: autoCenter.hydrateFromDb,
    snapToKnown: snapToKnown.value,
    setSnapToKnown: snapToKnown.set,
    hydrateSnapToKnownFromDb: snapToKnown.hydrateFromDb,
    displayBandPlan: displayBandPlan.value,
    setDisplayBandPlan: displayBandPlan.set,
    hydrateDisplayBandPlanFromDb: displayBandPlan.hydrateFromDb,
    displayKnownFrequencies: displayKnownFrequencies.value,
    setDisplayKnownFrequencies: displayKnownFrequencies.set,
    hydrateDisplayKnownFrequenciesFromDb: displayKnownFrequencies.hydrateFromDb,
    displayWaterfallTimestamps: displayWaterfallTimestamps.value,
    setDisplayWaterfallTimestamps: displayWaterfallTimestamps.set,
    hydrateDisplayWaterfallTimestampsFromDb: displayWaterfallTimestamps.hydrateFromDb,
    waterfallTimestampIntervalSec: waterfallTimestampInterval.value,
    setWaterfallTimestampIntervalSec: waterfallTimestampInterval.set,
    hydrateWaterfallTimestampIntervalFromDb: waterfallTimestampInterval.hydrateFromDb,
    resumeDelaySec: resumeDelay.value,
    setResumeDelaySec: resumeDelay.set,
    hydrateResumeDelaySecFromDb: resumeDelay.hydrateFromDb,
    recordingMaxDurationMinutes: recordingMaxDuration.value,
    setRecordingMaxDurationMinutes: recordingMaxDuration.set,
    hydrateRecordingMaxDurationFromDb: recordingMaxDuration.hydrateFromDb,
    recordRawIq,
    setRecordRawIq,
    viewZoom,
    viewZmin,
    viewZmax,
    viewAutoScale,
    setViewSettings,
  }
}
