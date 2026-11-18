/**
 * The waterfall's row clock and signal markers: the wall-clock time and FFT
 * bins of every raster row, the clock labels and second ticks drawn down the
 * raster's left edge, and the signal marker (hover a signal, Shift+Click to
 * pin its start/end time).
 *
 * Split out of `SdrWaterfall.vue` (refactor series C12). The component still
 * owns the plots, the span/zoom state and the frequency scale of the current
 * frame; it passes those in, records each row it pushes, and renders the labels
 * this returns. The detection maths themselves are the pure functions in
 * `useSdrSignalMarker.ts`.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { findSignalEdges, findTimeExtent } from './useSdrSignalMarker'

// ── Waterfall time markers ───────────────────────────────────────────────────
// Clock labels down the left edge of the raster, so a signal seen scrolling
// away can be read off as a wall-clock time. This is SDR#'s "Use Time Markers"
// waterfall option (date/time down the left side, on a configurable interval);
// SDR++ has no equivalent — it has only ever been an open feature request
// (SDRPlusPlus discussion #1047) — so SDR# is the reference behaviour here.
//
// Both the on/off state and the interval come from SDR settings
// (source.displayWaterfallTimestamps / source.waterfallTimestampIntervalSec).
// Hard ceiling on rendered labels — a defensive bound so a very short interval
// against a long history can never spray hundreds of nodes into the overlay.
export const WF_TIME_MARKER_LIMIT = 40

// ── Signal marker (hover / click a signal for its start/end time) ──────────
// A signal currently under the cursor (recomputed on every raster
// mousemove; cleared on mouseleave). Detection maths live in the pure
// useSdrSignalMarker composable so they're unit-testable in isolation.
export interface DetectedSignalMarker {
  freqLoHz: number
  freqHiHz: number
  startMs: number
  /** null while the signal is still present in the newest row (no end yet). */
  endMs: number | null
}

/** A signal marker the operator clicked to keep visible. */
export interface PinnedSignalMarker extends DetectedSignalMarker {
  id: number
}

/** A single clock label pinned to the raster row that crossed a time step. */
export interface WaterfallTimeMarker {
  key: number
  topPx: number
  label: string
}

/** An unlabelled tick at a whole-second row, drawn between the labelled
 *  clock markers above so the gaps between them are still readable as time. */
export interface WaterfallSecondTick {
  key: number
  topPx: number
}

// Hard ceiling mirroring WF_TIME_MARKER_LIMIT — a defensive bound so a very
// short raster height (many rows per pixel) can't spray hundreds of ticks.
export const WF_SECOND_TICK_LIMIT = 100

export interface SignalMarkerLabel {
  key: string
  topPx: number
  label: string
  variant: 'start' | 'end'
}

// A label (.sdr-wf-time-label) has real height on screen — 11px font plus
// 5px of padding top and bottom, ≈21px total — so a tick landing merely
// close to one, not just on its exact row, would still visually cut across
// it. Filtering by pixel proximity (rather than by row/second identity, as
// waterfallSecondTicks' own isLabelledSecond check does) also covers the
// signal start/end labels, which — unlike the interval labels — aren't
// aligned to whole-second boundaries and so can land on any row.
export const WF_TIME_LABEL_HALF_HEIGHT_PX = 11

/** The parts of the SDR store the row clock and signal markers read. */
export interface SignalMarkerSource {
  readonly displayWaterfallTimestamps: boolean
  readonly waterfallTimestampIntervalSec: number
  readonly playing: boolean
  readonly displayPaused: boolean
}

/** What the component hands the row clock and signal markers. */
export interface SignalMarkerOptions {
  source: SignalMarkerSource
  /** True while a search/scan sweep is retuning the radio: detection is off then. */
  sweeping: Readonly<Ref<boolean>>
  /** The waterfall plot's element (the raster the cursor moves over). */
  rasterElement: Readonly<Ref<HTMLElement | null>>
  /** The data box's left/right gutters in CSS pixels, shared with the spectrum. */
  bandInsetLeftPx: Readonly<Ref<number>>
  bandInsetRightPx: Readonly<Ref<number>>
  spanStartHz: Readonly<Ref<number>>
  spanEndHz: Readonly<Ref<number>>
  /** The visible window inside the span at the current zoom (and live pan). */
  zoomWindowHz: (spanStartHz: number, spanEndHz: number) => { winLo: number; winHi: number }
  /** Hz of the current frame's first FFT bin (read on every use: it changes on retune). */
  firstBinHz: () => number
  /** Hz per FFT bin of the current frame. */
  hzPerBin: () => number
  /** Rows the raster holds; the row history is capped to it. */
  rowCapacity: number
}

