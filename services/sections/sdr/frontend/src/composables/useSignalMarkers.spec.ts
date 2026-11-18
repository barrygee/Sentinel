import { describe, expect, it } from 'vitest'
import { reactive, ref, type Ref } from 'vue'
import {
  WF_SECOND_TICK_LIMIT,
  WF_TIME_LABEL_HALF_HEIGHT_PX,
  WF_TIME_MARKER_LIMIT,
  useSignalMarkers,
  type DetectedSignalMarker,
  type SignalMarkers,
} from './useSignalMarkers'

// Geometry used throughout: the raster element sits at (RECT_LEFT, RECT_TOP);
// its data box starts INSET_LEFT_PX in and DATA_TOP_PX down, is DATA_WIDTH_PX
// wide, and holds ROW_CAPACITY rows ROW_HEIGHT_PX tall. The span is 1000 Hz
// across the data box — 1 px per Hz — and each row has BIN_COUNT bins of
// HZ_PER_BIN, so bin N sits at clientX = binClientX(N).
const RECT_LEFT = 100
const RECT_TOP = 20
const INSET_LEFT_PX = 50
const INSET_RIGHT_PX = 50
const DATA_WIDTH_PX = 1000
const DATA_TOP_PX = 10
const ROW_CAPACITY = 100
const ROW_HEIGHT_PX = 10
const SPAN_START_HZ = 1000
const SPAN_END_HZ = 2000
const HZ_PER_BIN = 10
const BIN_COUNT = 100

// A whole multiple of 10 s, so interval buckets start on round times.
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

const NOISE_DB = -100
const SIGNAL_DB = -60
// The default test signal occupies bins 40..44 → 1400..1440 Hz.
const SIGNAL_LO_BIN = 40
const SIGNAL_HI_BIN = 44

interface Harness {
  markers: SignalMarkers
  source: {
    displayWaterfallTimestamps: boolean
    waterfallTimestampIntervalSec: number
    playing: boolean
    displayPaused: boolean
  }
  sweeping: Ref<boolean>
  rasterElement: Ref<HTMLElement | null>
  bandInsetLeftPx: Ref<number>
  bandInsetRightPx: Ref<number>
  scale: { firstBinHz: number; hzPerBin: number }
}

function makeRasterElement(): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      left: RECT_LEFT,
      top: RECT_TOP,
      width: INSET_LEFT_PX + DATA_WIDTH_PX + INSET_RIGHT_PX,
      height: 2000,
    }) as DOMRect
  return element
}

function makeHarness(
  options: {
    rowCapacity?: number
    dataHeightPx?: number
    intervalSec?: number
    zoomWindowHz?: (lo: number, hi: number) => { winLo: number; winHi: number }
  } = {},
): Harness {
  const rowCapacity = options.rowCapacity ?? ROW_CAPACITY
  const source = reactive({
    displayWaterfallTimestamps: true,
    waterfallTimestampIntervalSec: options.intervalSec ?? 1,
    playing: true,
    displayPaused: false,
  })
  const sweeping = ref(false)
  const rasterElement = ref<HTMLElement | null>(makeRasterElement())
  const bandInsetLeftPx = ref(INSET_LEFT_PX)
  const bandInsetRightPx = ref(INSET_RIGHT_PX)
  const scale = { firstBinHz: SPAN_START_HZ, hzPerBin: HZ_PER_BIN }
  const markers = useSignalMarkers({
    source,
    sweeping,
    rasterElement,
    bandInsetLeftPx,
    bandInsetRightPx,
    spanStartHz: ref(SPAN_START_HZ),
    spanEndHz: ref(SPAN_END_HZ),
    zoomWindowHz: options.zoomWindowHz ?? ((lo, hi) => ({ winLo: lo, winHi: hi })),
    firstBinHz: () => scale.firstBinHz,
    hzPerBin: () => scale.hzPerBin,
    rowCapacity,
  })
  markers.wfDataTopPx.value = DATA_TOP_PX
  markers.wfDataHeightPx.value = options.dataHeightPx ?? rowCapacity * ROW_HEIGHT_PX
  return { markers, source, sweeping, rasterElement, bandInsetLeftPx, bandInsetRightPx, scale }
}

