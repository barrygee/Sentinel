import { computed, ref, type Ref } from 'vue'

/** How many segments the SIGNAL meter draws. */
export const SIGNAL_METER_SEGMENTS = 36

/** The lowest power the meter reads, in dBFS; also its resting level. */
const SIGNAL_FLOOR_DBFS = -120

/** Squelch at or below this (dBFS) is treated as off: the meter never mutes for it. */
const SQUELCH_OFF_DBFS = -119

export interface SdrSignalMeterOptions {
  playing: Ref<boolean>
  /** The squelch threshold in dBFS. */
  squelch: Ref<number>
}

/**
 * The SIGNAL meter's state: a smoothed power reading (fast attack, slow decay)
 * turned into a count of lit segments, plus whether the audio is audible, which
 * greys the meter while the squelch holds it shut.
 *
 * `updateSignalBar` is the audio engine's power callback; `resetSignalMeter`
 * drops the meter to rest when the stream stops or the radio goes away.
 */
export function useSdrSignalMeter({ playing, squelch }: SdrSignalMeterOptions) {
  const signalSmoothed = ref(SIGNAL_FLOOR_DBFS)
  const signalLit = ref(0)
  const workletSquelchOpen = ref(true)

  const signalAudible = computed(
    () => playing.value && (squelch.value <= SQUELCH_OFF_DBFS || workletSquelchOpen.value),
  )

  function resetSignalMeter() {
    signalSmoothed.value = SIGNAL_FLOOR_DBFS
    signalLit.value = 0
  }

  function updateSignalBar(dbfs: number, squelchOpen?: boolean) {
    if (squelchOpen !== undefined) workletSquelchOpen.value = squelchOpen
    if (squelchOpen === false) {
      resetSignalMeter()
      return
    }
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    const alpha = dbfs > signalSmoothed.value ? 0.3 : 0.05
    /* v8 ignore stop */
    signalSmoothed.value += alpha * (dbfs - signalSmoothed.value)
    signalLit.value = Math.round(
      Math.max(
        0,
        Math.min(
          SIGNAL_METER_SEGMENTS,
          ((signalSmoothed.value - SIGNAL_FLOOR_DBFS) / -SIGNAL_FLOOR_DBFS) * SIGNAL_METER_SEGMENTS,
        ),
      ),
    )
  }

  return { signalLit, signalAudible, updateSignalBar, resetSignalMeter }
}