/** The row clock and signal markers, as the component uses them. */
export interface SignalMarkers {
  /** The raster's data box (top edge and height in element pixels); the component sets them after a draw. */
  wfDataTopPx: Ref<number>
  wfDataHeightPx: Ref<number>
  hoverSignalMarker: Ref<DetectedSignalMarker | null>
  recordRowPushTime: (atMs: number, bins: ArrayLike<number>) => void
  clearRowPushTimes: () => void
  timeMarkerOverlayStyle: ComputedRef<Record<string, string>>
  waterfallTimeMarkers: ComputedRef<WaterfallTimeMarker[]>
  visibleWaterfallSecondTicks: ComputedRef<WaterfallSecondTick[]>
  signalMarkerLabels: ComputedRef<SignalMarkerLabel[]>
  computeSignalMarkerAtPoint: (clientX: number, clientY: number) => DetectedSignalMarker | null
  toggleSignalMarkerPin: (marker: DetectedSignalMarker) => void
  onWaterfallMouseMove: (event: MouseEvent) => void
  onWaterfallMouseLeave: () => void
}

/** Builds the row clock and signal markers for one waterfall. */
export function useSignalMarkers({
  source,
  sweeping,
  rasterElement,
  bandInsetLeftPx,
  bandInsetRightPx,
  spanStartHz,
  spanEndHz,
  zoomWindowHz,
  firstBinHz,
  hzPerBin,
  rowCapacity,
}: SignalMarkerOptions): SignalMarkers {
  // Wall-clock push time of each raster row, NEWEST FIRST: index N is the row N
  // rows below the top of the raster (drawmode 'falling' puts new rows at the
  // top). Capped at rowCapacity so it mirrors exactly what the raster holds.
  // Deliberately non-reactive — it is written up to WF_ROW_HZ times a second and
  // re-rendering on the array itself would make every push a deep-reactivity
  // walk; `rowClockTick` is the single reactive signal that the rows moved.
  const rowPushTimesMs: number[] = []
  const rowClockTick = ref(0)

  // FFT bins of each raster row, mirroring rowPushTimesMs index-for-index —
  // the signal marker feature (hover/click a signal to read off its start/end
  // time) walks this to find how far back a signal has been continuously
  // present. Also deliberately non-reactive, for the same reason as
  // rowPushTimesMs. Cost: rowCapacity (400) × bins × 4 bytes ≈ 6.5 MB at 4096
  // bins, ~13 MB at the 8192 the canvas math typically lands on — acceptable.
  const rowBins: Float32Array[] = []

  const hoverSignalMarker = ref<DetectedSignalMarker | null>(null)

  const pinnedSignalMarkers = ref<PinnedSignalMarker[]>([])
  let nextSignalMarkerId = 0

  /** Records one raster row's wall-clock push time and its FFT bins. */
  function recordRowPushTime(atMs: number, bins: ArrayLike<number>): void {
    rowPushTimesMs.unshift(atMs)
    if (rowPushTimesMs.length > rowCapacity) rowPushTimesMs.length = rowCapacity
    rowBins.unshift(Float32Array.from(bins))
    if (rowBins.length > rowCapacity) rowBins.length = rowCapacity
    rowClockTick.value++
  }

  /**
   * Drops the recorded row history — pairs with clearing the raster's own
   * history. Also clears the signal marker state: a retune invalidates every
   * retained row's frequency mapping, so a hover/pinned marker measured
   * against the old scale would silently mismeasure the new one.
   */
  function clearRowPushTimes(): void {
    rowPushTimesMs.length = 0
    rowBins.length = 0
    rowClockTick.value++
    hoverSignalMarker.value = null
    pinnedSignalMarkers.value = []
  }

  // The waterfall plot's own data box (top edge and height in element pixels).
  // The raster reserves the same left/right gutters as the spectrum
  // (bandInsetLeftPx/RightPx — both plots share the axis spec) but its own
  // vertical extent, so the markers need these to sit on the right rows.
  const wfDataTopPx = ref(0)
  const wfDataHeightPx = ref(0)

  /** 24-hour HH:MM:SS, matching the radio's other clock readouts. */
  function formatRowClock(atMs: number): string {
    return new Date(atMs).toLocaleTimeString('en-GB', { hour12: false })
  }

  // Overlay rectangle: the raster's data box. Anchored to the waterfall plot's
  // own top/height (not the element's) so the labels never drift onto the
  // canvas's reserved (invisible) axis gutters, and inset to the data box's left
  // edge so the clock labels sit flush against the waterfall raster itself rather
  // than out in the y-axis gutter.
  const timeMarkerOverlayStyle = computed(() => ({
    left: `${bandInsetLeftPx.value}px`,
    right: `${bandInsetRightPx.value}px`,
    top: `${wfDataTopPx.value}px`,
    height: `${wfDataHeightPx.value}px`,
  }))

  const waterfallTimeMarkers = computed<WaterfallTimeMarker[]>(() => {
    // Read the tick so the markers re-derive as rows scroll down.
    void rowClockTick.value
    if (!source.displayWaterfallTimestamps) return []
    const rowCount = rowPushTimesMs.length
    const boxHeightPx = wfDataHeightPx.value
    // Two rows is the minimum that defines a row interval; below that (or before
    // the plot has been laid out) there is nothing meaningful to place.
    if (rowCount < 2 || boxHeightPx <= 0) return []

    const newestMs = rowPushTimesMs[0] as number
    // Rows are evenly spaced down the box (the raster is rowCapacity deep whether or
    // not it is full yet), so a row's index alone gives its vertical position.
    const pxPerRow = boxHeightPx / rowCapacity
    // The store clamps the interval to at least 1 s, so this is always positive.
    const stepMs = source.waterfallTimestampIntervalSec * 1000

    // Walk newest → oldest and mark the first row of each interval bucket: the
    // row that sits just after the clock crossed a whole multiple of the
    // configured interval, so labels land on round times as SDR#'s markers do.
    const markers: WaterfallTimeMarker[] = []
    let previousBucket = Math.floor(newestMs / stepMs)
    for (let rowIndex = 1; rowIndex < rowCount; rowIndex++) {
      const rowTimeMs = rowPushTimesMs[rowIndex] as number
      const bucket = Math.floor(rowTimeMs / stepMs)
      if (bucket === previousBucket) continue
      previousBucket = bucket
      markers.push({
        key: bucket,
        topPx: Math.round(rowIndex * pxPerRow),
        label: formatRowClock(rowTimeMs),
      })
      if (markers.length >= WF_TIME_MARKER_LIMIT) break
    }
    return markers
  })

  const waterfallSecondTicks = computed<WaterfallSecondTick[]>(() => {
    // Read the tick so the ticks re-derive as rows scroll down.
    void rowClockTick.value
    if (!source.displayWaterfallTimestamps) return []
    const rowCount = rowPushTimesMs.length
    const boxHeightPx = wfDataHeightPx.value
    if (rowCount < 2 || boxHeightPx <= 0) return []

    const newestMs = rowPushTimesMs[0] as number
    const pxPerRow = boxHeightPx / rowCapacity
    const stepMs = source.waterfallTimestampIntervalSec * 1000

    const ticks: WaterfallSecondTick[] = []
    let previousSecond = Math.floor(newestMs / 1000)
    // Tracked the same way waterfallTimeMarkers tracks its own bucket, so a
    // labelled row is identified by "the interval bucket also changed here" —
    // not by "is this wall-clock second a round multiple of the interval",
    // which is a different (and often wrong) thing. Bucket boundaries are cut
    // by absolute epoch ms (floor(ms / stepMs)), and the first row of a new
    // bucket is whatever wall-clock second that row happens to land on — that
    // is only a round multiple of the interval when the row history started
    // exactly on one, which it essentially never does. Testing the wrong
    // condition skipped a tick at the second that looked round while the real
    // label rendered a few rows away at the second that wasn't — the gap read
    // as "the tick right before each label is missing".
    let previousBucket = Math.floor(newestMs / stepMs)
    for (let rowIndex = 1; rowIndex < rowCount; rowIndex++) {
      const rowTimeMs = rowPushTimesMs[rowIndex] as number
      const second = Math.floor(rowTimeMs / 1000)
      if (second === previousSecond) continue
      previousSecond = second
      const bucket = Math.floor(rowTimeMs / stepMs)
      if (bucket !== previousBucket) {
        // This is the row waterfallTimeMarkers itself labels — no tick here.
        previousBucket = bucket
        continue
      }
      ticks.push({ key: second, topPx: Math.round(rowIndex * pxPerRow) })
      if (ticks.length >= WF_SECOND_TICK_LIMIT) break
    }
    return ticks
  })

  // ── Signal marker detection ──────────────────────────────────────────────
  // Hovering (or clicking) a signal on the raster reads off when it started
  // and — once it has scrolled clear of the newest row — when it ended, drawn
  // into the same left-edge timestamp column as waterfallTimeMarkers above,
  // gated behind the same source.displayWaterfallTimestamps setting.

  /** Maps a clientX over `el` to the Hz it sits on, mirroring onPlotMouseUp's
   *  own rect/zoom-window math (kept separate rather than shared: onPlotMouseUp
   *  additionally snaps to known frequencies for tuning, which hover detection
   *  must not do). Returns null outside the plot's data box or before a frame
   *  has established a span. */
  function clientXToFreqHz(el: HTMLElement, clientX: number): number | null {
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    /* v8 ignore start -- defensive: this function's only caller (pointToRowAndBin)
     * already requires rowBins.length > 0, and any frame degenerate enough to
     * collapse the span (e.g. sample_rate 0) is by definition a scaleChanged
     * frame, which clears rowBins before this could ever run against it. */
    if (hi <= lo) return null
    /* v8 ignore stop */
    const rect = el.getBoundingClientRect()
    const dataLeft = rect.left + bandInsetLeftPx.value
    const dataWidth = rect.width - bandInsetLeftPx.value - bandInsetRightPx.value
    if (dataWidth <= 0) return null
    const frac = Math.min(1, Math.max(0, (clientX - dataLeft) / dataWidth))
    const { winLo, winHi } = zoomWindowHz(lo, hi)
    return winLo + frac * (winHi - winLo)
  }

  /** Maps a raster-relative point to the row/bin it sits on. Null outside the
   *  plot's data box, before a frame has established a span, or once the
   *  cursor is below the retained row history. */
  function pointToRowAndBin(
    clientX: number,
    clientY: number,
  ): { rowIndex: number; cursorBin: number } | null {
    const el = rasterElement.value
    if (!el || rowBins.length === 0) return null
    const boxHeightPx = wfDataHeightPx.value
    if (boxHeightPx <= 0) return null
    const pxPerRow = boxHeightPx / rowCapacity
    const rect = el.getBoundingClientRect()
    const rowIndex = Math.floor((clientY - rect.top - wfDataTopPx.value) / pxPerRow)
    if (rowIndex < 0 || rowIndex >= rowBins.length) return null

    const freqHz = clientXToFreqHz(el, clientX)
    if (freqHz === null) return null
    return { rowIndex, cursorBin: Math.round((freqHz - firstBinHz()) / hzPerBin()) }
  }

  /** Detects the signal (if any) under a raster-relative point, walking both
   *  its frequency edges (in the row under the cursor) and its time extent
   *  (across the retained row history). Null when there is nothing there, or
   *  when detection wouldn't mean anything right now (paused/sweeping/no
   *  history yet). */
  function computeSignalMarkerAtPoint(
    clientX: number,
    clientY: number,
  ): DetectedSignalMarker | null {
    if (
      !source.displayWaterfallTimestamps ||
      !source.playing ||
      source.displayPaused ||
      sweeping.value
    )
      return null
    const point = pointToRowAndBin(clientX, clientY)
    if (!point) return null
    const { rowIndex, cursorBin } = point
    const cursorRow = rowBins[rowIndex]
    /* v8 ignore start -- defensive: pointToRowAndBin just bounds-checked rowIndex
     * against rowBins.length synchronously above, so rowBins[rowIndex] can't be
     * undefined here. */
    if (!cursorRow) return null
    /* v8 ignore stop */

    const edges = findSignalEdges(cursorRow, cursorBin)
    if (!edges) return null
    const extent = findTimeExtent(rowBins, edges.loBin, edges.hiBin, rowIndex)
    /* v8 ignore start -- defensive: extent is derived from the same row and the
     * same [loBin,hiBin] that findSignalEdges just confirmed clears that row's
     * own noise floor at the default threshold, so findTimeExtent's own
     * "does the cursor row contain the signal" check is guaranteed true. */
    if (!extent) return null
    /* v8 ignore stop */

    return {
      freqLoHz: firstBinHz() + edges.loBin * hzPerBin(),
      freqHiHz: firstBinHz() + edges.hiBin * hzPerBin(),
      startMs: rowPushTimesMs[extent.oldestRowIndex] as number,
      // Row 0 is the newest/live row — the signal touching it means it hasn't
      // ended yet, so there is no end time to show.
      endMs: extent.newestRowIndex === 0 ? null : (rowPushTimesMs[extent.newestRowIndex] as number),
    }
  }

  /** True while `(cursorBin, rowIndex)` still falls inside `marker`'s current
   *  frequency and row extent — i.e. the cursor hasn't left the box on screen
   *  yet, even if it's drifted off the exact row/bin last used to detect it. */
  function isPointWithinMarker(
    marker: DetectedSignalMarker,
    cursorBin: number,
    rowIndex: number,
  ): boolean {
    const cursorFreqHz = firstBinHz() + cursorBin * hzPerBin()
    if (cursorFreqHz < marker.freqLoHz || cursorFreqHz > marker.freqHiHz) return false
    const oldestRowIndex = rowIndexForTimeMs(marker.startMs)
    if (oldestRowIndex === null) return false
    const newestRowIndex = marker.endMs === null ? 0 : rowIndexForTimeMs(marker.endMs)
    /* v8 ignore start -- defensive: startMs's row is always older (so it ages
     * out of history no earlier) than endMs's row, and we've just confirmed
     * startMs's row is still present above — so endMs's row can't have aged
     * out while startMs's hasn't. */
    if (newestRowIndex === null) return false
    /* v8 ignore stop */
    return rowIndex >= newestRowIndex && rowIndex <= oldestRowIndex
  }

  function onWaterfallMouseMove(event: MouseEvent): void {
    const point = pointToRowAndBin(event.clientX, event.clientY)
    if (!point) {
      hoverSignalMarker.value = null
      return
    }
    const current = hoverSignalMarker.value
    if (
      current &&
      source.displayWaterfallTimestamps &&
      isPointWithinMarker(current, point.cursorBin, point.rowIndex)
    ) {
      // Still over the same signal's box. Try to refresh it (e.g. it may have
      // ended since we last looked), but a momentary noise dip in that fresh
      // detection must not blank out what's already correctly on screen —
      // THAT flicker was what made a signal hard to actually click. Only drop
      // the marker once the cursor genuinely leaves its box, checked above.
      hoverSignalMarker.value = computeSignalMarkerAtPoint(event.clientX, event.clientY) ?? current
      return
    }
    hoverSignalMarker.value = computeSignalMarkerAtPoint(event.clientX, event.clientY)
  }

  function onWaterfallMouseLeave(): void {
    hoverSignalMarker.value = null
  }

  /** Two markers are "the same signal" for pin/unpin purposes when their
   *  frequency extents overlap — good enough for a click to toggle the mark it
   *  visually landed on without also requiring an exact-pixel match. */
  function signalMarkersOverlap(
    first: { freqLoHz: number; freqHiHz: number },
    second: { freqLoHz: number; freqHiHz: number },
  ): boolean {
    return first.freqLoHz <= second.freqHiHz && second.freqLoHz <= first.freqHiHz
  }

  /** Clicking a live signal pins it; clicking an already-pinned one removes it. */
  function toggleSignalMarkerPin(marker: DetectedSignalMarker): void {
    const existingIndex = pinnedSignalMarkers.value.findIndex((pinned) =>
      signalMarkersOverlap(pinned, marker),
    )
    if (existingIndex !== -1) {
      pinnedSignalMarkers.value.splice(existingIndex, 1)
      return
    }
    pinnedSignalMarkers.value.push({ ...marker, id: nextSignalMarkerId++ })
  }

  /** Finds the retained row whose push time is exactly `ms` (start/end times
   *  always come from an actual row's recorded time) — null once that row has
   *  aged out of history, which is when the marker should stop rendering. */
  function rowIndexForTimeMs(ms: number): number | null {
    const index = rowPushTimesMs.indexOf(ms)
    return index === -1 ? null : index
  }

  /** Renders a detected/pinned marker's start (and, once known, end) time as
   *  labels positioned on their rows — reusing the exact clock-label look the
   *  interval markers above use, just with a start/end background colour. */
  function signalMarkerTimeLabels(
    marker: DetectedSignalMarker,
    keyPrefix: string,
  ): SignalMarkerLabel[] {
    const pxPerRow = wfDataHeightPx.value / rowCapacity
    const labels: SignalMarkerLabel[] = []
    const startRowIndex = rowIndexForTimeMs(marker.startMs)
    if (startRowIndex !== null) {
      labels.push({
        key: `${keyPrefix}-start`,
        topPx: Math.round(startRowIndex * pxPerRow),
        label: formatRowClock(marker.startMs),
        variant: 'start',
      })
    }
    if (marker.endMs !== null) {
      const endRowIndex = rowIndexForTimeMs(marker.endMs)
      if (endRowIndex !== null) {
        labels.push({
          key: `${keyPrefix}-end`,
          topPx: Math.round(endRowIndex * pxPerRow),
          label: formatRowClock(marker.endMs),
          variant: 'end',
        })
      }
    }
    return labels
  }

  // Only a PINNED (Shift+Click) signal ever shows its start/end times — merely
  // hovering renders nothing. hoverSignalMarker itself is still tracked (see
  // onWaterfallMouseMove) purely so a Shift+Click can pin the exact box the
  // operator is already looking at rather than re-detecting at the click
  // instant, which is what made a signal hard to reliably select before.
  const signalMarkerLabels = computed<SignalMarkerLabel[]>(() => {
    // Read the tick so labels re-derive (and drop off) as rows scroll down.
    void rowClockTick.value
    if (!source.displayWaterfallTimestamps) return []
    const labels: SignalMarkerLabel[] = []
    for (const pinned of pinnedSignalMarkers.value) {
      labels.push(...signalMarkerTimeLabels(pinned, `signal-pin-${pinned.id}`))
    }
    return labels
  })

  const visibleWaterfallSecondTicks = computed<WaterfallSecondTick[]>(() => {
    const occupiedTopPx = [
      ...waterfallTimeMarkers.value.map((marker) => marker.topPx),
      ...signalMarkerLabels.value.map((label) => label.topPx),
    ]
    if (occupiedTopPx.length === 0) return waterfallSecondTicks.value
    return waterfallSecondTicks.value.filter((tick) =>
      occupiedTopPx.every((topPx) => Math.abs(tick.topPx - topPx) > WF_TIME_LABEL_HALF_HEIGHT_PX),
    )
  })
  return {
    wfDataTopPx,
    wfDataHeightPx,
    hoverSignalMarker,
    recordRowPushTime,
    clearRowPushTimes,
    timeMarkerOverlayStyle,
    waterfallTimeMarkers,
    visibleWaterfallSecondTicks,
    signalMarkerLabels,
    computeSignalMarkerAtPoint,
    toggleSignalMarkerPin,
    onWaterfallMouseMove,
    onWaterfallMouseLeave,
  }
}