/** One row of bins: noise everywhere, the signal over [loBin, hiBin] when given. */
function makeRow(signal: { loBin: number; hiBin: number } | null): Float32Array {
  const row = new Float32Array(BIN_COUNT).fill(NOISE_DB)
  if (signal) row.fill(SIGNAL_DB, signal.loBin, signal.hiBin + 1)
  return row
}

const DEFAULT_SIGNAL = { loBin: SIGNAL_LO_BIN, hiBin: SIGNAL_HI_BIN }

/**
 * Pushes rows oldest first, row k at T0 + k * stepMs. `hasSignal(k)` says
 * whether row k carries the default signal.
 */
function pushRows(
  harness: Harness,
  count: number,
  stepMs: number,
  hasSignal: (rowNumber: number) => boolean = () => false,
  firstRowNumber = 0,
): void {
  for (let rowNumber = firstRowNumber; rowNumber < firstRowNumber + count; rowNumber++) {
    harness.markers.recordRowPushTime(
      T0 + rowNumber * stepMs,
      makeRow(hasSignal(rowNumber) ? DEFAULT_SIGNAL : null),
    )
  }
}

function binClientX(bin: number): number {
  return RECT_LEFT + INSET_LEFT_PX + bin * HZ_PER_BIN
}

/** clientY of the middle of the row `rowIndex` rows below the top (newest). */
function rowClientY(rowIndex: number, rowHeightPx = ROW_HEIGHT_PX): number {
  return RECT_TOP + DATA_TOP_PX + rowIndex * rowHeightPx + rowHeightPx / 2
}

function mouseAt(bin: number, rowIndex: number): MouseEvent {
  return new MouseEvent('mousemove', { clientX: binClientX(bin), clientY: rowClientY(rowIndex) })
}

