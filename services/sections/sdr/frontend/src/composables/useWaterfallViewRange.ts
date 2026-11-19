/**
 * The waterfall's view range: the horizontal (frequency) zoom and the live
 * drag-pan offset that together decide which slice of the span is on screen,
 * and the Min/Max dB range shared by the spectrum trace and the waterfall
 * colour map — with the functions that push each onto the plots.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C15). The component's
 * sliders bind `zoom`, `zmin` and `zmax`; `useWaterfallPlots` watches them and
 * calls `applyZoom` / `applySpecRange`. Every overlay maps its frequencies
 * through `zoomWindowHz`, so the trace and overlays always agree on what's on
 * screen.
 */
import { ref, watch, type Ref } from 'vue'
import type { WaterfallPlotHandles } from '../waterfallPlotHandles'
import { HZ_PER_MHZ } from '../waterfallFrequencyTicks'

/** The parts of the SDR store the view range reads and restores from. */
export interface ViewRangeSource {
  readonly currentFreqHz: number
  /** Persisted zoom level (0 when never set). */
  readonly viewZoom: number
  readonly viewZmin: number
  readonly viewZmax: number
  /** True until the operator first moves Min or Max. */
  readonly viewAutoScale: boolean
}

/** What the component hands the view range. */
export interface WaterfallViewRangeOptions {
  source: ViewRangeSource
  plots: WaterfallPlotHandles
  spanStartHz: Readonly<Ref<number>>
  spanEndHz: Readonly<Ref<number>>
}

/** The view range, as the component and the other composables use it. */
export interface WaterfallViewRange {
  zoom: Ref<number>
  livePanOffsetHz: Ref<number>
  zmin: Ref<number>
  zmax: Ref<number>
  /** True until a Min/Max slider is moved: the waterfall colour map auto-scales. */
  autoScale: Ref<boolean>
  zoomWindowHz: (lo: number, hi: number) => { winLo: number; winHi: number }
  applyZoom: () => void
  applySpecRange: (lo: number, hi: number) => void
  /**
   * Stops the slider just moved one dB short of the other when they cross.
   * @returns True when it clamped (the range is not valid yet).
   */
  clampSliderCollision: (lo: number, hi: number) => boolean
}

/** 1 = full span (no zoom). */
export const ZOOM_MIN = 1
/** The tightest zoom. */
export const ZOOM_MAX = 50

// ── Spectrum dB axis — driven live by the Min/Max sliders (SDR++ behaviour) ──
// The backend emits dBFS (0 dB = full-scale tone — see sentinel_radio/services/sdr.py).
// SDR++ Min/Max move both the spectrum y-axis AND the waterfall colour range
// (User Guide v1.1, pp. 30-31); the per-device range below only seeds the
// initial slider values. The watcher on [zmin, zmax] calls
// specPlot.change_settings({ ymin, ymax }) at runtime — sigplot supports this
// (see node_modules/sigplot/js/sigplot.js lines 2039-2074).
//
// Ranges should divide cleanly by 20 dB so sigplot's tick steps land on the
// ymax/ymin endpoints (otherwise the bottom label sits outside the data box).
// ydiv is recomputed live from (max - min) / 20 in applySpecRange().
export type SdrDeviceId = 'rtl_tcp' | 'hackrf' | 'airspy' | 'sdrplay'
const DEVICE_DB_RANGE: Record<SdrDeviceId, { ymin: number; ymax: number }> = {
  rtl_tcp: { ymin: -100, ymax: 0 }, // 8-bit IQ (only device wired today)
  hackrf: { ymin: -100, ymax: 0 }, // 8-bit IQ  — placeholder
  airspy: { ymin: -120, ymax: 0 }, // 12-bit IQ — placeholder
  sdrplay: { ymin: -140, ymax: 0 }, // 14-bit IQ — placeholder
}
const ACTIVE_DEVICE: SdrDeviceId = 'rtl_tcp'
/** The spectrum's default dB floor (the active device's). */
export const SPEC_YMIN_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymin
/** The spectrum's default dB ceiling (the active device's). */
export const SPEC_YMAX_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymax

