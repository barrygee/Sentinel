import { describe, it, expect } from 'vitest'
import {
  SIGNAL_THRESHOLD_DB,
  estimateNoiseFloorDb,
  findSignalEdges,
  findTimeExtent,
} from './useSdrSignalMarker'

describe('estimateNoiseFloorDb', () => {
  it('returns -Infinity for an empty bin array', () => {
    expect(estimateNoiseFloorDb([])).toBe(-Infinity)
  })

  it('returns the single value for a one-bin array', () => {
    expect(estimateNoiseFloorDb([-42])).toBe(-42)
  })

  it('returns the middle value for an odd-length array, order-independent', () => {
    expect(estimateNoiseFloorDb([-90, -70, -80])).toBe(-80)
  })

  it('averages the two middle values for an even-length array', () => {
    // sorted: -90, -80, -70, -60 -> mid values -80, -70 -> avg -75
    expect(estimateNoiseFloorDb([-60, -90, -70, -80])).toBe(-75)
  })

  it('is robust to a handful of strong-signal bins skewing a mean', () => {
    // Mostly noise around -90 with two big spikes; median stays near the noise
    // floor where a mean would be dragged upward by the spikes (a mean here
    // would be well above -50, nowhere near the true noise floor).
    const bins = [-90, -91, -89, -90, -92, 10, 12]
    expect(estimateNoiseFloorDb(bins)).toBe(-90)
  })
})

describe('findSignalEdges', () => {
  const THRESHOLD = SIGNAL_THRESHOLD_DB

  it('returns null for an empty bins array (cursor out of range)', () => {
    expect(findSignalEdges([], 0)).toBeNull()
  })

  it('returns null when cursorBin is negative', () => {
    expect(findSignalEdges([-90, -90, -90], -1)).toBeNull()
  })

  it('returns null when cursorBin is at/after the array length', () => {
    const bins = [-90, -90, -90]
    expect(findSignalEdges(bins, 3)).toBeNull()
  })

  it('returns null when the cursor bin does not clear the noise floor threshold', () => {
    // Flat/no-signal row: noise floor == every bin, so cursor never clears +8dB.
    const bins = [-90, -90, -90, -90, -90]
    expect(findSignalEdges(bins, 2)).toBeNull()
  })

  it('detects a signal centred exactly on a single strong bin', () => {
    const bins = [-90, -90, -20, -90, -90]
    const result = findSignalEdges(bins, 2)
    expect(result).toEqual({ loBin: 2, hiBin: 2, peakBin: 2, peakDb: -20 })
  })

  it('walks outward to find the full contiguous run around the cursor', () => {
    const bins = [-90, -90, -30, -25, -28, -90, -90]
    const result = findSignalEdges(bins, 3)
    expect(result).toEqual({ loBin: 2, hiBin: 4, peakBin: 3, peakDb: -25 })
  })

  it('clamps the low edge at bin 0 when the signal touches the start of the row', () => {
    // 4 noise bins keep the median (noise floor) at -90 regardless of the
    // 3-bin signal block at the start, so the signal itself doesn't skew the
    // very threshold used to detect it.
    const bins = [-20, -22, -25, -90, -90, -90, -90]
    const result = findSignalEdges(bins, 0)
    expect(result).toEqual({ loBin: 0, hiBin: 2, peakBin: 0, peakDb: -20 })
  })

  it('clamps the high edge at the last bin when the signal touches the end of the row', () => {
    const bins = [-90, -90, -90, -90, -25, -22, -20]
    const result = findSignalEdges(bins, 6)
    expect(result).toEqual({ loBin: 4, hiBin: 6, peakBin: 6, peakDb: -20 })
  })

  it('a signal spanning the entire row clamps both edges', () => {
    // Every bin sits exactly at the noise floor: with thresholdDb = 0 the
    // cutoff equals the floor itself, so every bin clears it (>=) and the
    // walk clamps at both array boundaries rather than stopping partway.
    const bins = [-50, -50, -50, -50, -50]
    const result = findSignalEdges(bins, 2, 0)
    expect(result).toEqual({ loBin: 0, hiBin: 4, peakBin: 0, peakDb: -50 })
  })

  it('picks only the signal under the cursor when two disjoint signals are present', () => {
    // Two separate spikes far apart; cursor sits under the second one only.
    const bins = [-90, -20, -90, -90, -90, -22, -90]
    const result = findSignalEdges(bins, 5)
    expect(result).toEqual({ loBin: 5, hiBin: 5, peakBin: 5, peakDb: -22 })
  })

  it('respects a custom thresholdDb, excluding a bin that clears only the default', () => {
    // Noise floor is -90 (median). A bin at -85 clears the default 8dB
    // threshold's neighbor test only weakly — use a stricter custom threshold
    // so a modest bump no longer counts as "signal".
    const bins = [-90, -90, -85, -90, -90]
    // Default threshold (8dB): cutoff = -90 + 8 = -82; -85 < -82 -> no signal.
    expect(findSignalEdges(bins, 2, THRESHOLD)).toBeNull()
    // Looser custom threshold (4dB): cutoff = -86; -85 >= -86 -> signal found.
    expect(findSignalEdges(bins, 2, 4)).toEqual({
      loBin: 2,
      hiBin: 2,
      peakBin: 2,
      peakDb: -85,
    })
  })
})