/** An independent HH:MM:SS (24-hour, local time) to check the labels against. */
function clock(atMs: number): string {
  const date = new Date(atMs)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

/**
 * Ten rows a second apart (so start and end read as different clock times); the signal is in rows 2..7 (oldest first), i.e. at
 * row indices 2..7 below the top as well (ten rows, newest = row 9 at index 0).
 * It has ended: row 8 and 9 are noise.
 */
function pushEndedSignal(harness: Harness): void {
  pushRows(harness, 10, 1000, (rowNumber) => rowNumber >= 2 && rowNumber <= 7)
}

const ENDED_SIGNAL: DetectedSignalMarker = {
  freqLoHz: SPAN_START_HZ + SIGNAL_LO_BIN * HZ_PER_BIN,
  freqHiHz: SPAN_START_HZ + SIGNAL_HI_BIN * HZ_PER_BIN,
  startMs: T0 + 2000,
  endMs: T0 + 7000,
}

describe('useSignalMarkers — time marker overlay', () => {
  it('places the overlay over the raster data box', () => {
    const harness = makeHarness({ dataHeightPx: 640 })
    harness.markers.wfDataTopPx.value = 33
    harness.bandInsetLeftPx.value = 61
    harness.bandInsetRightPx.value = 17
    expect(harness.markers.timeMarkerOverlayStyle.value).toEqual({
      left: '61px',
      right: '17px',
      top: '33px',
      height: '640px',
    })
  })
})

describe('useSignalMarkers — clock labels', () => {
  it('labels the first row of each interval bucket, newest to oldest', () => {
    const harness = makeHarness()
    // Rows every 250 ms from T0 to T0 + 2750: index i holds T0 + 2750 - 250 i,
    // so the clock crosses a whole second at index 4 (T0 + 1750) and 8 (T0 + 750).
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([
      { key: Math.floor((T0 + 1750) / 1000), topPx: 40, label: clock(T0 + 1750) },
      { key: Math.floor((T0 + 750) / 1000), topPx: 80, label: clock(T0 + 750) },
    ])
  })

  it('cuts buckets at the configured interval', () => {
    const harness = makeHarness({ intervalSec: 2 })
    pushRows(harness, 12, 250)
    // Newest is T0 + 2750 (bucket +1); T0 + 1750 is the first row of bucket +0.
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([
      { key: Math.floor((T0 + 1750) / 2000), topPx: 40, label: clock(T0 + 1750) },
    ])
  })

  it('follows a change of interval', () => {
    const harness = makeHarness()
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value).toHaveLength(2)
    harness.source.waterfallTimestampIntervalSec = 2
    expect(harness.markers.waterfallTimeMarkers.value).toHaveLength(1)
  })

  it('rounds a row to the nearest pixel', () => {
    // 170 px over 100 rows = 1.7 px per row: index 4 → 6.8 → 7, index 8 → 13.6 → 14.
    const harness = makeHarness({ dataHeightPx: 170 })
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value.map((marker) => marker.topPx)).toEqual([
      7, 14,
    ])
  })

  it('positions rows by the full raster depth, not the rows recorded so far', () => {
    const harness = makeHarness({ dataHeightPx: 200 })
    pushRows(harness, 12, 250)
    // 200 px / 100 rows = 2 px per row, even though only 12 rows exist.
    expect(harness.markers.waterfallTimeMarkers.value.map((marker) => marker.topPx)).toEqual([
      8, 16,
    ])
  })

  it(`stops at ${WF_TIME_MARKER_LIMIT} labels`, () => {
    const harness = makeHarness()
    // A row a second for 100 rows: every row starts a new 1 s bucket.
    pushRows(harness, 100, 1000)
    const timeMarkers = harness.markers.waterfallTimeMarkers.value
    expect(timeMarkers).toHaveLength(WF_TIME_MARKER_LIMIT)
    expect(timeMarkers[0]?.topPx).toBe(10)
    expect(timeMarkers.at(-1)?.topPx).toBe(WF_TIME_MARKER_LIMIT * 10)
  })

  it('shows nothing while the timestamps setting is off', () => {
    const harness = makeHarness()
    pushRows(harness, 12, 250)
    harness.source.displayWaterfallTimestamps = false
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
    harness.source.displayWaterfallTimestamps = true
    expect(harness.markers.waterfallTimeMarkers.value).toHaveLength(2)
  })

  it('needs at least two rows', () => {
    const harness = makeHarness()
    pushRows(harness, 1, 250)
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
  })

  it('needs a laid-out data box', () => {
    const harness = makeHarness()
    pushRows(harness, 12, 250)
    harness.markers.wfDataHeightPx.value = 0
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
  })

  it('re-derives as each row is recorded', () => {
    const harness = makeHarness()
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value[0]?.topPx).toBe(40)
    // Still inside the newest bucket, so the same label moves one row (10 px) down.
    harness.markers.recordRowPushTime(T0 + 2900, makeRow(null))
    expect(harness.markers.waterfallTimeMarkers.value[0]?.topPx).toBe(50)
  })
})