/** Builds the view range for one waterfall. */
export function useWaterfallViewRange({
  source,
  plots,
  spanStartHz,
  spanEndHz,
}: WaterfallViewRangeOptions): WaterfallViewRange {
  // ── Min / Max (SDR++ semantics) ──────────────────────────────────────────────
  // Per the SDR++ User Guide v1.1 (Dec 2022) pages 30-31, Min and Max "select
  // the high and low points for the signal strength shown on the spectrum —
  // effectively the top and bottom range" AND drive the waterfall colour map.
  // So both sliders move the spectrum trace y-axis (specPlot.ymin/ymax) and the
  // waterfall z-axis (wfPlot.zmin/zmax) in lockstep.
  //
  // Defaults come from the per-device DEVICE_DB_RANGE table below (e.g. -100..0
  // for an 8-bit RTL-SDR — the dBFS dynamic range of the ADC). The waterfall
  // starts in auto-scale (autol) so it always has contrast on first frame; the
  // first slider drag switches it to the fixed range.
  const zmin = ref(0) // seeded from DEVICE_DB_RANGE below
  const zmax = ref(0)
  const autoScale = ref(true)
  // ── Zoom — horizontal (frequency) zoom into the selected frequency ───────────
  // 1 = full span (no zoom); ZOOM_MAX = tightest. The visible window is the full
  // span / zoom, centred on the SELECTED (tuned) frequency — source.currentFreqHz,
  // which may sit anywhere in the span when auto-centre is off — and applied to
  // BOTH plots so the spectrum and waterfall stay aligned. SigPlot's
  // zoom({x},{x}, continuous:true) updates the current zoom level in place (no
  // zoom-stack growth); zoom === 1 calls unzoom() to restore the full-span view.
  // Restore the persisted zoom level (kept in the store so it survives leaving
  // and re-entering the SDR section), clamped to the valid range; default to
  // full span when unset.
  const zoom = ref(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, source.viewZoom || ZOOM_MIN)))

  // Live drag-pan offset (Hz). While the user drags the freq gutter, this slides
  // the visible window WITHOUT retuning — see useFrequencyDrag. Folded into
  // zoomWindowHz below so applyZoom + all overlay computeds shift together. 0 when
  // not panning. Declared before zoomWindowHz (its consumer) so the closure binds.
  const livePanOffsetHz = ref(0)

  // The visible (zoom-aware, pan-aware) frequency window for the current span.
  // Centred on the selected frequency (zoom-clamped to the span edges), then the
  // live drag-pan offset is added AFTER the clamp. The zoom clamp keeps a
  // zoomed-in browse window inside the data; the pan offset is intentionally NOT
  // clamped so a freq-axis drag can slide the window past the span edges (the
  // trailing edge shows empty until the committed hardware retune fills it in —
  // the "grab and scroll" feel). At zoom <= 1 the base is the full span, so the
  // only way to move the window is the pan offset. Single source of truth for
  // applyZoom() AND every overlay computed (visibleBands / freqTicks /
  // visibleKnownFreqs / tuneToClientX) so the trace and overlays always agree on
  // what's on screen.
  function zoomWindowHz(lo: number, hi: number): { winLo: number; winHi: number } {
    /* v8 ignore start -- every caller already guards `hi <= lo` before calling
     (visibleBands/freqTicks/visibleKnownFreqs/applyZoom/tuneToClientX/
     tryStartFreqDrag), so this defensive early-out is never reached. */
    if (hi <= lo) return { winLo: lo, winHi: hi }
    /* v8 ignore stop */
    // Base window width: full span at zoom <= 1, else span / zoom.
    const win = zoom.value <= ZOOM_MIN ? hi - lo : (hi - lo) / zoom.value
    const halfWin = win / 2
    // Base centre: span midpoint at zoom <= 1 (full span), else the selected freq.
    const sel = zoom.value <= ZOOM_MIN ? (lo + hi) / 2 : source.currentFreqHz || (lo + hi) / 2
    // Zoom clamp: keep [centre-halfWin, centre+halfWin] inside [lo, hi].
    const clamped = Math.min(hi - halfWin, Math.max(lo + halfWin, sel))
    // Live pan offset is added AFTER the clamp so the drag can slide past edges.
    const center = clamped + livePanOffsetHz.value
    return { winLo: center - halfWin, winHi: center + halfWin }
  }

  function applyZoom() {
    const lo = spanStartHz.value
    const hi = spanEndHz.value
    if (hi <= lo) return
    // Zoom is a pure viewport change — sigplot.zoom() re-windows the existing
    // raster in place. Do NOT rebuild the pipe here: that would wipe the
    // waterfall history. Historical rows simply stretch across the new viewport.
    //
    // Take the windowed path when either zoomed in OR live-panning (a drag-pan at
    // zoom 1 still needs a real window so the slid view survives sigplot's
    // per-frame reload — see the level>=1 note below). Only when fully unzoomed
    // AND not panning do we restore the full-span base view.
    if (zoom.value <= ZOOM_MIN && livePanOffsetHz.value === 0) {
      try {
        plots.spectrum?.unzoom()
      } catch {
        /* noop */
      }
      try {
        plots.waterfall?.unzoom()
      } catch {
        /* noop */
      }
      return
    }
    // Window centred on the selected frequency, clamped to the span edges.
    const { winLo: x1Hz, winHi: x2Hz } = zoomWindowHz(lo, hi)
    // The two plots are in DIFFERENT x-units (see the accordion note in useBandwidthBracketDrag):
    // spectrum layer x is MHz (xstart=xstartMHz), waterfall layer x is Hz. Pass
    // each plot its own units — otherwise the spectrum zooms to a window outside
    // its data range and renders blank.
    const x1MHz = x1Hz / HZ_PER_MHZ
    const x2MHz = x2Hz / HZ_PER_MHZ
    // The zoomed window MUST live on a zoom level ABOVE the base (Mx.level >= 1).
    // sigplot's reload() (spectrum, every animation frame) and push() (waterfall,
    // every frame) re-run scale_base() — which overwrites stk[Mx.level] with the
    // full data span — but ONLY when Mx.level === 0 (sigplot.js:2225 / :2326). If
    // we zoom in continuous mode while still at level 0, our off-centre window is
    // written into stk[0] and the very next frame flattens it back to the full
    // span: the visible symptom is the view snapping to the span centre.
    //
    // So: unzoom to the base level first, then do a NON-continuous zoom. With
    // continuous:false sigplot PUSHES a new level (sigplot.js:3304-3312), leaving
    // Mx.level >= 1 where reload()/push() won't touch the window. Re-running this
    // on every slider tick keeps the stack one level deep (unzoom pops back to 0).
    // y left undefined => keep the full vertical (dB / history) range.
    try {
      plots.spectrum?.unzoom()
    } catch {
      /* noop */
    }
    try {
      plots.waterfall?.unzoom()
    } catch {
      /* noop */
    }
    try {
      plots.spectrum?.zoom({ x: x1MHz }, { x: x2MHz }, false)
    } catch {
      /* noop */
    }
    try {
      plots.waterfall?.zoom({ x: x1Hz }, { x: x2Hz }, false)
    } catch {
      /* noop */
    }
  }
  // Seed the sliders with the device's default range — must happen after both
  // the refs (above) and the DEVICE_DB_RANGE constants are declared. If the user
  // previously set a custom range this session (persisted in the store so it
  // survives navigating away from SDR and back), restore that instead so the
  // Zoom/Max/Min settings persist. autoScale is the authoritative "a slider was
  // touched" flag (defaults true, set false by the [zmin, zmax] watcher), so it
  // alone decides whether to restore. Do NOT also gate on the dB values being
  // non-zero: 0 dB is a legitimate endpoint (SPEC_YMAX_DB === 0, the default Max),
  // so adjusting only the Min slider leaves the persisted Max at 0 — a `zmax !== 0`
  // guard would then wrongly discard the restore and revert Min to its default.
  if (!source.viewAutoScale) {
    zmin.value = source.viewZmin
    zmax.value = source.viewZmax
    autoScale.value = false
  } else {
    zmin.value = SPEC_YMIN_DB
    zmax.value = SPEC_YMAX_DB
  }

  // Apply a (min, max) dB range to BOTH plots: spectrum trace y-axis and
  // waterfall colour map. ydiv is recomputed so tick steps land on endpoints
  // (sigplot pins dtic1 = ymin when ydiv is negative — see initPlots in useWaterfallPlots for the
  // rationale). Called from the [zmin, zmax] watcher.
  function applySpecRange(lo: number, hi: number) {
    /* v8 ignore start -- the only caller (the [zmin, zmax] watcher) takes the
     hi <= lo branch first and returns, so applySpecRange always gets hi > lo. */
    if (!(hi > lo)) return
    /* v8 ignore stop */
    const span = hi - lo
    const ydiv = -Math.max(1, Math.round(span / 20))
    try {
      plots.spectrum?.change_settings({ ymin: lo, ymax: hi, ydiv })
    } catch {
      /* noop */
    }
    try {
      plots.waterfall?.change_settings({ autol: -1, zmin: lo, zmax: hi })
    } catch {
      /* noop */
    }
  }

  // Track which slider the user moved last so the collision guard knows which
  // one to clamp. SDR++ keeps the stationary slider fixed and stops the moving
  // one short of it (Min raised into Max stops at Max-1, not bumping Max upward).
  // Registered before useWaterfallPlots' combined [zmin, zmax] watcher, so these
  // always run first and lastTouched is set by the time it asks.
  let lastTouched: 'min' | 'max' | null = null
  watch(zmin, () => {
    lastTouched = 'min'
  })
  watch(zmax, () => {
    lastTouched = 'max'
  })

  function clampSliderCollision(lo: number, hi: number): boolean {
    if (hi > lo) return false
    // The user dragged one slider past the other: clamp the moving slider to
    // leave a 1 dB gap, leaving the stationary one untouched. SDR++ behaviour —
    // see User Guide v1.1 p. 31 (Min/Max are independent endpoints; raising Min
    // into Max does not push Max). A zmin/zmax change always fires its own
    // watch(zmin)/watch(zmax) first, so lastTouched is always 'min' or 'max' here.
    if (lastTouched === 'min') {
      zmin.value = hi - 1
    } else {
      zmax.value = lo + 1
    }
    return true
  }

  return {
    zoom,
    livePanOffsetHz,
    zmin,
    zmax,
    autoScale,
    zoomWindowHz,
    applyZoom,
    applySpecRange,
    clampSliderCollision,
  }
}
