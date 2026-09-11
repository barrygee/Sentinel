/**
 * Pure detection maths for the waterfall's signal marker feature: given the
 * current row of FFT bins and the row history the waterfall already retains,
 * find the frequency extent of the signal under the cursor and how far back
 * (in rows) it has been continuously present. No Vue state here — kept pure
 * so it is trivially unit-testable to the 100% coverage gate.
 */

/** dB above the row's own noise floor a bin must clear to count as "signal". */
export const SIGNAL_THRESHOLD_DB = 8

export interface SignalEdges {
  loBin: number
  hiBin: number
  peakBin: number
  peakDb: number
}

export interface SignalTimeExtent {
  /** Index (newest-first) of the most recent row still containing the signal. */
  newestRowIndex: number
  /** Index (newest-first) of the oldest contiguous row containing the signal. */
  oldestRowIndex: number
}

/**
 * Median of a row's bins, used as a per-row noise-floor estimate — robust to
 * the handful of bins a strong signal occupies, unlike a mean.
 */
export function estimateNoiseFloorDb(bins: ArrayLike<number>): number {
  const sorted = Array.from(bins).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return -Infinity
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number)
}

/**
 * Finds the contiguous run of bins around `cursorBin` that clears the row's
 * noise floor by `thresholdDb`. Returns `null` when the cursor bin itself is
 * below threshold (no signal under the cursor).
 */
export function findSignalEdges(
  bins: ArrayLike<number>,
  cursorBin: number,
  thresholdDb: number = SIGNAL_THRESHOLD_DB,
): SignalEdges | null {
  if (cursorBin < 0 || cursorBin >= bins.length) return null
  const cutoffDb = estimateNoiseFloorDb(bins) + thresholdDb
  if ((bins[cursorBin] as number) < cutoffDb) return null

  let loBin = cursorBin
  while (loBin > 0 && (bins[loBin - 1] as number) >= cutoffDb) loBin--
  let hiBin = cursorBin
  while (hiBin < bins.length - 1 && (bins[hiBin + 1] as number) >= cutoffDb) hiBin++

  let peakBin = cursorBin
  let peakDb = -Infinity
  for (let bin = loBin; bin <= hiBin; bin++) {
    const value = bins[bin] as number
    if (value > peakDb) {
      peakDb = value
      peakBin = bin
    }
  }
  return { loBin, hiBin, peakBin, peakDb }
}

/**
 * Walks the retained row history outward from `cursorRowIndex` (newest-first)
 * while the bin range `[loBin, hiBin]` keeps clearing each row's own noise
 * floor, returning the contiguous run's newest/oldest row indices. Returns
 * `null` when the cursor row itself doesn't contain the signal (e.g. it has
 * already scrolled past this row, or the row is stale/missing).
 */
export function findTimeExtent(
  rowBins: ArrayLike<number>[],
  loBin: number,
  hiBin: number,
  cursorRowIndex: number,
  thresholdDb: number = SIGNAL_THRESHOLD_DB,
): SignalTimeExtent | null {
  function rowContainsSignal(rowIndex: number): boolean {
    const row = rowBins[rowIndex]
    if (!row) return false
    const cutoffDb = estimateNoiseFloorDb(row) + thresholdDb
    for (let bin = loBin; bin <= hiBin; bin++) {
      if ((row[bin] as number) >= cutoffDb) return true
    }
    return false
  }

  if (cursorRowIndex < 0 || cursorRowIndex >= rowBins.length) return null
  if (!rowContainsSignal(cursorRowIndex)) return null

  let newestRowIndex = cursorRowIndex
  while (newestRowIndex > 0 && rowContainsSignal(newestRowIndex - 1)) newestRowIndex--
  let oldestRowIndex = cursorRowIndex
  while (oldestRowIndex < rowBins.length - 1 && rowContainsSignal(oldestRowIndex + 1))
    oldestRowIndex++

  return { newestRowIndex, oldestRowIndex }
}
