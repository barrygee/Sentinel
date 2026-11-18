/**
 * Tuning the waterfall from the plot: click-to-tune, drag-to-pan along the
 * spectrum's frequency gutter (mouse and touch) and scroll-to-pan with the
 * mouse wheel.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C13). The component still
 * owns the plots, the span/zoom state, the live pan offset (folded into its
 * visible window) and the plot's mousedown/mouseup router, which decides
 * whether a press is a marker, a bracket drag, a signal pin, a pan or a click;
 * it calls in here for the pan and the tune.
 */
import { ref, type Ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'

/** The parts of the SDR store tuning reads and writes. */
export interface FrequencyTuningSource {
  readonly playing: boolean
  /** A follower mirrors the owner's tuning and must never retune. */
  readonly readOnly: boolean
  readonly autoCenterWaterfallOnTune: boolean
  setTuningOffsetHz: (offsetHz: number) => void
  requestTune: (freqHz: number, center?: boolean) => void
}

/** What the component hands the tuning gestures. */
export interface FrequencyDragOptions {
  source: FrequencyTuningSource
  /** The spectrum plot's element, read on use (the component declares its ref later). */
  spectrumElement: () => HTMLElement | null
  spanStartHz: Readonly<Ref<number>>
  spanEndHz: Readonly<Ref<number>>
  /** The data box's left/right gutters in CSS pixels. */
  bandInsetLeftPx: Readonly<Ref<number>>
  bandInsetRightPx: Readonly<Ref<number>>
  /** Height of the frequency-label gutter under the spectrum: the grabbable strip. */
  bandInsetBottomPx: Readonly<Ref<number>>
  /** Slides the visible window without retuning; the component resets it when the retuned frame lands. */
  livePanOffsetHz: Ref<number>
  /** The visible window inside the span at the current zoom (and live pan). */
  zoomWindowHz: (spanStartHz: number, spanEndHz: number) => { winLo: number; winHi: number }
  /** Snaps a frequency onto a nearby known-frequency marker (identity when none is close). */
  snapToKnownFreqHz: (freqHz: number) => number
  /** Re-windows the plots and re-pins the tuning bar after the live pan offset moves. */
  applyView: () => void
}

/** A mouse/touch position, minimal: MouseEvent and Touch both satisfy it. */
export type DragPoint = { clientX: number; clientY: number }

/** The tuning gestures, as the component uses them. */
export interface FrequencyDrag {
  /** True while a gutter drag or a wheel burst is panning: drives the grabbing cursor. */
  freqDragging: Ref<boolean>
  /** True while a gutter drag is held (not a wheel burst). */
  isFreqDragActive: () => boolean
  tryStartFreqDrag: (point: DragPoint) => boolean
  abortFreqDrag: () => void
  onPlotWheel: (event: WheelEvent) => void
  /** Click-to-tune: tunes to the frequency under `clientX` across `plotElement`'s data box. */
  tuneToClientX: (plotElement: HTMLElement, clientX: number) => void
}

/** How long after the last wheel tick the burst's retune is committed. */
export const WHEEL_COMMIT_DELAY_MS = 250
/** One wheel notch pans this fraction of the visible window. */
export const WHEEL_STEP_FRACTION = 0.12

/** Builds the click, drag and wheel tuning for one waterfall. */
export function useFrequencyDrag({
  source,
  spectrumElement,
  spanStartHz,
  spanEndHz,
  bandInsetLeftPx,
  bandInsetRightPx,
  bandInsetBottomPx,
  livePanOffsetHz,
  zoomWindowHz,
  snapToKnownFreqHz,
  applyView,
}: FrequencyDragOptions): FrequencyDrag {
  // ── Drag-to-pan the frequency axis ─────────────────────────────────────────
  // Grabbing the freq-number gutter below the spectrum and dragging left/right
  // scrolls the visible window across the radio's tuning range — like dragging a
  // map. Dragging RIGHT slides the spectrum content RIGHT (the labels follow the
  // cursor); the tuning bar stays pinned at its screen position (span centre).
  //
  // The drag is a PURELY LOCAL viewport pan for instant feedback: each rAF tick
  // sets livePanOffsetHz (folded into zoomWindowHz) and re-windows the existing
  // raster via applyView() — NO retune, no currentFreqHz change, so the bar never
  // jumps. The hardware retune is committed ONCE on mouseup (move the hardware
  // centre to the final panned frequency), and the live offset is held until the
  // new span frame lands so there's no snap-back (the component resets it when
  // frame.center_hz changes).
  let freqDragActive = false
  // Reactive mirror of freqDragActive — drives the grabbing-cursor class on the
  // spectrum so the user gets feedback while panning the frequency axis.
  const freqDragging = ref(false)
  let freqDragStartX = 0
  let freqDragStartCenterHz = 0
  let freqDragHzPerPx = 0
  // Last raw (unclamped) pointer dx, stashed by mousemove and consumed by the rAF
  // flush (live preview) and by mouseup (commit).
  let freqDragDx = 0
  let freqDragRaf = 0

  function freqDragFlush() {
    freqDragRaf = 0
    // The document mouseup that ends a pan both clears freqDragActive AND cancels
    // this rAF, so a flush can never run with the flag already false.
    /* v8 ignore start */
    if (!freqDragActive) return
    /* v8 ignore stop */
    // Drag right (dx > 0) → window freqs decrease → content moves right.
    livePanOffsetHz.value = -freqDragDx * freqDragHzPerPx
    applyView()
  }

  // Returns true (and arms the pan) when the mousedown/touchstart lands in the
  // bottom freq-label gutter of the spectrum element. Called from the plot's
  // capture-phase mousedown/touchstart handler so it reliably intercepts before
  // sigplot's canvas listener.
  function tryStartFreqDrag(point: DragPoint): boolean {
    // Followers mirror the owner's tuning — don't let a freq-axis pan retune here.
    if (!source.playing || source.readOnly) return false
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    if (hi <= lo) return false
    const element = spectrumElement()
    // The capture handler that calls this only fires while the spectrum element is
    // mounted, so it is always populated here.
    /* v8 ignore start */
    if (!element) return false
    /* v8 ignore stop */
    const rect = element.getBoundingClientRect()
    // The grabbable strip is the freq-label gutter at the bottom of the spectrum
    // element (height = bandInsetBottomPx). A mousedown above it is a normal
    // click-to-tune / marker interaction.
    const gutterTop = rect.bottom - bandInsetBottomPx.value
    if (bandInsetBottomPx.value <= 0 || point.clientY < gutterTop) return false
    const dataWidth = element.clientWidth - bandInsetLeftPx.value - bandInsetRightPx.value
    if (dataWidth <= 0) return false
    // Pixel→Hz uses the VISIBLE (zoom-aware) window so the drag tracks the
    // on-screen scale, not the full hardware span. Capture BEFORE arming the
    // drag so zoomWindowHz sees the pre-pan offset.
    const { winLo, winHi } = zoomWindowHz(lo, hi)
    freqDragHzPerPx = (winHi - winLo) / dataWidth
    freqDragStartX = point.clientX
    freqDragStartCenterHz = (lo + hi) / 2
    freqDragDx = 0
    freqDragActive = true
    freqDragging.value = true
    return true
  }

  function stopFreqDrag(): void {
    freqDragActive = false
    freqDragging.value = false
    if (freqDragRaf) {
      cancelAnimationFrame(freqDragRaf)
      freqDragRaf = 0
    }
  }

  // Commit the hardware retune ONCE, to the final panned centre using the RAW
  // (unclamped) drag so a fling past the loaded span still retunes there. Shared
  // by the mouseup and touchend listeners below — a freq-axis pan means "move the
  // hardware centre", so force auto-centre semantics (clear the demod offset),
  // mirroring the click-to-tune ON path.
  function commitFreqDrag(): void {
    stopFreqDrag()
    const finalCenterHz = Math.round(freqDragStartCenterHz - freqDragDx * freqDragHzPerPx)
    // Keep livePanOffsetHz in place (no snap-back); the component resets it to 0
    // when the new span frame (centred on finalCenterHz) arrives.
    // center=true forces the hardware-centre retune even with auto-centre OFF —
    // otherwise the panned view would stay stuck (no new frames ever arrive).
    source.setTuningOffsetHz(0)
    source.requestTune(finalCenterHz, true)
  }

  // Abort an in-progress freq-axis pan WITHOUT committing — for a cancelled
  // touch gesture (touchcancel, e.g. an OS interruption) or the window losing
  // focus mid-drag, where the last pointer position can't be trusted.
  function abortFreqDrag(): void {
    if (!freqDragActive) return
    stopFreqDrag()
    livePanOffsetHz.value = 0
    applyView()
  }

  useDocumentEvent('mousemove', (event: Event) => {
    if (!freqDragActive) return
    freqDragDx = (event as MouseEvent).clientX - freqDragStartX
    // Throttle the viewport re-window to one per animation frame.
    if (!freqDragRaf) freqDragRaf = requestAnimationFrame(freqDragFlush)
  })

  useDocumentEvent('mouseup', () => {
    if (!freqDragActive) return
    commitFreqDrag()
  })

  // Touch equivalents of the two listeners above. touchmove must be non-passive
  // so preventDefault() can stop the page from scrolling vertically while the
  // user is panning the frequency axis horizontally (see also `touch-action:
  // none` on .sdr-wf-spectrum in SdrWaterfall.css, which avoids the scroll ever
  // starting in the first place — this preventDefault is belt-and-braces for
  // browsers that still send the event before honouring touch-action).
  useDocumentEvent(
    'touchmove',
    (event: Event) => {
      if (!freqDragActive) return
      const touchEvent = event as TouchEvent
      const touch = touchEvent.touches[0]
      /* v8 ignore start -- a single-finger drag always has one active touch */
      if (!touch) return
      /* v8 ignore stop */
      touchEvent.preventDefault()
      freqDragDx = touch.clientX - freqDragStartX
      if (!freqDragRaf) freqDragRaf = requestAnimationFrame(freqDragFlush)
    },
    { passive: false },
  )

  useDocumentEvent('touchend', () => {
    if (!freqDragActive) return
    commitFreqDrag()
  })

  // Interrupted gesture (e.g. the OS takes over for a system swipe) — abort
  // rather than commit, since the last touch position may not reflect user
  // intent.
  useDocumentEvent('touchcancel', () => {
    abortFreqDrag()
  })

  // ── Mouse-wheel pan ────────────────────────────────────────────────────────
  // Scrolling the wheel over the spectrum/waterfall pans the frequency window the
  // same way the gutter drag does — reusing the live pan offset. Wheel events
  // arrive in bursts with no "release", so the running offset accumulates per
  // tick (instant local feedback) and the hardware retune is committed once,
  // debounced after the last tick. Scroll UP → pan toward HIGHER frequency
  // (window centre increases); scroll DOWN → lower.
  let wheelPanCenterHz = 0 // running committed-centre target during a burst
  let wheelPanActive = false
  let wheelCommitTimer: ReturnType<typeof setTimeout> | null = null
  let wheelRaf = 0

  function wheelFlush() {
    wheelRaf = 0
    // The debounced commit clears wheelPanActive AND cancels this rAF, and
    // onPlotWheel only schedules the flush once hi > lo — so neither guard's
    // early-out is reachable from a live flush.
    /* v8 ignore start */
    if (!wheelPanActive) return
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    if (hi <= lo) return
    /* v8 ignore stop */
    // Offset relative to the live span centre (same basis as the drag).
    livePanOffsetHz.value = wheelPanCenterHz - (lo + hi) / 2
    applyView()
  }

  function onPlotWheel(event: WheelEvent) {
    // Followers mirror the owner's tuning — don't let the scroll-to-tune wheel retune.
    if (!source.playing || source.readOnly) return
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    if (hi <= lo) return
    // Take over the wheel from sigplot's own (window-level) handler.
    event.preventDefault()
    event.stopImmediatePropagation()
    // Per-notch step is a fraction of the visible (zoom-aware) window. A standard
    // mouse notch is deltaY≈±100 (deltaMode 0, pixels) or ±1..3 (deltaMode 1,
    // lines); normalise both to "notches" so a precision/trackpad scroll moves
    // proportionally and a chunky mouse wheel moves one notch per click.
    const { winLo, winHi } = zoomWindowHz(lo, hi)
    const windowWidthHz = winHi - winLo
    const notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaY / 100
    const stepHz = windowWidthHz * WHEEL_STEP_FRACTION * notches
    if (!wheelPanActive) {
      wheelPanActive = true
      wheelPanCenterHz = (lo + hi) / 2 + livePanOffsetHz.value
    }
    // Scroll up (deltaY < 0) → higher freq → centre increases, so SUBTRACT stepHz.
    wheelPanCenterHz -= stepHz
    freqDragging.value = true // reuse the grabbing-cursor affordance
    if (!wheelRaf) wheelRaf = requestAnimationFrame(wheelFlush)
    // Debounced single hardware commit after the burst settles.
    if (wheelCommitTimer) clearTimeout(wheelCommitTimer)
    wheelCommitTimer = setTimeout(() => {
      wheelCommitTimer = null
      wheelPanActive = false
      freqDragging.value = false
      if (wheelRaf) {
        cancelAnimationFrame(wheelRaf)
        wheelRaf = 0
      }
      // Keep livePanOffsetHz held until the new centred frame lands, so no
      // snap-back. center=true forces the retune.
      source.setTuningOffsetHz(0)
      source.requestTune(Math.round(wheelPanCenterHz), true)
    }, WHEEL_COMMIT_DELAY_MS)
  }

  // ── Click-to-tune ──────────────────────────────────────────────────────────
  function tuneToClientX(plotElement: HTMLElement, clientX: number): void {
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    if (hi <= lo) return
    const rect = plotElement.getBoundingClientRect()
    const dataLeft = rect.left + bandInsetLeftPx.value
    const dataWidth = rect.width - bandInsetLeftPx.value - bandInsetRightPx.value
    if (dataWidth <= 0) return
    const fraction = Math.min(1, Math.max(0, (clientX - dataLeft) / dataWidth))
    // Account for an active horizontal zoom: map the fraction within the visible
    // window, not the full span, so a click lands on what the user sees.
    const { winLo, winHi } = zoomWindowHz(lo, hi)
    // Snap to a known frequency when the click lands near its marker, so clicking a
    // known freq jumps straight to it (no-op when snapping is off / none in range).
    const freqHz = snapToKnownFreqHz(Math.round(winLo + fraction * (winHi - winLo)))
    // If a freq-axis pan is still held (livePanOffsetHz != 0, awaiting the new
    // centred frame), a click commits a fresh tune INSIDE the displayed window.
    // freqHz was already computed in the offset-shifted window, so clear the
    // offset now: the tuning bar must NOT add it again (that would draw the bar
    // offset from the clicked pixel). The retune below fetches a frame centred on
    // freqHz, which lands the window correctly.
    if (livePanOffsetHz.value !== 0) livePanOffsetHz.value = 0
    if (source.autoCenterWaterfallOnTune) {
      // Auto-centre ON: retune the hardware so the clicked freq becomes the new
      // span centre. Clear any prior demod offset — the bar returns to centre.
      source.setTuningOffsetHz(0)
    } else {
      // Auto-centre OFF: keep the hardware where it is; the audio NCO offset
      // (clicked − hardware centre) demodulates the clicked freq instead. The
      // hardware centre is the live frame centre (midpoint of the full span),
      // NOT currentFreqHz (the demod target, which may already be off-centre).
      const hardwareCenterHz = (lo + hi) / 2
      source.setTuningOffsetHz(Math.round(freqHz - hardwareCenterHz))
    }
    // Both paths go through requestTune so the panel updates the displayed freq
    // (currentFreqHz / readout / input) and the marker follows. The panel skips
    // the hardware retune when auto-centre is OFF (offset handles the audio).
    source.requestTune(freqHz)
  }

  return {
    freqDragging,
    isFreqDragActive: () => freqDragActive,
    tryStartFreqDrag,
    abortFreqDrag,
    onPlotWheel,
    tuneToClientX,
  }
}