describe('useSignalMarkers — second ticks', () => {
  it('ticks every whole second between labels', () => {
    // 5 s interval: no bucket change between T0 and T0 + 2750, so no labels.
    const harness = makeHarness({ intervalSec: 5 })
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([
      { key: Math.floor((T0 + 1750) / 1000), topPx: 40 },
      { key: Math.floor((T0 + 750) / 1000), topPx: 80 },
    ])
  })

  it('skips the row a label already marks', () => {
    // 2 s interval: index 4 (T0 + 1750) is labelled, index 8 (T0 + 750) is a tick.
    const harness = makeHarness({ intervalSec: 2 })
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value.map((marker) => marker.topPx)).toEqual([40])
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([
      { key: Math.floor((T0 + 750) / 1000), topPx: 80 },
    ])
  })

  it(`hides a tick within ${WF_TIME_LABEL_HALF_HEIGHT_PX}px of a label`, () => {
    // 2.75 px per row: label at index 4 → 11 px, tick at index 8 → 22 px: 11 px apart.
    const harness = makeHarness({ intervalSec: 2, dataHeightPx: 275 })
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value.map((marker) => marker.topPx)).toEqual([11])
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([])
  })

  it('keeps a tick just clear of a label', () => {
    // 3 px per row: label at 12 px, tick at 24 px — 12 px apart.
    const harness = makeHarness({ intervalSec: 2, dataHeightPx: 300 })
    pushRows(harness, 12, 250)
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([
      { key: Math.floor((T0 + 750) / 1000), topPx: 24 },
    ])
  })

  it('hides a tick a pinned signal label covers', () => {
    // 5 s interval → no clock labels. Rows every 250 ms; the signal starts at
    // row 4 (T0 + 1000), which lands at index 7 → 70 px, 10 px from the 80 px tick.
    const harness = makeHarness({ intervalSec: 5 })
    pushRows(harness, 12, 250, (rowNumber) => rowNumber >= 4)
    expect(harness.markers.visibleWaterfallSecondTicks.value.map((tick) => tick.topPx)).toEqual([
      40, 80,
    ])
    const marker = harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(3))
    expect(marker?.startMs).toBe(T0 + 1000)
    harness.markers.toggleSignalMarkerPin(marker as DetectedSignalMarker)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.topPx)).toEqual([70])
    expect(harness.markers.visibleWaterfallSecondTicks.value.map((tick) => tick.topPx)).toEqual([
      40,
    ])
  })

  it(`stops at ${WF_SECOND_TICK_LIMIT} ticks`, () => {
    // A one-hour interval never changes bucket here; 200 rows a second apart.
    const harness = makeHarness({ rowCapacity: 200, intervalSec: 3600, dataHeightPx: 2000 })
    pushRows(harness, 200, 1000)
    const ticks = harness.markers.visibleWaterfallSecondTicks.value
    expect(ticks).toHaveLength(WF_SECOND_TICK_LIMIT)
    expect(ticks.at(-1)?.topPx).toBe(WF_SECOND_TICK_LIMIT * 10)
  })

  it('rounds a tick to the nearest pixel', () => {
    // 1.7 px per row: index 4 → 6.8 → 7, index 8 → 13.6 → 14.
    const harness = makeHarness({ intervalSec: 5, dataHeightPx: 170 })
    pushRows(harness, 12, 250)
    expect(harness.markers.visibleWaterfallSecondTicks.value.map((tick) => tick.topPx)).toEqual([
      7, 14,
    ])
  })

  it('does not spend the tick limit on labelled rows', () => {
    // 10 s labels, a row a second, 20 px per row (so no tick sits near a label):
    // every 10th row is labelled, the others get the first 100 ticks.
    const harness = makeHarness({ rowCapacity: 200, intervalSec: 10, dataHeightPx: 4000 })
    pushRows(harness, 200, 1000)
    const ticks = harness.markers.visibleWaterfallSecondTicks.value
    expect(ticks).toHaveLength(WF_SECOND_TICK_LIMIT)
    const labelledTopPx = harness.markers.waterfallTimeMarkers.value.map((marker) => marker.topPx)
    expect(ticks.some((tick) => labelledTopPx.includes(tick.topPx))).toBe(false)
  })

  it('shows nothing while the timestamps setting is off', () => {
    const harness = makeHarness({ intervalSec: 5 })
    pushRows(harness, 12, 250)
    harness.source.displayWaterfallTimestamps = false
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([])
  })

  it('needs at least two rows and a laid-out data box', () => {
    const harness = makeHarness({ intervalSec: 5 })
    pushRows(harness, 1, 250)
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([])
    pushRows(harness, 11, 250, undefined, 1)
    expect(harness.markers.visibleWaterfallSecondTicks.value).toHaveLength(2)
    harness.markers.wfDataHeightPx.value = 0
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([])
  })
})

