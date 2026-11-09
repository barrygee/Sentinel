/**
 * The saved-frequency editor's state, shared by the FREQUENCY MANAGER tab
 * (which owns the state, validates and saves it) and SdrFrequencyForm (which
 * edits it).
 */

/**
 * A saved frequency as the form edits it. Numeric fields are the strings the
 * inputs hold and are parsed on save; `gainAuto` stands for AGC (stored as
 * gain -1), and `sampleRateHz` is one of the sample-rate picker's values.
 */
export interface FrequencyEditorState {
  label: string
  frequencyMhz: string
  mode: string
  groupIds: number[]
  notes: string
  gainDb: string
  gainAuto: boolean
  bandwidthKhz: string
  squelchDbfs: string
  volumePercent: string
  sampleRateHz: number
  zoom: string
  waterfallMinDb: string
  waterfallMaxDb: string
}

/** Per-field validation messages; a field without one is valid. */
export interface FrequencyEditorErrors {
  label?: string | undefined
  freq?: string | undefined
  mode?: string | undefined
  notes?: string | undefined
}
