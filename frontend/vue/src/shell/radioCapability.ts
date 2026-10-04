/**
 * The `radio` capability — what other sections may ask of the SDR
 * (docs/plans/section-containers.md §3.6, F6). Provided by the sdr section
 * (`components/sdr/radioCapability.ts`); read through `getCapability('radio')`
 * or the `useRadio()` composable.
 *
 * It replaces the `sentinel:sdr-tune-external` / `sentinel:sdr-tune-restore`
 * document events and the Air/Sea/Land filters' direct `stores/sdr` reads.
 */

/** Ask the SDR to tune — a filter's TUNE button, or a satellite pass at AOS. */
export interface RadioTuneRequest {
  /** Target frequency in Hz. A falsy value is ignored. */
  hz: number
  /** Demodulator mode, e.g. 'NFM'; an unknown value falls back to the SDR's default. */
  mode?: string
  /** Who is asking, e.g. 'auto-tune' for the pass scheduler. Informational. */
  source?: string
  /** The name shown in the SDR's notifications (a satellite, port channel, repeater…). */
  satName?: string
  /** NORAD id of the satellite, so the AUTO-TUNED alert links back to it. */
  noradId?: string
  /** Ties a tune to its later `restore`, so a stale restore from an older pass is ignored. */
  token?: string
  /** Start a recording for the duration of the tune (until its `restore`). */
  record?: boolean
  /** Switch digital decode on/off with the tune; omitted = leave as is. */
  digital?: boolean
}

/** Undo an earlier tune — a satellite pass at LOS. */
export interface RadioRestoreRequest {
  source?: string
  satName?: string
  noradId?: string
  /** Must match the tune's token, or the restore is ignored. */
  token?: string
}

/** A frequency to file in the SDR's Frequency Manager. */
export interface RadioFrequencyToSave {
  label: string
  frequency_hz: number
  mode: string
  notes?: string
  group_ids?: number[]
}

/** The Frequency Manager, as other sections may use it. */
export interface RadioFrequencies {
  /** Load the stored list if it has not been loaded yet. */
  ensureLoaded(): void
  /** Whether a stored frequency sits at exactly this Hz. Reactive. */
  has(frequencyHz: number): boolean
  /** Store a frequency. Rejects on a failed request. */
  save(frequency: RadioFrequencyToSave): Promise<void>
  /** Remove every stored frequency at exactly this Hz. Rejects on a failed request. */
  remove(frequencyHz: number): Promise<void>
  /** The id of the group with this name, creating it first if needed. */
  ensureGroup(name: string): Promise<number>
}

export interface RadioCapability {
  /** True while an SDR is connected. Reactive. */
  readonly connected: boolean
  tune(request: RadioTuneRequest): void
  restore(request: RadioRestoreRequest): void
  frequencies: RadioFrequencies
}