describe('useSignalMarkers — signal detection', () => {
  it('measures the signal under the cursor: its edges, start and end', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toEqual(
      ENDED_SIGNAL,
    )
  })

  it('has no end while the signal is still in the newest row', () => {
    const harness = makeHarness()
    pushRows(harness, 10, 1000, (rowNumber) => rowNumber >= 2)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toEqual({
      ...ENDED_SIGNAL,
      endMs: null,
    })
  })

  it('finds nothing over noise', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(60), rowClientY(4))).toBeNull()
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(8))).toBeNull()
  })

  it.each([
    [
      'the timestamps setting is off',
      (harness: Harness) => {
        harness.source.displayWaterfallTimestamps = false
      },
    ],
    [
      'the radio is not playing',
      (harness: Harness) => {
        harness.source.playing = false
      },
    ],
    [
      'the display is paused',
      (harness: Harness) => {
        harness.source.displayPaused = true
      },
    ],
    [
      'a sweep is running',
      (harness: Harness) => {
        harness.sweeping.value = true
      },
    ],
  ])('finds nothing while %s', (_reason, setUp) => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    setUp(harness)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
  })

  it('finds nothing without a raster element', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.rasterElement.value = null
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
  })

  it('finds nothing before any row is recorded', () => {
    const harness = makeHarness()
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(0))).toBeNull()
  })

  it('finds nothing before the data box is laid out', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.wfDataHeightPx.value = 0
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
  })

  it('finds nothing above the data box or below the recorded rows', () => {
    const harness = makeHarness()
    pushRows(harness, 10, 1000, () => true)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(0))).not.toBeNull()
    expect(
      harness.markers.computeSignalMarkerAtPoint(binClientX(42), RECT_TOP + DATA_TOP_PX - 1),
    ).toBeNull()
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(9))).not.toBeNull()
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(10))).toBeNull()
  })

  it('finds nothing when the gutters leave no data box', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.bandInsetRightPx.value = DATA_WIDTH_PX + INSET_RIGHT_PX
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
  })

  it('finds nothing left of a zero-width data box', () => {
    const harness = makeHarness()
    for (let rowNumber = 0; rowNumber < 3; rowNumber++) {
      harness.markers.recordRowPushTime(T0 + rowNumber * 100, makeRow({ loBin: 0, hiBin: 2 }))
    }
    harness.bandInsetRightPx.value = DATA_WIDTH_PX + INSET_RIGHT_PX
    expect(harness.markers.computeSignalMarkerAtPoint(RECT_LEFT, rowClientY(1))).toBeNull()
  })

  it('rounds the cursor to the nearest bin', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    // 0.6 of the way from bin 39 (noise) to bin 40 (the signal's first bin).
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(39) + 6, rowClientY(4))).toEqual(
      ENDED_SIGNAL,
    )
    // 0.4 of the way: still bin 39.
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(39) + 4, rowClientY(4))).toBeNull()
  })

  it('reads the data box from the gutters', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    // A wider left gutter (and an equally narrower right one) shifts every bin right by 30 px.
    harness.bandInsetLeftPx.value = INSET_LEFT_PX + 30
    harness.bandInsetRightPx.value = INSET_RIGHT_PX - 30
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42) + 30, rowClientY(4))).toEqual(
      ENDED_SIGNAL,
    )
  })

  it('clamps a point left of the data box to its left edge', () => {
    const harness = makeHarness()
    for (let rowNumber = 0; rowNumber < 3; rowNumber++) {
      harness.markers.recordRowPushTime(T0 + rowNumber * 100, makeRow({ loBin: 0, hiBin: 2 }))
    }
    expect(harness.markers.computeSignalMarkerAtPoint(RECT_LEFT - 500, rowClientY(1))).toEqual({
      freqLoHz: SPAN_START_HZ,
      freqHiHz: SPAN_START_HZ + 2 * HZ_PER_BIN,
      startMs: T0,
      endMs: null,
    })
  })

  it('maps the point through the zoom window', () => {
    // Zoomed 2×, off centre: the data box shows 1200..1700 Hz, so its middle is
    // 1450 Hz = bin 45 (unzoomed it would be 1500 Hz = bin 50).
    const harness = makeHarness({ zoomWindowHz: () => ({ winLo: 1200, winHi: 1700 }) })
    for (let rowNumber = 0; rowNumber < 3; rowNumber++) {
      harness.markers.recordRowPushTime(T0 + rowNumber * 100, makeRow({ loBin: 45, hiBin: 45 }))
    }
    const middleX = RECT_LEFT + INSET_LEFT_PX + DATA_WIDTH_PX / 2
    expect(harness.markers.computeSignalMarkerAtPoint(middleX, rowClientY(0))).toMatchObject({
      freqLoHz: 1450,
      freqHiHz: 1450,
    })
  })

  it('reads the frequency scale on every use', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    // The component reassigns its scale on retune; the getters must see it.
    harness.scale.firstBinHz = 1100
    harness.scale.hzPerBin = 9
    // clientX 1400 Hz ↔ bin (1400 - 1100) / 9 = 33.3 → 33: noise.
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(40), rowClientY(4))).toBeNull()
    // 1100 + 42 × 9 = 1478 Hz → clientX of 478 Hz past the span start.
    const clientX = RECT_LEFT + INSET_LEFT_PX + (1478 - SPAN_START_HZ)
    expect(harness.markers.computeSignalMarkerAtPoint(clientX, rowClientY(4))).toMatchObject({
      freqLoHz: 1100 + SIGNAL_LO_BIN * 9,
      freqHiHz: 1100 + SIGNAL_HI_BIN * 9,
    })
  })

  it('keeps its own copy of each row', () => {
    const harness = makeHarness()
    const row = makeRow(DEFAULT_SIGNAL)
    harness.markers.recordRowPushTime(T0, row)
    harness.markers.recordRowPushTime(T0 + 100, row)
    row.fill(NOISE_DB)
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(0))).not.toBeNull()
  })
})

