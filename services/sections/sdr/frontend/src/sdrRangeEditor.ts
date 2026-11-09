/**
 * The search-range editor's state and its defaults, shared by the SEARCH RANGES
 * tab (which owns the state and saves it) and SdrRangeForm (which edits it).
 */
import type { SdrSearchRange } from './services/sdrSearchApi'

/** Demodulation modes a search range can sweep with. */
export const SEARCH_MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW']

/**
 * A search range as the form edits it. Numbers are kept as the strings the
 * inputs hold and parsed on save, so a half-typed value never jumps around.
 */
export interface RangeEditorState {
  id: number | null
  label: string
  low_mhz: string
  high_mhz: string
  step_khz: string
  mode: string
  threshold_dbfs: string
  dwell_ms: string
  notes: string
}

/** The editor state for a new range. */
export function blankRangeEditor(): RangeEditorState {
  return {
    id: null,
    label: '',
    low_mhz: '',
    high_mhz: '',
    step_khz: '12.5',
    mode: 'NFM',
    threshold_dbfs: '-70',
    dwell_ms: '200',
    notes: '',
  }
}

/** The editor state for an existing range, converted to the form's units (MHz, kHz). */
export function rangeEditorFromRange(range: SdrSearchRange): RangeEditorState {
  return {
    id: range.id,
    label: range.label,
    low_mhz: (range.low_hz / 1e6).toString(),
    high_mhz: (range.high_hz / 1e6).toString(),
    step_khz: (range.step_hz / 1000).toString(),
    mode: range.mode,
    threshold_dbfs: range.threshold_dbfs.toString(),
    dwell_ms: range.dwell_ms.toString(),
    notes: range.notes,
  }
}
