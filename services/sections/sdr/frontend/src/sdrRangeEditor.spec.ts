import { describe, it, expect } from 'vitest'
import { blankRangeEditor, rangeEditorFromRange } from './sdrRangeEditor'
import type { SdrSearchRange } from './services/sdrSearchApi'

describe('blankRangeEditor', () => {
  it('starts a new range with empty text and the sweep defaults', () => {
    expect(blankRangeEditor()).toEqual({
      id: null,
      label: '',
      low_mhz: '',
      high_mhz: '',
      step_khz: '12.5',
      mode: 'NFM',
      threshold_dbfs: '-70',
      dwell_ms: '200',
      notes: '',
    })
  })

  it('returns a fresh object each call, so one form’s edits never leak into the next', () => {
    const first = blankRangeEditor()
    first.label = 'edited'
    expect(blankRangeEditor().label).toBe('')
    expect(blankRangeEditor()).not.toBe(blankRangeEditor())
  })
})

describe('rangeEditorFromRange', () => {
  const range: SdrSearchRange = {
    id: 7,
    label: 'Air Band',
    low_hz: 118_000_000,
    high_hz: 136_975_000,
    step_hz: 8_330,
    mode: 'AM',
    threshold_dbfs: -65,
    dwell_ms: 350,
    band_name: 'VHF',
    enabled: true,
    notes: 'busy',
    sort_order: 3,
  }

  it('converts a stored range to the form’s units as strings', () => {
    expect(rangeEditorFromRange(range)).toEqual({
      id: 7,
      label: 'Air Band',
      low_mhz: '118',
      high_mhz: '136.975',
      step_khz: '8.33',
      mode: 'AM',
      threshold_dbfs: '-65',
      dwell_ms: '350',
      notes: 'busy',
    })
  })

  it('keeps zero values instead of blanking them', () => {
    const editor = rangeEditorFromRange({ ...range, threshold_dbfs: 0, notes: '' })
    expect(editor.threshold_dbfs).toBe('0')
    expect(editor.notes).toBe('')
  })
})