describe('useSignalMarkers — hover', () => {
  it('tracks the signal under the cursor', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    expect(harness.markers.hoverSignalMarker.value).toEqual(ENDED_SIGNAL)
  })

  it('clears when the cursor leaves the recorded rows', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    harness.markers.onWaterfallMouseMove(mouseAt(42, 50))
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
  })

  it('clears on mouseleave', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    harness.markers.onWaterfallMouseLeave()
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
  })

  it.each([
    ['its first bin and newest row', SIGNAL_LO_BIN, 2],
    ['its last bin and oldest row', SIGNAL_HI_BIN, 7],
  ])('keeps the marker while the cursor stays inside its box (%s)', (_where, bin, rowIndex) => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    const shown = harness.markers.hoverSignalMarker.value
    // Paused, a fresh detection finds nothing — the box alone keeps the marker.
    harness.source.displayPaused = true
    harness.markers.onWaterfallMouseMove(mouseAt(bin, rowIndex))
    expect(harness.markers.hoverSignalMarker.value).toBe(shown)
  })

  it.each([
    ['below its lowest bin', SIGNAL_LO_BIN - 1, 4],
    ['above its highest bin', SIGNAL_HI_BIN + 1, 4],
    ['above its newest row', 42, 1],
    ['below its oldest row', 42, 8],
  ])('drops the marker once the cursor leaves its box (%s)', (_where, bin, rowIndex) => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    harness.source.displayPaused = true
    harness.markers.onWaterfallMouseMove(mouseAt(bin, rowIndex))
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
  })

  it('refreshes the marker while inside its box', () => {
    const harness = makeHarness()
    // Live signal in rows 2..9.
    pushRows(harness, 10, 1000, (rowNumber) => rowNumber >= 2)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 3))
    expect(harness.markers.hoverSignalMarker.value?.endMs).toBeNull()
    // The signal stops: a noise row on top. It now ends at row 9 (T0 + 9000).
    pushRows(harness, 1, 1000, undefined, 10)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 3))
    expect(harness.markers.hoverSignalMarker.value).toEqual({
      ...ENDED_SIGNAL,
      endMs: T0 + 9000,
    })
  })

  it('drops the marker once its start row ages out of the history', () => {
    const harness = makeHarness({ rowCapacity: 10 })
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    expect(harness.markers.hoverSignalMarker.value).toEqual(ENDED_SIGNAL)
    harness.source.displayPaused = true
    // Three more rows: the start row (T0 + 2000, index 7) is pushed out past index 9.
    pushRows(harness, 3, 1000, undefined, 10)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 9))
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
  })

  it('drops the marker when the timestamps setting is turned off', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    harness.source.displayWaterfallTimestamps = false
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
  })

  it('moves to a different signal outside the current box', () => {
    const harness = makeHarness()
    for (let rowNumber = 0; rowNumber < 5; rowNumber++) {
      const row = makeRow(DEFAULT_SIGNAL)
      row.fill(SIGNAL_DB, 70, 73)
      harness.markers.recordRowPushTime(T0 + rowNumber * 100, row)
    }
    harness.markers.onWaterfallMouseMove(mouseAt(42, 2))
    harness.markers.onWaterfallMouseMove(mouseAt(71, 2))
    expect(harness.markers.hoverSignalMarker.value).toMatchObject({
      freqLoHz: SPAN_START_HZ + 70 * HZ_PER_BIN,
      freqHiHz: SPAN_START_HZ + 72 * HZ_PER_BIN,
    })
  })
})