describe('findTimeExtent', () => {
  const FLAT_ROW = [-90, -90, -90, -90, -90]
  const SIGNAL_ROW = [-90, -90, -20, -90, -90]

  it('returns null for an empty row-history array', () => {
    expect(findTimeExtent([], 2, 2, 0)).toBeNull()
  })

  it('returns null when cursorRowIndex is negative', () => {
    expect(findTimeExtent([SIGNAL_ROW], 2, 2, -1)).toBeNull()
  })

  it('returns null when cursorRowIndex is at/after the array length', () => {
    expect(findTimeExtent([SIGNAL_ROW], 2, 2, 1)).toBeNull()
  })

  it('returns null when the cursor row itself does not contain the signal', () => {
    // The signal has scrolled past this row (row 0 is a flat/noise-only row).
    const rows = [FLAT_ROW, SIGNAL_ROW]
    expect(findTimeExtent(rows, 2, 2, 0)).toBeNull()
  })

  it('returns a single-row extent (a one-row blip) when neighbours lack the signal', () => {
    const rows = [FLAT_ROW, SIGNAL_ROW, FLAT_ROW]
    const result = findTimeExtent(rows, 2, 2, 1)
    expect(result).toEqual({ newestRowIndex: 1, oldestRowIndex: 1 })
  })

  it('extends the newest/oldest indices while every row keeps clearing its own threshold', () => {
    const rows = [SIGNAL_ROW, SIGNAL_ROW, SIGNAL_ROW, FLAT_ROW]
    const result = findTimeExtent(rows, 2, 2, 1)
    expect(result).toEqual({ newestRowIndex: 0, oldestRowIndex: 2 })
  })

  it('bounds the extent by the array length when the signal fills every retained row', () => {
    const rows = [SIGNAL_ROW, SIGNAL_ROW, SIGNAL_ROW]
    const result = findTimeExtent(rows, 2, 2, 1)
    expect(result).toEqual({ newestRowIndex: 0, oldestRowIndex: 2 })
  })

  it('treats a missing row as not containing the signal, stopping the walk', () => {
    // Simulates a stale/missing row entry (e.g. history not yet backfilled).
    const rows: (number[] | undefined)[] = [undefined, SIGNAL_ROW]
    const result = findTimeExtent(rows as ArrayLike<number>[], 2, 2, 1)
    expect(result).toEqual({ newestRowIndex: 1, oldestRowIndex: 1 })
  })

  it('respects a custom thresholdDb when walking neighbouring rows', () => {
    const modestRow = [-90, -90, -85, -90, -90]
    const rows = [modestRow, modestRow, modestRow]
    // Default threshold excludes the modest bump entirely from the row.
    expect(findTimeExtent(rows, 2, 2, 1)).toBeNull()
    // A looser threshold picks it up, and extends across the matching neighbours.
    const result = findTimeExtent(rows, 2, 2, 1, 4)
    expect(result).toEqual({ newestRowIndex: 0, oldestRowIndex: 2 })
  })
})