describe('useSignalMarkers — pins and their labels', () => {
  it('shows nothing until a signal is pinned', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
  })

  it('labels a pinned signal with its start and end rows', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value).toEqual([
      { key: 'signal-pin-0-start', topPx: 70, label: clock(T0 + 2000), variant: 'start' },
      { key: 'signal-pin-0-end', topPx: 20, label: clock(T0 + 7000), variant: 'end' },
    ])
  })

  it('labels only the start of a signal that has not ended', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, endMs: null })
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.variant)).toEqual([
      'start',
    ])
  })

  it('rounds label rows to the nearest pixel', () => {
    // 1.7 px per row: start row 7 → 11.9 → 12, end row 2 → 3.4 → 3.
    const harness = makeHarness({ dataHeightPx: 170 })
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.topPx)).toEqual([12, 3])
  })

  it('rounds the end label row to the nearest pixel', () => {
    // 1.9 px per row: start row 7 → 13.3 → 13, end row 2 → 3.8 → 4.
    const harness = makeHarness({ dataHeightPx: 190 })
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.topPx)).toEqual([13, 4])
  })

  it('moves the labels down as rows are recorded', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    pushRows(harness, 1, 1000, undefined, 10)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.topPx)).toEqual([80, 30])
  })

  it('drops each label as its row ages out of the history', () => {
    const harness = makeHarness({ rowCapacity: 10 })
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    // Start row at index 7: three more rows push it out; the end row (index 2 → 5) stays.
    pushRows(harness, 3, 1000, undefined, 10)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.variant)).toEqual(['end'])
    pushRows(harness, 5, 1000, undefined, 13)
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
  })

  it('hides the labels while the timestamps setting is off', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.source.displayWaterfallTimestamps = false
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
    harness.source.displayWaterfallTimestamps = true
    expect(harness.markers.signalMarkerLabels.value).toHaveLength(2)
  })

  it('unpins a pinned signal when an overlapping one is toggled', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    // Shares only the 1440 Hz edge with the pinned signal — still the same one.
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, freqLoHz: 1440, freqHiHz: 1500 })
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
  })

  it('unpins when the toggled signal overlaps from below', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, freqLoHz: 1300, freqHiHz: 1400 })
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
  })

  it('pins a separate signal that does not overlap', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, freqLoHz: 1441, freqHiHz: 1500 })
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, freqLoHz: 1300, freqHiHz: 1399 })
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.key)).toEqual([
      'signal-pin-0-start',
      'signal-pin-0-end',
      'signal-pin-1-start',
      'signal-pin-1-end',
      'signal-pin-2-start',
      'signal-pin-2-end',
    ])
  })

  it('removes only the overlapping pin', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin({ ...ENDED_SIGNAL, freqLoHz: 1100, freqHiHz: 1200 })
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value.map((label) => label.key)).toEqual([
      'signal-pin-0-start',
      'signal-pin-0-end',
    ])
  })

  it('never reuses a pin id', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value[0]?.key).toBe('signal-pin-1-start')
  })
})

describe('useSignalMarkers — clearing the history', () => {
  it('drops the rows, the hover and every pin', () => {
    const harness = makeHarness()
    pushEndedSignal(harness)
    harness.markers.onWaterfallMouseMove(mouseAt(42, 4))
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    harness.markers.clearRowPushTimes()
    expect(harness.markers.hoverSignalMarker.value).toBeNull()
    expect(harness.markers.signalMarkerLabels.value).toEqual([])
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
    expect(harness.markers.computeSignalMarkerAtPoint(binClientX(42), rowClientY(4))).toBeNull()
    // A pin made later starts from an empty list, not the cleared one.
    pushEndedSignal(harness)
    harness.markers.toggleSignalMarkerPin(ENDED_SIGNAL)
    expect(harness.markers.signalMarkerLabels.value).toHaveLength(2)
  })

  it('re-derives the clock labels after clearing', () => {
    const harness = makeHarness()
    pushRows(harness, 12, 250)
    expect(harness.markers.waterfallTimeMarkers.value).toHaveLength(2)
    harness.markers.clearRowPushTimes()
    expect(harness.markers.waterfallTimeMarkers.value).toEqual([])
    expect(harness.markers.visibleWaterfallSecondTicks.value).toEqual([])
  })
})
