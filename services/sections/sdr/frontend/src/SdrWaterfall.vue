<script setup lang="ts">
import './SdrWaterfall.css'
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import sigplot, { type Plot } from 'sigplot'
// sigplot's trimlabel() appends a trailing "." to integer tick labels (mx.js
// ~line 4248). It's a private closure-scoped function, so the only seam is to
// patch the shared mx.text() draw function and strip the trailing dot when the
// label is an integer-with-dot (e.g. "-30." → "-30").
// @ts-expect-error – sigplot has no published .d.ts for its internal mx module.
import mx from 'sigplot/js/mx'

// Hide the top + right edges of the plot's axis box by suppressing the
// outer box draw (`noaxisbox: true`) and redrawing only the bottom + left
// edges after sigplot's original drawaxis finishes.
const _origDrawaxis = mx.drawaxis
mx.drawaxis = function (
  Gx: unknown,
  Mx: {
    stk: Array<{ x1: number; y1: number; x2: number; y2: number }>
    level: number
    active_canvas: HTMLCanvasElement
    fg: string
    bg: string
    width: number
    height: number
  },
  xdiv: number,
  ydiv: number,
  xlab: number,
  ylab: number,
  flags: {
    noaxisbox?: boolean
    exactbox?: boolean
    grid?: boolean | string
    noxtics?: boolean
    noytics?: boolean
    noxtlab?: boolean
    noytlab?: boolean
    noxplab?: boolean
    noyplab?: boolean
  },
) {
  // Waterfall identifier: fg == bg (we set both to BG so axis chrome is
  // invisible while still reserving the gutter for layout alignment with the
  // spectrum). Suppress grid AND tick stubs on it — the spectrum carries the
  // freq labels and grid; the waterfall just needs the raster painted.
  // change_settings({ grid: false, gridStyle }) doesn't reach mx.tics' tick-
  // stub path (it draws stubs in Mx.fg regardless), so we patch at the source.
  const isWaterfall = typeof Mx?.fg === 'string' && Mx.fg === Mx.bg
  if (isWaterfall) {
    flags.noxtics = true
    flags.noytics = true
    flags.noxtlab = true
    flags.noytlab = true
    flags.noxplab = true
    flags.noyplab = true
    flags.grid = false
  }
  const userWantsBox = !flags.noaxisbox && !isWaterfall
  flags.noaxisbox = true
  const ret = _origDrawaxis.call(this, Gx, Mx, xdiv, ydiv, xlab, ylab, flags)
  if (userWantsBox) {
    const stk1 = Mx.stk[Mx.level]
    let iscl: number, isct: number, iscr: number, iscb: number
    if (flags.exactbox) {
      iscl = Math.floor(stk1.x1)
      isct = Math.floor(stk1.y1)
      iscr = Math.floor(stk1.x2)
      iscb = Math.floor(stk1.y2)
    } else {
      iscl = Math.max(Math.floor(stk1.x1) - 2, 0)
      isct = Math.max(Math.floor(stk1.y1) - 2, 0)
      iscr = Math.min(Math.floor(stk1.x2) + 2, Mx.width)
      iscb = Math.min(Math.floor(stk1.y2) + 2, Mx.height)
    }
    // Bottom + left only — top + right are intentionally skipped.
    mx.textline(Mx, iscr, iscb, iscl, iscb)
    mx.textline(Mx, iscl, iscb, iscl, isct)
  }
  return ret
}
const _origMxText = mx.text
mx.text = function (
  Mx: {
    b: number
    l: number
    text_h: number
    text_w: number
    canvas?: HTMLCanvasElement
    active_canvas?: HTMLCanvasElement
    font?: { font?: string }
  },
  x: number,
  y: number,
  lbl: string,
  color?: string,
) {
  // SigPlot draws an x-axis OFFSET CAPTION ("<window-start> +Δ <delta-per-div>",
  // e.g. "314.8 +Δ 0.1") at the bottom-left of the data box whenever it switches
  // the x-axis to offset notation. We render our own per-tick HTML frequency
  // labels (.sdr-wf-freq-label), so this caption is redundant — and on small
  // screens it collides with the bottom y-axis dB label. Suppress it (the "Δ"
  // glyph is unique to this caption; real tick labels are plain numbers).
  if (typeof lbl === 'string' && lbl.includes('Δ')) return
  // X-axis numeric tick labels: (a) nudge down so the gap matches the
  // y-axis label gap (Mx.b setter in installMarginTweaks reserves the room),
  // (b) re-centre on the tick. Sigplot positions labels assuming monospace
  // (mx.js:3186: x = tick − round(len/2)*text_w, where text_w = width of 'M')
  // but we use Barlow (proportional), so digit widths ≠ text_w and labels
  // drift left of their ticks. Measure the actual label width and centre.
  // The tick x = caller's x + round(lbl.length / 2) * text_w (inverse of
  // sigplot's offset).
  // Identify x-axis tick labels by their y position (drawn in the gutter below
  // the data box at Mx.b). DON'T gate on x >= Mx.l: sigplot offsets the label
  // x leftward by half-text-width from the tick, so the leftmost tick's label
  // x is just outside Mx.l — excluding it would leave the first label
  // un-centered (drifts to the left edge of the data box).
  const isXAxisLabel =
    typeof lbl === 'string' &&
    /^-?\d+\.?\d*$/.test(lbl.trim()) &&
    typeof Mx?.b === 'number' &&
    typeof Mx?.text_h === 'number' &&
    y > Mx.b + Mx.text_h * 0.5 &&
    y < Mx.b + Mx.text_h * 2
  // Capture the ORIGINAL label length before any rewrite — sigplot used this
  // length to compute the x it passed in (x = tick − round(origLen/2)*text_w),
  // so recovering the tick position must use the same length. Rewriting first
  // and then using lbl.length here would offset the tick by ±text_w whenever
  // the rewrite changes the character count (e.g. "124." → "124.0").
  const _origLen = typeof lbl === 'string' ? lbl.length : 0
  if (typeof lbl === 'string' && /^-?\d+\.$/.test(lbl.trim())) {
    // sigplot's trimlabel() appends a trailing "." to integer tick labels.
    // On the x-axis (MHz) keep one decimal place ("344." → "344.0") so labels
    // read consistently as MHz; elsewhere (y-axis dB) strip the dot.
    lbl = isXAxisLabel ? lbl.replace(/\.$/, '.0') : lbl.replace(/\.$/, '')
  } else if (isXAxisLabel && typeof lbl === 'string' && /^-?\d+$/.test(lbl.trim())) {
    // The first x-axis tick (xTIC.dtic1) bypasses trimlabel() and arrives as a
    // bare integer like "433". Pad it to "433.0" for consistency with the rest.
    lbl = lbl + '.0'
  } else if (!isXAxisLabel && typeof lbl === 'string' && /^-?\d+\.\d+$/.test(lbl.trim())) {
    // Y-axis dB tick labels: sigplot divides the (zmin..zmax) range by ydiv,
    // which often yields fractional ticks (e.g. "-20.666667"). Round these to
    // whole dB so the gutter reads cleanly; the divisions are tens of dB apart,
    // so rounding never collides two adjacent ticks.
    lbl = String(Math.round(parseFloat(lbl)))
  }
  if (isXAxisLabel) {
    // X-axis freq labels are rendered as HTML in the template (.sdr-wf-freq-label)
    // so each label gets its own background box. Skip the canvas draw entirely.
    return
  }
  // Y-axis dB tick labels. SigPlot lays these out with a monospace assumption
  // (positions derived from Mx.text_w = width of 'M'), but we render in Barlow
  // (proportional), so a fixed character-count offset drifts by label length
  // and — on narrow panels — shoves the numbers over the spectrum's left edge
  // (Mx.l ≈ the data-box left edge). Instead, measure each label's REAL pixel
  // width in sigplot's own font and right-align it to a fixed gap left of Mx.l.
  // Every label then keeps the same gap to the spectrum and clears the canvas's
  // left edge, whatever its digit count ("0" vs "-78") or the panel width.
  if (typeof lbl === 'string' && /^-?\d+$/.test(lbl.trim()) && typeof Mx?.l === 'number') {
    const canvas = Mx.active_canvas ?? Mx.canvas
    const measureContext = canvas?.getContext('2d')
    if (measureContext) {
      // Match the font sigplot draws with so measureText() is accurate.
      if (Mx.font?.font) measureContext.font = Mx.font.font
      const labelWidthPx = measureContext.measureText(lbl).width
      // Gap between the label's right edge and the spectrum. Roughly 1.4
      // characters at the plot's 12px font — enough breathing room that the
      // numbers don't read as stuck to the axis. The gutter is text_w * 4.5
      // (~39px, installMarginTweaks) and the widest label ("-120") measures
      // ~21px, so this still leaves the label clear of the canvas edge.
      const gapToSpectrumPx = 12
      // Minimum gap from the canvas's left edge (clamp keeps the widest label
      // on-canvas if a narrow panel shrinks the gutter below the label width).
      const minGapFromLeftEdgePx = 4
      x = Math.max(minGapFromLeftEdgePx, Mx.l - gapToSpectrumPx - labelWidthPx)
    }
  }
  return _origMxText.call(this, Mx, x, y, lbl, color)
}
import { useSdrStore } from './stores/sdr'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import { useSignalMarkers } from './composables/useSignalMarkers'
import { useFrequencyDrag } from './composables/useFrequencyDrag'
import { useBandwidthBracketDrag } from './composables/useBandwidthBracketDrag'
import {
  useKnownFrequencyMarkers,
  type KnownFrequencyAnnotationHost,
  type KnownFrequencyAnnotationPlugin,
} from './composables/useKnownFrequencyMarkers'
import { fitBandLabel } from './bandLabel'

const store = useSdrStore()
const settings = useSettingsStore()

// ── Search-overlay readouts ──────────────────────────────────────────────────
// The waterfall freezes during a range sweep; these computeds shape the panel's
// search state into the strings + progress fraction the overlay renders.
// True while EITHER a frequency-range search OR a group scan is sweeping. The
// spectrum/waterfall and the Zoom/Max/Min sliders drop to the same disabled
// dark state as when the radio isn't playing, with the info box floating above.
const sweeping = computed(() => store.searchSweeping || store.scanSweeping)
const searchOverlayLowMHz = computed(() =>
  store.searchLowHz != null ? (store.searchLowHz / 1e6).toFixed(4) : '—',
)
const searchOverlayHighMHz = computed(() =>
  store.searchHighHz != null ? (store.searchHighHz / 1e6).toFixed(4) : '—',
)
const searchOverlayProgressPct = computed(() => {
  const lo = store.searchLowHz
  const hi = store.searchHighHz
  const cur = store.searchCurrentHz
  if (lo == null || hi == null || cur == null || hi <= lo) return 0
  const pct = ((cur - lo) / (hi - lo)) * 100
  return Math.max(0, Math.min(100, pct))
})

// ── RF band plan ─────────────────────────────────────────────────────────────
// Reference allocations used to label the spectrum (e.g. "Medium Wave"). Sourced
// from the sdr.bandPlan config setting (seeded from backend/default_config.json).
interface RfBand {
  name: string
  startHz: number
  endHz: number
}
const bandPlan = computed<RfBand[]>(() => settings.getSetting<RfBand[]>('sdr', 'bandPlan', []))

// Live frequency span of the current spectrum frame (center ± sample_rate/2),
// tracked so the axis scaling and the band overlay follow tuning.
const spanStartHz = ref(0)
const spanEndHz = ref(0)

// Spectrum plot's real data-area margins (Mx.l / Mx.r / Mx.b). Used by the
// click-to-tune handler to map a clientX to a frequency within the plot's
// DATA box, AND by the band overlay below to align its left/right/bottom
// edges with the plot's data box (not the canvas's full element). Must be
// measured after layout (the gutter scales with the font/canvas size).
const bandInsetLeftPx = ref(56)
const bandInsetRightPx = ref(12)
// Distance from the BOTTOM of .sdr-wf-spectrum to the bottom of the data box
// (i.e. the height of sigplot's x-axis tick-label gutter). Without this the
// overlay sits over the freq labels instead of over the trace.
const bandInsetBottomPx = ref(0)
// Distance from the TOP of .sdr-wf-spectrum to the top of the data box (mx.t).
// Used to anchor the band-plan strip to the data-box top.
const bandInsetTopPx = ref(0)
// Width of the spectrum's data box in pixels (mx.r − mx.l). Drives the
// known-frequency label overlap test below: leftPct is a percentage, but
// deciding whether two label pills collide is a pixel question (pill widths vs.
// the available horizontal space), so the row-stagger math converts percentages
// to pixels through this. Measured after layout in syncBandInset().
const dataBoxWidthPx = ref(0)
// Height of the band overlay in pixels. Set so the top of the strip aligns
// with the -100 dB horizontal gridline in the spectrum (data-box-relative).
const bandHeightPx = ref(0)

// Style for the band-plan overlay (absolute-positioned div sitting on top of
// the spectrum canvas). Insets follow the live data-box rectangle so the
// strip always aligns with the plot's tick labels regardless of font scaling.
// The strip is opaque enough to hide the sigplot-drawn tuning marker where
// they overlap — that intentional "gap" in the marker, only across the
// bandplan's own height, is the desired UI.
const bandOverlayStyle = computed(() => ({
  left: `${bandInsetLeftPx.value}px`,
  right: `${bandInsetRightPx.value}px`,
  bottom: `${bandInsetBottomPx.value}px`,
  // bandHeightPx is set > 0 by the init syncBandInset() (it derives from the
  // data-box height, independent of the span) before any band overlay can
  // render, so the `: undefined` fallback is never the evaluated branch.
  /* v8 ignore start */
  height: bandHeightPx.value > 0 ? `${bandHeightPx.value}px` : undefined,
  /* v8 ignore stop */
}))

// The waterfall flex sibling sits flush against .sdr-wf-spectrum's bottom
// edge. The spectrum's freq labels are now HTML (.sdr-wf-freq-label), drawn
// INSIDE this element's own gutter (.sdr-wf-tick-gutter, bottom-anchored), so
// the margin no longer has to clear canvas-drawn labels — it's pure spacing
// between the labels and the waterfall. Keep it to a small fixed gap so the
// waterfall sits right beneath the freq labels (clear, but nearly touching).
const spectrumGapPx = computed(() => (bandInsetBottomPx.value > 0 ? 4 : 0))
const spectrumStyle = computed(() => ({
  marginBottom: `${spectrumGapPx.value}px`,
}))

// The waterfall canvas reserves an (invisible, bg-coloured) x-axis label gutter
// at its BOTTOM — the same height the spectrum reserves (bandInsetBottomPx),
// since both plots share the axis spec. That gutter reads as dead space below
// the raster. The #sdr-waterfall container is overflow:hidden, so a negative
// margin-bottom lets the raster extend past the clip edge, cropping ~25% of
// that gutter (the canvas grows to fit, pushing its gutter below the clip).
const rasterStyle = computed(() => ({
  marginBottom: `${-Math.round(bandInsetBottomPx.value * 0.25)}px`,
}))

// ── Layout: track the SDR side panel open/closed state ───────────────────────
function _readSidebarOpen(): boolean {
  try {
    return sessionStorage.getItem('sentinel_sidebar_open') === '1'
  } catch {
    return false
  }
}
const panelOpen = ref<boolean>(_readSidebarOpen())
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  panelOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

// Pull the overlay-visibility flags from the DB whenever a config JSON upload
// replaces them, so the waterfall reacts even when the settings panel isn't
// mounted (the toggle controls also subscribe, but only while rendered).
useDocumentEvent('sentinel:config-uploaded', () => {
  void store.hydrateSnapToKnownFromDb()
  void store.hydrateDisplayBandPlanFromDb()
  void store.hydrateDisplayKnownFrequenciesFromDb()
  void store.hydrateDisplayWaterfallTimestampsFromDb()
  void store.hydrateWaterfallTimestampIntervalFromDb()
})

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

// The Max/Min sliders are rotated -90deg, which puts the slider's native `min`
// attribute at the TOP and `max` at the BOTTOM of the visual track. To make
// "thumb DOWN = more negative dB" feel natural, bind each slider to the
// negated value via a computed proxy: the slider stores a positive magnitude
// (0..80 for Max, 20..120 for Min), negated on read/write so the underlying
// zmin/zmax refs still carry the actual dB values.
const zmaxSlider = computed({
  get: () => -zmax.value,
  set: (v: number) => {
    zmax.value = -v
  },
})
const zminSlider = computed({
  get: () => -zmin.value,
  set: (v: number) => {
    zmin.value = -v
  },
})

// ── Zoom — horizontal (frequency) zoom into the selected frequency ───────────
// 1 = full span (no zoom); ZOOM_MAX = tightest. The visible window is the full
// span / zoom, centred on the SELECTED (tuned) frequency — store.currentFreqHz,
// which may sit anywhere in the span when auto-centre is off — and applied to
// BOTH plots so the spectrum and waterfall stay aligned. SigPlot's
// zoom({x},{x}, continuous:true) updates the current zoom level in place (no
// zoom-stack growth); zoom === 1 calls unzoom() to restore the full-span view.
const ZOOM_MIN = 1
const ZOOM_MAX = 50
// Restore the persisted zoom level (kept in the store so it survives leaving
// and re-entering the SDR section), clamped to the valid range; default to
// full span when unset.
const zoom = ref(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, store.viewZoom || ZOOM_MIN)))

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
  const sel = zoom.value <= ZOOM_MIN ? (lo + hi) / 2 : store.currentFreqHz || (lo + hi) / 2
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
      specPlot?.unzoom()
    } catch {
      /* noop */
    }
    try {
      wfPlot?.unzoom()
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
    specPlot?.unzoom()
  } catch {
    /* noop */
  }
  try {
    wfPlot?.unzoom()
  } catch {
    /* noop */
  }
  try {
    specPlot?.zoom({ x: x1MHz }, { x: x2MHz }, false)
  } catch {
    /* noop */
  }
  try {
    wfPlot?.zoom({ x: x1Hz }, { x: x2Hz }, false)
  } catch {
    /* noop */
  }
}
// Waterfall colour auto-scale window (frames). sigplot's autol:N recomputes
// the z colour range every ~N frames. A small N (was 5) chases the noise
// floor at LOW bandwidth/sample-rate — where most of the span is random
// noise — re-mapping the whole raster's colours every few frames => the
// "jumpy at 10kHz, fine at wide bandwidth" symptom. A long window (~100
// frames ≈ 4s) keeps colours stable while still adapting to real signal
// level changes over seconds. (Spectrum LINE keeps a responsive autol;
// only the raster colour-map needs to be steady.)
const WF_AUTOL = 100

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
type SdrDeviceId = 'rtl_tcp' | 'hackrf' | 'airspy' | 'sdrplay'
const DEVICE_DB_RANGE: Record<SdrDeviceId, { ymin: number; ymax: number }> = {
  rtl_tcp: { ymin: -100, ymax: 0 }, // 8-bit IQ (only device wired today)
  hackrf: { ymin: -100, ymax: 0 }, // 8-bit IQ  — placeholder
  airspy: { ymin: -120, ymax: 0 }, // 12-bit IQ — placeholder
  sdrplay: { ymin: -140, ymax: 0 }, // 14-bit IQ — placeholder
}
const ACTIVE_DEVICE: SdrDeviceId = 'rtl_tcp'
const SPEC_YMIN_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymin
const SPEC_YMAX_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymax
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
if (!store.viewAutoScale) {
  zmin.value = store.viewZmin
  zmax.value = store.viewZmax
  autoScale.value = false
} else {
  zmin.value = SPEC_YMIN_DB
  zmax.value = SPEC_YMAX_DB
}

// Apply a (min, max) dB range to BOTH plots: spectrum trace y-axis and
// waterfall colour map. ydiv is recomputed so tick steps land on endpoints
// (sigplot pins dtic1 = ymin when ydiv is negative — see plot init for the
// rationale). Called from the [zmin, zmax] watcher.
function applySpecRange(lo: number, hi: number) {
  /* v8 ignore start -- the only caller (the [zmin, zmax] watcher) takes the
     hi <= lo branch first and returns, so applySpecRange always gets hi > lo. */
  if (!(hi > lo)) return
  /* v8 ignore stop */
  const span = hi - lo
  const ydiv = -Math.max(1, Math.round(span / 20))
  try {
    specPlot?.change_settings({ ymin: lo, ymax: hi, ydiv })
  } catch {
    /* noop */
  }
  try {
    wfPlot?.change_settings({ autol: -1, zmin: lo, zmax: hi })
  } catch {
    /* noop */
  }
}

// ── Plot instances & layer uuids — deliberately NON-reactive ─────────────────
// sigplot mutates the Plot object heavily; wrapping it in Vue reactivity breaks
// it and tanks performance. Keep these as plain module-of-component bindings.
let specPlot: Plot | null = null
let wfPlot: Plot | null = null
let specUuid = ''
let wfUuid = ''
let subsize = 0
let ro: ResizeObserver | null = null

// popovers and snap-to-known tuning (composables/useKnownFrequencyMarkers.ts).
const {
  visibleKnownFreqs,
  openKnownKey,
  toggleKnownMarker,
  onKnownMarkerPointerEnter,
  onKnownMarkerPointerLeave,
  isKnownPopoverShown,
  isKnownMarkerEvent,
  snapToKnownFreqHz,
  attachAnnotationPlugin,
  detachAnnotationPlugin,
} = useKnownFrequencyMarkers({
  source: store,
  spanStartHz,
  spanEndHz,
  zoom,
  dataBoxWidthPx,
  zoomWindowHz,
})

// Bands that intersect the visible (zoom-aware) frequency window, each with
// its position as a 0..100% fraction across the plot's data area. Consumed
// by the HTML band overlay in the template — coloured rectangles sit on the
// bottom of the spectrum canvas with the band name centred inside.
//
// Zoom handling mirrors applyZoom() / tuneToClientX(): the visible window is
// the full span / zoom, centred on the tuned centre. Mapping bands against
// that window (not the full span) keeps the strip aligned with the trace at
// every zoom level.
const visibleBands = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return []
  const { winLo, winHi } = zoomWindowHz(lo, hi)
  const w = winHi - winLo
  return bandPlan.value
    .filter((b) => b.endHz > winLo && b.startHz < winHi)
    .map((b, i) => {
      const leftFrac = Math.max(0, (b.startHz - winLo) / w)
      const rightFrac = Math.min(1, (b.endHz - winLo) / w)
      return {
        key: `${b.name}-${i}`,
        name: b.name,
        // Full name, short form or nothing — whatever fits the strip uncropped.
        label: fitBandLabel(b.name, (rightFrac - leftFrac) * dataBoxWidthPx.value),
        leftPct: leftFrac * 100,
        widthPct: (rightFrac - leftFrac) * 100,
      }
    })
})

// Vertical tick lines drawn in the bottom label gutter, one per frequency
// label drawn by sigplot. Positions are 0..100% across the data box, same
// window math as visibleBands.
//
// Step size mirrors sigplot's mx.tics() nice-number selection (mx.js:2834-2889)
// applied to the VISIBLE (zoom-aware) window with the SAME xdiv we pushed to
// sigplot in the spectrum watch — full-span / 0.1 MHz. At full zoom that
// produces 0.1 MHz steps; when zoomed in, sigplot picks a finer nice number
// (0.05, 0.02, 0.01…) for its labels, and we must match so every label gets a
// tick (not just the labels that happen to land on 0.1 MHz multiples).
const freqTicks = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return []
  const { winLo, winHi } = zoomWindowHz(lo, hi)
  const w = winHi - winLo
  const fullSpanMHz = (hi - lo) / HZ_PER_MHZ
  const ndiv = Math.max(2, Math.round(fullSpanMHz / 0.1))
  const winMHz = w / HZ_PER_MHZ
  // mx.tics nice-number pick: sig = 10^floor(log10(winMHz/ndiv)); ddf =
  // (winMHz/ndiv)/sig; dtic = {1, 2, 2.5, 5, 10} * sig based on ddf bands.
  const df = winMHz / ndiv
  // df = winMHz / ndiv ≈ 0.1 / zoom, so it is always < 1 for every span/zoom the
  // device produces — the `df >= 1` arm only exists to mirror sigplot's general
  // nice-number routine and is unreachable here.
  /* v8 ignore start */
  const nsig =
    df < 1
      ? Math.ceil(Math.log10(Math.max(df, 1e-36))) - 1
      : Math.floor(Math.log10(Math.max(df, 1e-36)))
  /* v8 ignore stop */
  const sig = Math.pow(10, nsig)
  const ddf = df / sig
  let dticMHz: number
  if (ddf < 1.75) dticMHz = sig
  else if (ddf < 2.25) dticMHz = 2.0 * sig
  else if (ddf < 3.5) dticMHz = 2.5 * sig
  else if (ddf < 7.0) dticMHz = 5.0 * sig
  else dticMHz = 10.0 * sig
  const stepHz = dticMHz * HZ_PER_MHZ
  const first = Math.ceil(winLo / stepHz) * stepHz
  // Decimal places needed to render dticMHz without rounding (e.g. 0.025 → 3).
  // dticMHz derives from the always-<1 df above, so it too is always < 1; the
  // `: 0` arm mirrors the general routine but is unreachable here.
  /* v8 ignore start */
  const decimals = Math.max(
    1,
    Math.min(6, -Math.floor(Math.log10(dticMHz)) + (dticMHz < 1 ? 1 : 0)),
  )
  /* v8 ignore stop */
  const ticks: { key: string; leftPct: number; label: string; labeled: boolean }[] = []
  let widestLabelChars = 0
  for (let f = first; f <= winHi; f += stepHz) {
    const label = formatFreqTick(f, decimals)
    widestLabelChars = Math.max(widestLabelChars, label.length)
    ticks.push({
      key: `t-${f}`,
      leftPct: ((f - winLo) / w) * 100,
      label,
      labeled: true,
    })
  }
  // Thin the visible labels on narrow screens so their pill boxes never overlap.
  // The gridline ticks all stay; we only drop every-other (or every-third…) LABEL.
  // Pixel gap between adjacent ticks = the step's fraction of the window × the
  // data-box width. Estimate a label pill's footprint from its character count
  // (≈7px per glyph at 700/11px Barlow) plus the 9px horizontal padding either
  // side and a small breathing gap, then keep only every Nth label so consecutive
  // pills stay at least that far apart (every-Nth keeps the kept labels evenly
  // spaced and on round step multiples).
  const boxWidthPx = dataBoxWidthPx.value
  // syncBandInset measures the data box (boxWidthPx > 0) before the first frame
  // produces a span, so by the time this code runs the box is always measured;
  // the unmeasured arm is defensive — leave every label visible.
  /* v8 ignore start */
  if (boxWidthPx <= 0) return ticks
  /* v8 ignore stop */
  const tickGapPx = (stepHz / w) * boxWidthPx
  const labelPillPx = widestLabelChars * 7 + 9 * 2
  const minLabelGapPx = labelPillPx + 6
  const labelStride = Math.max(1, Math.ceil(minLabelGapPx / tickGapPx))
  for (let index = 0; index < ticks.length; index += 1) {
    ticks[index]!.labeled = index % labelStride === 0
  }
  return ticks
})

// Format a tick frequency (Hz) with an SI unit suffix chosen by magnitude:
// kHz → "K", MHz → "M", GHz → "G". `decimals` is computed in MHz (the axis's
// native unit), so re-derive the precision for the chosen unit: scaling Hz→kHz
// shifts the decimal point three places (so +3 decimals vs MHz), Hz→GHz shifts
// it back three (−3), and the value is then trimmed of trailing zeros so e.g.
// 123.00 reads "123M", 123.45 reads "123.45M".
function formatFreqTick(hz: number, mhzDecimals: number): string {
  let value: number
  let unit: string
  let decimals: number
  if (hz >= 1e9) {
    value = hz / 1e9
    unit = 'G'
    decimals = mhzDecimals + 3
  } else if (hz >= 1e6) {
    value = hz / 1e6
    unit = 'M'
    decimals = mhzDecimals
  } else {
    value = hz / 1e3
    unit = 'K'
    decimals = Math.max(0, mhzDecimals - 3)
  }
  const text = value.toFixed(Math.max(0, Math.min(6, decimals)))
  // Trim trailing zeros (and a dangling dot) so "123.00" → "123", "123.40" → "123.4".
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text
  return `${trimmed}${unit}`
}

// Inline style for the tick gutter overlay — spans the data box horizontally
// (same insets as the band overlay) and the freq-label gutter vertically.
const tickGutterStyle = computed(() => ({
  left: `${bandInsetLeftPx.value}px`,
  right: `${bandInsetRightPx.value}px`,
  height: `${bandInsetBottomPx.value}px`,
}))

// Inline style for the known-frequency label overlay — a box covering the whole
// spectrum data box (all four insets match it). The markers hang from its TOP
// edge, so they render as a layer over the top of the spectrum trace (where the
// noise floor sits, clear of real signals lower down); `top` = bandInsetTopPx
// (the data-box top, mx.t). Spanning the full data box (bottom = bandInsetBottomPx)
// lets the overlay clip its children (overflow:hidden in CSS) so a label near the
// right edge stops at the grid edge instead of overrunning into the control rail.
const knownFreqOverlayStyle = computed(() => ({
  left: `${bandInsetLeftPx.value}px`,
  right: `${bandInsetRightPx.value}px`,
  top: `${bandInsetTopPx.value}px`,
  bottom: `${bandInsetBottomPx.value}px`,
}))

// Click-to-tune. Clicking the spectrum or waterfall data area retunes the
// radio to the frequency under the cursor (the marker then follows via the
// store → applyMarker path, same as drag).
//
// We can't use a plain `click` listener: sigplot's canvas mousedown handler
// calls event.preventDefault() (sigplot.js:488), which suppresses the browser's
// synthetic `click`. So detect the click ourselves — record the mousedown
// position, and on mouseup over the same plot with negligible movement (i.e.
// not a marker drag), treat it as a click-to-tune. Capture phase so we read
// the event before sigplot's own handlers.
let mdownX = 0
let mdownY = 0
let mdownEl: HTMLElement | null = null
const CLICK_SLOP_PX = 4

function onPlotMouseDown(e: MouseEvent) {
  // Suppress sigplot's hard-coded right-click unzoom (sigplot.js:1062-1069):
  // continuous-mode programmatic zooms still push exactly one level onto its
  // stack, so a right-click would unzoom the spectrum while our `zoom` ref,
  // the slider and the waterfall all stay put. The Zoom slider is the only
  // input — kill the event before sigplot's mouseup handler runs.
  if (e.button === 2) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  if (e.button !== 0) return
  // A press on a known-frequency marker toggles its name popover via the
  // button's own click handler — never a click-to-tune or a marker drag.
  if (isKnownMarkerEvent(e)) {
    mdownEl = null
    return
  }
  // Drag-to-pan: a mousedown that lands in the bottom freq-label gutter starts
  // a frequency pan instead of a click-to-tune. This runs in the capture phase
  // on .sdr-wf-spectrum (before sigplot's own canvas mousedown), so it reliably
  // wins regardless of canvas/overlay stacking. If it starts a pan, swallow the
  // event so neither sigplot nor click-to-tune also acts on it.
  if (e.currentTarget === specEl.value && tryStartFreqDrag(e)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  mdownEl = e.currentTarget as HTMLElement
  mdownX = e.clientX
  mdownY = e.clientY
}

function onPlotMouseUp(e: MouseEvent) {
  // Match the right-button suppression in onPlotMouseDown: sigplot's
  // hard-coded unzoom triggers on mouseup, so swallow that too before its
  // canvas-level listener runs.
  if (e.button === 2) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  // A release on a known-frequency marker is its popover toggle — not a tune.
  if (isKnownMarkerEvent(e)) {
    mdownEl = null
    return
  }
  const el = mdownEl
  mdownEl = null
  if (e.button !== 0 || !el || el !== e.currentTarget) return
  // A marker drag also ends with a mouseup over the plot — ignore it.
  if (isBracketDragActive()) return
  // A freq-axis pan started in the gutter (the parent capture handler still
  // recorded mdownEl); the pan handles tuning itself, so don't also click-tune.
  if (isFreqDragActive()) return
  // Moved more than the slop? It was a drag/pan, not a click.
  if (Math.abs(e.clientX - mdownX) > CLICK_SLOP_PX || Math.abs(e.clientY - mdownY) > CLICK_SLOP_PX)
    return
  // Read-only follower: tuning is mirrored from the owner, so ignore click-to-tune
  // (moving the local marker would diverge from the owner until the next state push).
  if (!store.playing || store.readOnly) return
  // A SHIFT-click on the waterfall raster (not the spectrum plot) pins/unpins
  // the signal under the cursor's start/end-time marker instead of tuning.
  // This MUST be opt-in via a modifier: an ordinary spectrum is busy enough
  // that "is there a signal here" is true almost everywhere in view, so a
  // plain click landing on one used to swallow click-to-tune outright —
  // clicking anywhere to retune silently did nothing, leaving the receiver
  // parked whatever frequency it already had. A bare click must always tune.
  if (el === wfEl.value && e.shiftKey) {
    // Pin whatever the hover preview is CURRENTLY showing rather than running
    // detection again at the click point: the raster keeps scrolling between
    // the last mousemove and this mouseup, so a fresh detection can land on a
    // slightly different row/extent (or a momentary noise dip) than what the
    // operator saw and aimed for — that mismatch is what read as "flickering"
    // and made a signal hard to actually select. Falling back to a fresh
    // detection only covers input that never fired a mousemove (touch/pen).
    const clickedSignal =
      hoverSignalMarker.value ?? computeSignalMarkerAtPoint(e.clientX, e.clientY)
    if (clickedSignal) {
      toggleSignalMarkerPin(clickedSignal)
      return
    }
  }
  tuneToClientX(el, e.clientX)
}

// Click-to-tune, drag-to-pan along the frequency gutter and scroll-to-pan
// (refactor series C13). Called where its block used to be, so its document
// listeners keep their order; the spectrum ref is declared further down, hence
// the getter.
const {
  freqDragging,
  isFreqDragActive,
  tryStartFreqDrag,
  abortFreqDrag,
  onPlotWheel: panByWheel,
  tuneToClientX,
} = useFrequencyDrag({
  source: store,
  spectrumElement: () => specEl.value,
  spanStartHz,
  spanEndHz,
  bandInsetLeftPx,
  bandInsetRightPx,
  bandInsetBottomPx,
  livePanOffsetHz,
  zoomWindowHz,
  snapToKnownFreqHz,
  applyView: () => {
    applyZoom() // re-window the spectrum + waterfall raster in place
    applyMarker() // re-pin the bar at screen centre (dispFHz += offset)
  },
})

// A function declaration, not the destructured handler, because the template
// binds it on both plots: Vue binds a declared function directly but wraps a
// destructured value in a per-element arrow, which would leave the raster's
// copy as an uncovered function in the coverage report.
function onPlotWheel(event: WheelEvent) {
  panByWheel(event)
}

// Read the spectrum plot's real data-area margins (Mx.l / Mx.r / Mx.b) and
// drive the HTML band overlay's inset from them so it lines up with the data
// area on all three edges (top is intentionally open — the strip grows up
// from the data-box bottom). Mx is sigplot-internal (no public accessor); the
// plugin base reads it the same way (this._plot._Mx), so this is the
// supported-by-precedent path.
function syncBandInset() {
  const mx = (
    specPlot as unknown as {
      _Mx?: { l: number; r: number; t: number; b: number; width: number; height: number }
    } | null
  )?._Mx
  if (!mx || !mx.width) return
  // Exact fractional pixels, NOT floor/ceil to whole pixels: known-frequency
  // markers and the click-to-tune math below both project onto this inset via
  // percentage, while the carrier/tuning line is drawn straight onto the canvas
  // at the exact (unrounded) mx.l/mx.r — rounding here was a fraction of a
  // pixel off from that, which reads as "the dot isn't quite centred on the
  // line", worse the wider the data box (i.e. fully zoomed out).
  bandInsetLeftPx.value = Math.max(0, mx.l)
  bandInsetRightPx.value = Math.max(0, mx.width - mx.r)
  // Pixel width of the data box (mx.r − mx.l) — the horizontal space the
  // known-freq label overlay maps its percentage positions onto for overlap
  // detection (see visibleKnownFreqs).
  dataBoxWidthPx.value = Math.max(0, mx.r - mx.l)
  // Publish the live data-box insets so the decoder dock below can line its
  // boxes up with the waterfall DISPLAY (not the waterfall element). Written to
  // :root as CSS vars; the dock reads them with fallbacks. See SdrDecodeDock.
  const rootStyle = document.documentElement.style
  rootStyle.setProperty('--sdr-wf-inset-left', `${bandInsetLeftPx.value}px`)
  rootStyle.setProperty('--sdr-wf-inset-right', `${bandInsetRightPx.value}px`)
  // mx.b is the pixel y of the data-box BOTTOM (sigplot draws ticks/labels
  // below it). Distance from the canvas/element bottom = height − b.
  bandInsetBottomPx.value = Math.max(0, Math.ceil(mx.height - mx.b))
  bandInsetTopPx.value = Math.max(0, Math.ceil(mx.t) - 1)
  syncWaterfallDataBox()
  // Band overlay grows up from the data-box bottom to the -100 dB gridline.
  // mx.t..mx.b span the y-axis range SPEC_YMAX_DB..SPEC_YMIN_DB.
  const dataBoxHeightPx = mx.b - mx.t
  const yRangeDb = SPEC_YMAX_DB - SPEC_YMIN_DB
  if (dataBoxHeightPx > 0 && yRangeDb > 0) {
    const TARGET_DB = -100
    const dbFromBottom = TARGET_DB - SPEC_YMIN_DB
    bandHeightPx.value = Math.max(
      20,
      Math.round((dbFromBottom / yRangeDb) * dataBoxHeightPx * 0.1875) + 4,
    )
  }
}

// Same read as syncBandInset, against the WATERFALL plot: its data box top and
// height are what the time markers hang off. Kept separate because the two
// plots only share their horizontal margins — vertically the raster fills its
// own element.
function syncWaterfallDataBox() {
  const mx = (
    wfPlot as unknown as {
      _Mx?: { t: number; b: number; height: number }
    } | null
  )?._Mx
  if (!mx || !(mx.b > mx.t)) return
  wfDataTopPx.value = Math.max(0, Math.round(mx.t))
  wfDataHeightPx.value = Math.round(mx.b - mx.t)
}

// The tuning bracket: the accordions that draw the tuned passband and carrier
// line, their drag-to-retune / resize (mouse and bridged touch), the resize
// cursor and the missed-mouseup safety nets (refactor series C14). Called where
// its block used to be so its document listeners keep their order; the plots
// are reassigned and the element refs declared further down, hence the getters.
const {
  nearEdge,
  applyMarker,
  attachAccordions,
  detachAccordions,
  isBracketDragActive,
  isWritingBracket,
  tryStartBracketTouch,
  abortAccDrag,
} = useBandwidthBracketDrag({
  source: store,
  spectrumPlot: () => specPlot,
  waterfallPlot: () => wfPlot,
  spectrumElement: () => specEl.value,
  waterfallElement: () => wfEl.value,
  spanStartHz,
  spanEndHz,
  livePanOffsetHz,
  snapToKnownFreqHz,
})

// Capture-phase touch router for both drag gestures, mirroring
// onPlotMouseDown. Registered on the same two plot wrapper elements (see the
// template) so it reliably intercepts before sigplot's own bubble-phase
// touchstart listener on the widget canvas underneath.
function onPlotTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return // let sigplot handle two-finger pinch-zoom
  // A tap on a known-frequency marker is its popover toggle — leave it to the
  // button's own click and don't start a freq drag / accordion grab.
  if (isKnownMarkerEvent(e)) return
  const touch = e.touches[0]
  /* v8 ignore start -- guarded by the length check above */
  if (!touch) return
  /* v8 ignore stop */
  const isSpec = e.currentTarget === specEl.value
  if (isSpec && tryStartFreqDrag(touch)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  // Otherwise a touch on the bracket is bridged into sigplot's mouse drag;
  // anything else is left to sigplot's native touch pan/pinch-zoom.
  tryStartBracketTouch(e, touch, isSpec)
}
onMounted(() => window.addEventListener('blur', abortAccDrag))
onBeforeUnmount(() => window.removeEventListener('blur', abortAccDrag))
onMounted(() => window.addEventListener('blur', abortFreqDrag))
onBeforeUnmount(() => window.removeEventListener('blur', abortFreqDrag))

const rootEl = ref<HTMLElement | null>(null)
const specEl = ref<HTMLElement | null>(null)
const wfEl = ref<HTMLElement | null>(null)
const controlsEl = ref<HTMLElement | null>(null)

// The Zoom/Max/Min sliders are rotated -90deg, so each slider's CSS `width`
// must equal its wrapper's pixel HEIGHT for it to span the column. Measure the
// wrappers and push the length into a per-slider CSS var.
let controlsRo: ResizeObserver | null = null
function sizeSliders() {
  const root = controlsEl.value
  if (!root) return
  root.querySelectorAll<HTMLElement>('.sdr-wf-slider-wrap').forEach((wrap) => {
    const slider = wrap.querySelector<HTMLElement>('.sdr-wf-slider')
    // The template always renders a .sdr-wf-slider inside every .sdr-wf-slider-
    // wrap, so the query never misses.
    /* v8 ignore start */
    if (slider) slider.style.setProperty('--wf-slider-len', `${wrap.clientHeight}px`)
    /* v8 ignore stop */
  })
}

const BG = '#0a0d14'

// Number of history rows the waterfall keeps. Set explicitly via `lps` so the
// raster depth does NOT depend on the container's pixel height at mount time —
// layer2d computes lps once at init from `hcb.lps || (Mx.b - Mx.t)`, so without
// this an early/zero-height mount permanently yields a single moving line
// instead of a filled scrolling waterfall.
// History rows in the waterfall raster. Lower = each incoming frame is a
// thicker band => faster, smoother visual scroll (and less per-frame raster
// work). 1200 packed ~50-100s of history into the panel making the scroll
// crawl; ~400 (~15-30s) gives a responsive scroll closer to the reference.
const WF_ROWS = 400

// ── Row clock + signal markers ─────────────────────────────────────────────
// The wall-clock time and bins of every raster row, the clock labels down the
// raster's left edge and the hover/Shift+Click signal marker
// (composables/useSignalMarkers.ts). The frequency scale is read through
// getters because a retune reassigns xstartHz/xdeltaHz below.
const {
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
} = useSignalMarkers({
  source: store,
  sweeping,
  rasterElement: wfEl,
  bandInsetLeftPx,
  bandInsetRightPx,
  spanStartHz,
  spanEndHz,
  zoomWindowHz,
  firstBinHz: () => xstartHz,
  hzPerBin: () => xdeltaHz,
  rowCapacity: WF_ROWS,
})

// Frequency scaling for the current frame. xstart = left-edge Hz, xdelta =
// Hz per FFT bin. Passing these (with xunits:3 = Hz) makes SigPlot's own
// x-axis render real tuned frequencies instead of a 0..N bin index.
let xstartHz = 0
let xdeltaHz = 1
// Same scaling expressed in MHz. The spectrum axis is fed these so SigPlot
// renders frequency labels directly in MHz (e.g. 100.5000) to match the
// radio's MHz frequency display, instead of auto-scaling raw Hz to its own
// "100.5M" form. At ~100 magnitude SigPlot's mx.mult() returns 1.0 (no extra
// unit scaling), so the tick text is the plain MHz value.
const HZ_PER_MHZ = 1e6
let xstartMHz = 0
let xdeltaMHz = 1 / HZ_PER_MHZ

// Target FFT bin count for the current canvas, in device pixels. The backend
// snaps this to a power of two in [1024, 8192]. Without this the backend stays
// at 1024 bins regardless of canvas width, so on wide / HiDPI displays each bin
// occupies multiple pixels and the waterfall looks blocky.
//
// Zoom-aware: the visible window is full-span / zoom, but the FFT covers the
// FULL span, so to land ~1 bin per device px INSIDE the visible window we need
// px * zoom bins across the full span. SDR++ has the same arithmetic — see
// drawDataSize = (viewBandwidth / wholeBandwidth) * rawFFTSize in
// core/src/gui/widgets/waterfall.cpp:614. At extreme zoom we clamp to MAX_BINS
// (8192) and accept the blockiness past that — going higher costs Pi CPU on
// every frame.
const MIN_BINS = 1024
// Keep in sync with MAX_FFT_SIZE in sentinel_radio/services/sdr.py — the backend
// snaps any request above this back down to the cap, so asking for more than
// MAX_BINS just wastes the frontend's per-zoom math.
const MAX_BINS = 32768
function computeDesiredBins(): number {
  const el = wfEl.value
  // Only ever called from initPlots(), which requires the elements, so wfEl is
  // always populated.
  /* v8 ignore start */
  if (!el) return MIN_BINS
  /* v8 ignore stop */
  const dpr = window.devicePixelRatio || 1
  const px = Math.max(1, Math.round(el.clientWidth * dpr))
  const z = Math.max(1, zoom.value)
  const target = px * z
  if (target <= MIN_BINS) return MIN_BINS
  if (target >= MAX_BINS) return MAX_BINS
  // Round UP to the next power of two so each FFT bin is at most ~1 device px
  // (downscaling looks sharp; upscaling is what causes blockiness).
  return 1 << Math.ceil(Math.log2(target))
}
// Called once, from initPlots(): the bin count is pinned for the lifetime of
// the plots so a zoom or resize can't wipe the waterfall history. Returns the
// count so the caller can size the layers to the same value.
function publishDesiredBins(): number {
  const bins = computeDesiredBins()
  store.requestFftSize(bins)
  return bins
}

function buildPipes(n: number) {
  // Both callers (initPlots and the lastSpectrum watch) only run with the plots
  // present — the watch guards `!specPlot || !wfPlot` and returns first.
  /* v8 ignore start */
  if (!specPlot || !wfPlot) return
  /* v8 ignore stop */
  if (subsize) {
    try {
      specPlot.remove_layer(specUuid)
    } catch {
      /* noop */
    }
    try {
      wfPlot.remove_layer(wfUuid)
    } catch {
      /* noop */
    }
  }
  subsize = n
  // Spectrum: 1-D line trace. Per the SigPlot developer-tips guidance for
  // real-time 1-D, use overlay_array(null, …) and reload() each frame rather
  // than a pipe (avoids pipe-buffer artifacts). xstart/xdelta give the axis
  // real Hz scaling; `color`/`fillStyle` are layer options (overlay_array's
  // 3rd arg, == change_settings params) — the white line + translucent white
  // fill under it. NOT plot colors.fg, which only drives axis/text chrome.
  specUuid = specPlot.overlay_array(
    null,
    { type: 1000, xunits: 3, yunits: 26, size: n, xstart: xstartMHz, xdelta: xdeltaMHz },
    { color: '#00aaff', fillStyle: 'rgba(0,170,255,0.14)' },
  )
  // Waterfall: 2-D raster via overlay_pipe + push (the documented scrolling-2D
  // pattern). `drawmode:'falling'` => newest row enters at the top and the
  // history scrolls downward. `lps` fixes the history depth so it doesn't
  // depend on mount-time pixel height; `pipesize` sizes the ring buffer.
  wfUuid = wfPlot.overlay_pipe(
    {
      type: 2000,
      subsize: n,
      xunits: 3,
      xstart: xstartHz,
      xdelta: xdeltaHz,
      lps: WF_ROWS,
      pipesize: WF_ROWS * n * 2,
    },
    { drawmode: 'falling', framesize: n },
  )
  // cmap 1 = the blue→red ramp. Start auto-scaling z to the live data so the
  // raster always has contrast; the Min/Max sliders switch to a fixed range.
  if (autoScale.value) {
    wfPlot.change_settings({ cmap: 1, autol: WF_AUTOL })
  } else {
    wfPlot.change_settings({ cmap: 1, autol: -1, zmin: zmin.value, zmax: zmax.value })
  }
}

let rafId = 0

function initPlots() {
  // Deferred via a double rAF that onBeforeUnmount cancels, so by the time this
  // runs the template refs are always populated.
  /* v8 ignore start */
  if (!specEl.value || !wfEl.value || !rootEl.value) return
  /* v8 ignore stop */

  // Spectrum keeps the SigPlot axes (frequency grid + dB scale) — only the
  // interactive chrome (menu/pan/drag/legend) is suppressed. fg drives the
  // axis lines, ticks and labels; the trace itself is coloured separately via
  // the layer's `color`/`fillStyle` options in buildPipes().
  // noreadout: hide the x:/y:/dx:/dy: cursor panel. xlabel/ylabel are left
  // unset (null) so SigPlot does NOT render the "<ylabel> vs <xlabel>" title
  // strip — the axis tics already make the units obvious. Both are independent
  // of show_x_axis/show_y_axis, so the grid + scale remain.
  specPlot = new sigplot.Plot(specEl.value, {
    // dB ruler driven by the Min/Max sliders (SDR++ behaviour, manual pp. 30-31).
    // autoy:0 = Fix mode, no Y auto-scaling — sigplot stays on whatever ymin/ymax
    // we last set via change_settings(). Initial values come from the slider
    // refs, which were seeded from the per-device DEVICE_DB_RANGE above.
    autoy: 0,
    ymin: zmin.value,
    ymax: zmax.value,
    // Negative ydiv bypasses sigplot's mx.tics() "nice number" rounding (which
    // can place the first tick BELOW ymin, leaving the bottom label visually
    // outside the data box). With ydiv<0, sigplot pins dtic1 = ymin exactly and
    // dtic = (ymin-ymax)/ydiv, so ticks land precisely on ymin..ymax in N steps.
    ydiv: -Math.max(1, Math.round((zmax.value - zmin.value) / 20)),
    nomenu: true,
    nopan: true,
    nodragdrop: true,
    nokeypress: true,
    no_legend_button: true,
    legend: false,
    noreadout: true,
    hide_note: true,
    autohide_panbars: true,
    // Disable sigplot's built-in marquee zoom: click-drag on the canvas
    // natively zooms to the selected rect and right-click pops the zoom stack,
    // both bypassing our `zoom` ref so the plot would drift out of sync with
    // the slider and waterfall. The Zoom slider is the single source of truth
    // — sigplot strict-equals these against "zoom"/"select" so any other value
    // disables both (sigplot.js:696-714).
    rubberbox_action: 'disabled',
    rightclick_rubberbox_action: 'disabled',
    xunits: 3,
    // SigPlot draws axis tick labels onto the canvas with this font (default
    // is "Courier New, monospace"). Match the app font (Barlow) so the
    // spectrum frequency scale matches the radio's frequency readout.
    font_family: "'Barlow', sans-serif",
    colors: { bg: BG, fg: '#ffffff' },
  })
  // The waterfall MUST use the SAME axis spec as the spectrum, otherwise the
  // two plots compute different left/right margins (sigplot.js:3806 — with a
  // y-axis Mx.l = text_w*6 for the dB label gutter; without one Mx.l = 1).
  // Different Mx.l/Mx.r => the same frequency lands at a different screen-x on
  // each plot, so the trace, the band strip and the marker are all misaligned.
  // Keep the axes/grid here but draw them in the BACKGROUND colour (fg: BG) so
  // they reserve the identical gutter while staying visually invisible.
  wfPlot = new sigplot.Plot(wfEl.value, {
    autol: 5,
    nomenu: true,
    nopan: true,
    nodragdrop: true,
    nokeypress: true,
    no_legend_button: true,
    legend: false,
    noreadout: true,
    hide_note: true,
    autohide_panbars: true,
    // Disable sigplot's built-in marquee zoom: click-drag on the canvas
    // natively zooms to the selected rect and right-click pops the zoom stack,
    // both bypassing our `zoom` ref so the plot would drift out of sync with
    // the slider and waterfall. The Zoom slider is the single source of truth
    // — sigplot strict-equals these against "zoom"/"select" so any other value
    // disables both (sigplot.js:696-714).
    rubberbox_action: 'disabled',
    rightclick_rubberbox_action: 'disabled',
    // Smooth the raster when the visible source rect is smaller than the
    // canvas (upscaling at high zoom). Without this, sigplot uses
    // nearest-neighbour and the upscaled rows look blocky once visible bins
    // < canvas px — happens past ~16x zoom on a ~2000-px canvas given the
    // backend MAX_FFT_SIZE=32768 cap. Bilinear filtering trades a tiny bit
    // of bin-edge sharpness for a much less distracting raster at high zoom.
    // (sigplot toggles imageSmoothingEnabled based on this; cheap.)
    rasterSmoothing: true,
    xunits: 3,
    font_family: "'Barlow', sans-serif",
    colors: { bg: BG, fg: BG },
  })

  // Debug: expose the spectrum plot's Y-axis state for live verification.
  // In DevTools console: `__specYAxis()` → { ymin, ymax, autoy, autol }.
  // Remove once the static-ruler change is verified.
  ;(window as unknown as { __specYAxis?: () => unknown }).__specYAxis = () => ({
    ymin: (specPlot as unknown as { _Gx: { ymin: number } })?._Gx?.ymin,
    ymax: (specPlot as unknown as { _Gx: { ymax: number } })?._Gx?.ymax,
    autoy: (specPlot as unknown as { _Gx: { autoy: number } })?._Gx?.autoy,
    autol: (specPlot as unknown as { _Gx: { autol: number } })?._Gx?.autol,
    stk0: (specPlot as unknown as { _Mx: { stk: Array<{ ymin: number; ymax: number }> } })?._Mx
      ?.stk?.[0],
  })

  // Publish the canvas-sized FFT bin target now so the backend can switch as
  // soon as the WS is up (SdrPanel forwards on socket open if it fires early).
  buildPipes(publishDesiredBins())

  // Tuned-frequency marker: the passband and carrier-line accordions on both
  // plots (composables/useBandwidthBracketDrag.ts), pinned to the store.
  attachAccordions(sigplot.plugins.AccordionPlugin, specPlot, wfPlot)

  // The known-frequency AnnotationPlugin (kept attached but empty — the HTML
  // marker overlay draws the markers; see useKnownFrequencyMarkers).
  const AnnotationPlugin = (
    sigplot.plugins as unknown as {
      AnnotationPlugin: new (options: { display: boolean }) => KnownFrequencyAnnotationPlugin
    }
  ).AnnotationPlugin
  attachAnnotationPlugin(
    specPlot as unknown as KnownFrequencyAnnotationHost,
    new AnnotationPlugin({ display: true }),
  )

  // The axis/tick `fg` colour is also used by default for the grid lines.
  // Override the grid stroke independently so the grid stays dark while
  // tick labels remain white.
  // Preserve sigplot's default dashed grid pattern (`on:1, off:3`); only swap
  // the colour so labels stay white but the grid is black.
  const gridStyle = { color: '#888888', mode: 'dashed', on: 1, off: 3 }
  specPlot.change_settings({ gridStyle })
  // Waterfall keeps grid drawn in the BG colour so it stays invisible. Visible
  // grid lines bleed through the unfilled portion of the raster (rows that
  // haven't received pipe data yet — drawmode 'falling' fills top-down, so on
  // fresh start the bottom of the canvas exposes the grid until lps rows arrive).
  // Grid + tick suppression for the waterfall is handled at the mx.drawaxis
  // patch site (top of file) — it short-circuits all tick/label/grid drawing
  // when Mx.fg === Mx.bg (true only for the waterfall plot). Settings-level
  // change_settings({ grid: false }) leaves Mx.tics' tick-stub draws untouched.

  // sigplot hard-codes the left gutter at `text_w * 6` (sigplot.js:3807) which
  // leaves a wide gap between dB tick labels and the trace. Our labels are at
  // most 4 chars wide ("-120"), so shrink the gutter via a setter on _Mx.l.
  // BOTH plots must use the same factor — see the note at wfPlot creation
  // about Mx.l alignment between spectrum and waterfall.
  const installMarginTweaks = (plot: Plot) => {
    const Mx = (
      plot as unknown as {
        _Mx: { l: number; r: number; t: number; text_w: number; text_h: number; width: number }
      }
    )._Mx
    let _l = Mx.l
    Object.defineProperty(Mx, 'l', {
      configurable: true,
      get() {
        return _l
      },
      set(v: number) {
        const tw = Mx.text_w || 1
        _l = v > 1 && Math.abs(v - tw * 6) < tw ? tw * 4.5 : v
      },
    })
    // Push the data box top down a bit so the trace doesn't kiss the canvas
    // edge. sigplot defaults Mx.t = 1 when no readout/pan; bump to ~1 text-h.
    let _t = Mx.t
    Object.defineProperty(Mx, 't', {
      configurable: true,
      get() {
        return _t
      },
      set(v: number) {
        const th = Mx.text_h || 12
        _t = Math.max(v, Math.round(th * 1.2))
      },
    })
    // Extend Mx.r to the canvas right edge so there's no visible right gutter.
    let _r = Mx.r
    Object.defineProperty(Mx, 'r', {
      configurable: true,
      get() {
        return _r
      },
      set(v: number) {
        _r = Math.max(v, Mx.width - 1)
      },
    })
    // Pull the data-box bottom up so there's a wider gutter for the x-axis
    // tick labels. Sigplot reserves only 1.5*text_h (sigplot.js:3861); bump
    // to 2.5*text_h so the gap above the labels matches the y-axis label
    // gap (the mx.text override below shifts label baselines into the extra
    // room). The bigger gutter is propagated to the band overlay and the
    // waterfall margin automatically via syncBandInset (reads height - b).
    let _b = (Mx as unknown as { b: number }).b
    Object.defineProperty(Mx, 'b', {
      configurable: true,
      get() {
        return _b
      },
      set(v: number) {
        const th = Mx.text_h || 12
        const desired =
          (plot as unknown as { _Mx: { height: number } })._Mx.height - Math.round(th * 3.2)
        _b = Math.min(v, desired)
      },
    })
  }
  installMarginTweaks(specPlot)
  installMarginTweaks(wfPlot)

  // sigplot sizes its canvas to the element's clientHeight at creation time and
  // only resizes on checkresize(). The flex children settle their final height
  // AFTER creation, so force a resize on the next frame (fixes the canvas being
  // stuck at its initial ~300px). Observe the plot ELEMENTS (not just the root)
  // so internal flex resizes — and the side-panel toggle — both trigger it.
  ro = new ResizeObserver(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
    syncBandInset()
    // The bin count stays pinned to its mount-time value on canvas resize, so a
    // side-panel toggle / browser zoom doesn't wipe the waterfall history.
  })
  ro.observe(specEl.value as HTMLElement)
  ro.observe(wfEl.value as HTMLElement)

  requestAnimationFrame(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
    syncBandInset()
  })
}

onMounted(() => {
  // Pull overlay-visibility flags from the DB so the live spectrum reflects
  // the persisted config on first paint (localStorage is the fallback, not
  // the source of truth across machines).
  void store.hydrateSnapToKnownFromDb()
  void store.hydrateDisplayBandPlanFromDb()
  void store.hydrateDisplayKnownFrequenciesFromDb()
  void store.hydrateDisplayWaterfallTimestampsFromDb()
  void store.hydrateWaterfallTimestampIntervalFromDb()
  // Defer until the fixed/flex container has resolved its real pixel size.
  // layer2d derives the waterfall geometry once at init from the plot height,
  // so creating the plots before layout settles breaks the raster.
  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(initPlots)
  })
  // Size the rotated sliders once layout settles, then keep them in sync as
  // the column height changes (panel toggle, window resize, footer/nav).
  requestAnimationFrame(sizeSliders)
  // controlsEl is a template ref that is always populated by the time onMounted
  // runs, so the null arm never executes.
  /* v8 ignore start */
  if (controlsEl.value) {
    controlsRo = new ResizeObserver(sizeSliders)
    controlsRo.observe(controlsEl.value)
  }
  /* v8 ignore stop */
})

// KNOWN-GOOD baseline (the "working great, only occasional minor jumpy"
// build): waterfall pushed per frame but rate-capped to WF_ROW_HZ; spectrum
// line redrawn once per animation frame via pendingFrame/drawLoop. Not
// further "optimised" — earlier attempts to add a spectrum cap or an
// rAF-driven rewrite regressed it.
const WF_ROW_HZ = 25
const WF_ROW_MIN_MS = 1000 / WF_ROW_HZ
let pendingFrame: { bins: number[] } | null = null
let drawRaf = 0
let lastRowMs = 0

function drawLoop() {
  drawRaf = 0
  const frame = pendingFrame
  pendingFrame = null
  if (
    frame &&
    store.playing &&
    !store.displayPaused &&
    !(store.searchSweeping || store.scanSweeping) &&
    specPlot
  ) {
    specPlot.reload(specUuid, frame.bins)
    // Mx.l / Mx.r / Mx.b are computed by sigplot during its draw pass — the
    // ResizeObserver fires on layout changes, not on draws, so without this
    // call the band-overlay insets and spectrum bottom margin stay at their
    // pre-draw defaults (Mx.b = Mx.height ⇒ bandInsetBottomPx = 0 ⇒ waterfall
    // covers the freq labels). Cheap (just reads four fields).
    syncBandInset()
  }
}

let lastCenterHz = 0
let lastSampleRate = 0

watch(
  () => store.lastSpectrum,
  (frame) => {
    if (
      !store.playing ||
      store.displayPaused ||
      store.searchSweeping ||
      store.scanSweeping ||
      !frame ||
      !specPlot ||
      !wfPlot
    )
      return

    // Update the frequency span (drives the axis scaling + band overlay).
    // sample_rate spans the full FFT; bin 0 sits at center - rate/2.
    const half = frame.sample_rate / 2
    spanStartHz.value = frame.center_hz - half
    spanEndHz.value = frame.center_hz + half

    // Rebuild the layers when the bin count OR the tuning/scale changes so the
    // axis and waterfall stay aligned to the real frequencies.
    const scaleChanged = frame.center_hz !== lastCenterHz || frame.sample_rate !== lastSampleRate
    // A new span centre means a committed drag-pan (or any retune) has landed:
    // the real span now carries the offset, so clear the live pan to avoid a
    // double-shift. Guard against an in-flight drag (a mid-drag backend retune
    // shouldn't yank the preview out from under the user).
    if (frame.center_hz !== lastCenterHz && !isFreqDragActive() && livePanOffsetHz.value !== 0) {
      livePanOffsetHz.value = 0
    }
    if (frame.bins.length !== subsize || scaleChanged) {
      // A retune/bin-count change invalidates every retained row's frequency
      // mapping — drop the history (and any hover/pinned signal marker
      // measured against the old scale) rather than silently mismeasuring it
      // against the new one.
      clearRowPushTimes()
      lastCenterHz = frame.center_hz
      lastSampleRate = frame.sample_rate
      xstartHz = spanStartHz.value
      xdeltaHz = frame.sample_rate / Math.max(1, frame.bins.length)
      xstartMHz = xstartHz / HZ_PER_MHZ
      xdeltaMHz = xdeltaHz / HZ_PER_MHZ
      // Drive freq tick spacing in 0.1 MHz steps regardless of the device's
      // sample-rate span. xdiv == (span in MHz) / 0.1. change_settings() does
      // not handle xdiv, so write to _Gx directly.
      const spanMHz = frame.sample_rate / HZ_PER_MHZ
      const xdiv = Math.max(2, Math.round(spanMHz / 0.1))
      ;(specPlot as unknown as { _Gx: { xdiv: number } })._Gx.xdiv = xdiv
      ;(wfPlot as unknown as { _Gx: { xdiv: number } })._Gx.xdiv = xdiv
      buildPipes(frame.bins.length)
      // buildPipes rebuilds the layers and resets the zoom level — reapply the
      // current zoom window around the new centre so it survives retuning.
      applyZoom()
      // Re-pin the marker (and refresh its min/max_width to the new span). The
      // plugin instances persist across the rebuild; only the values need
      // re-asserting since xstart/xdelta changed.
      applyMarker()
    }

    // Waterfall: one raster row per frame, rate-capped to WF_ROW_HZ.
    const now = performance.now()
    if (now - lastRowMs >= WF_ROW_MIN_MS) {
      lastRowMs = now
      wfPlot.push(wfUuid, frame.bins)
      recordRowPushTime(Date.now(), frame.bins)
      // sigplot's Layer2D push only writes the layer's advancing time-window
      // (this.ymin/this.ymax) back into Mx.stk when Mx.level === 0
      // (sigplot.layer2d.js:409-414). When the user has zoomed, Mx.level > 0
      // and the stack entry stays pinned to the y-window captured at zoom
      // time. As new rows come in, the layer's effective time-window drifts
      // forward, but the zoom level keeps showing the old window — visible
      // symptom is an empty band growing up from the bottom of the
      // waterfall. Mirror the stk[0] update into the active level so the zoom
      // window tracks live data.
      const wfMx = (
        wfPlot as unknown as {
          _Mx: { level: number; stk: Array<{ ymin: number; ymax: number }> }
          _Gx: { lyr: Array<{ ymin: number; ymax: number }> }
        }
      )._Mx
      const wfGx = (
        wfPlot as unknown as {
          _Gx: { lyr: Array<{ ymin: number; ymax: number }> }
        }
      )._Gx
      if (wfMx.level > 0 && wfGx.lyr.length > 0 && wfMx.stk[wfMx.level]) {
        wfMx.stk[wfMx.level].ymin = wfGx.lyr[0].ymin
        wfMx.stk[wfMx.level].ymax = wfGx.lyr[0].ymax
      }
    }

    // Spectrum line: keep the latest frame, redraw once per animation frame.
    pendingFrame = frame
    if (!drawRaf) drawRaf = requestAnimationFrame(drawLoop)
  },
)

// When playback stops, blank both plots so the display goes idle (rather than
// freezing on the last frame). On Play, frames resume via the watch above.
watch(
  () => store.playing,
  (isPlaying) => {
    if (isPlaying || !specPlot || !wfPlot || !subsize) return
    // Drop any frame queued for the next paint so it can't draw post-stop.
    if (drawRaf) {
      cancelAnimationFrame(drawRaf)
      drawRaf = 0
    }
    pendingFrame = null
    const blank = new Float32Array(subsize)
    try {
      specPlot.reload(specUuid, blank)
    } catch {
      /* noop */
    }
    // Rebuild the waterfall pipe to clear its scroll history.
    clearRowPushTimes()
    try {
      wfPlot.remove_layer(wfUuid)
      wfUuid = wfPlot.overlay_pipe(
        {
          type: 2000,
          subsize,
          xunits: 3,
          // Same Hz scaling as buildPipes — without xstart/xdelta the axis
          // defaults to a 0..N bin index, which after a stop/play cycle leaves
          // the waterfall (and its marker) misaligned with the spectrum.
          xstart: xstartHz,
          xdelta: xdeltaHz,
          lps: WF_ROWS,
          pipesize: WF_ROWS * subsize * 2,
        },
        { drawmode: 'falling', framesize: subsize },
      )
      // Keep the user's Min/Max range on the blanked canvas. The Max/Min sliders
      // are persisted UI preferences (like Zoom) — they MUST survive a stop, a
      // retune (which can briefly drop playback), and navigating away and back.
      // So do NOT reset zmin/zmax here: only colour-auto-scale when the user has
      // never touched the sliders (autoScale still true), otherwise reapply their
      // fixed range so the next play resumes exactly where they left it.
      if (autoScale.value) {
        wfPlot.change_settings({ cmap: 1, autol: WF_AUTOL })
      } else {
        wfPlot.change_settings({ cmap: 1, autol: -1, zmin: zmin.value, zmax: zmax.value })
      }
    } catch {
      /* noop */
    }
    // Hide the marker while stopped (the pipe rebuild dropped its canvas draw
    // anyway); applyMarker reads store.playing for visibility.
    applyMarker()
  },
)

// Track external tuning (typed freq, saved-freq click, mode change, backend
// status reconcile — all flow into the store) and play/stop visibility. Skip
// while WE are mid programmatic write to avoid feeding our own change back.
watch(
  () =>
    [store.currentFreqHz, store.bwHz, store.sampleRate, store.playing, store.currentMode] as const,
  () => {
    // isWritingBracket() is only ever true within a synchronous accordion write
    // (reset in the same tick's finally), and those writes never mutate the
    // store values this watch tracks — so it is always false when this fires.
    /* v8 ignore start */
    if (!isWritingBracket()) applyMarker()
    /* v8 ignore stop */
  },
)

// Moving Min or Max retargets BOTH the spectrum y-axis and the waterfall
// colour range (SDR++ User Guide v1.1 pp. 30-31). Also switches the waterfall
// out of auto-scale; once a slider is touched it stays under manual control
// until play/stop resets the component.
// Track which slider the user moved last so the collision guard below knows
// which one to clamp. SDR++ keeps the stationary slider fixed and stops the
// moving one short of it (Min raised into Max stops at Max-1, not bumping Max
// upward).
let lastTouched: 'min' | 'max' | null = null
watch(zmin, () => {
  lastTouched = 'min'
})
watch(zmax, () => {
  lastTouched = 'max'
})

watch([zmin, zmax], ([lo, hi]) => {
  // Guard against the user dragging one slider past the other: clamp the
  // moving slider to leave a 1 dB gap, leaving the stationary one untouched.
  // SDR++ behaviour — see User Guide v1.1 p. 31 (Min/Max are independent
  // endpoints; raising Min into Max does not push Max).
  if (hi <= lo) {
    // A zmin/zmax change always fires its own watch(zmin)/watch(zmax) first
    // (setting lastTouched) before this combined watcher runs, so lastTouched is
    // always 'min' or 'max' here — clamp whichever the user just moved.
    if (lastTouched === 'min') {
      zmin.value = hi - 1
    } else {
      zmax.value = lo + 1
    }
    return
  }
  autoScale.value = false
  applySpecRange(lo, hi)
  // Persist so the Max/Min range survives navigating away and back.
  store.setViewSettings({ zmin: lo, zmax: hi, autoScale: false })
  // Re-measure: the freq-label gridline position depends on the live dB range.
  syncBandInset()
})

// Moving the Zoom slider re-windows both plots around the tuned centre. The
// FFT bin count stays pinned to its mount-time value (the SDR++ default
// behaviour, User Guide v1.1 p. 34): the raster gets pixelated when zoomed in,
// but the waterfall history is preserved across zoom changes — changing the bin
// count would trigger buildPipes() in the frame watcher and wipe it.
watch(zoom, (z) => {
  applyZoom()
  // Persist so the zoom level survives navigating away and back.
  store.setViewSettings({ zoom: z })
})

// Re-window when the selected frequency moves while zoomed in. Retuning with
// auto-centre ON changes the span centre, which rebuilds the layers (frame
// watcher → buildPipes → applyZoom). But with auto-centre OFF the span centre
// is unchanged — only the demod target (currentFreqHz) moves — so without this
// the zoom viewport would stay pinned to the previous frequency. No-op at
// zoom <= 1 (applyZoom takes the unzoom path). The overlay computeds already
// track currentFreqHz reactively via zoomWindowHz().
watch(
  () => store.currentFreqHz,
  () => {
    if (zoom.value > ZOOM_MIN) applyZoom()
  },
)

onBeforeUnmount(() => {
  // rafId is assigned in onMounted and never reset to 0 (it holds the last init
  // rAF id), so it is always truthy at unmount — the null arm never runs.
  /* v8 ignore start */
  if (rafId) cancelAnimationFrame(rafId)
  /* v8 ignore stop */
  if (drawRaf) cancelAnimationFrame(drawRaf)
  pendingFrame = null
  ro?.disconnect()
  ro = null
  controlsRo?.disconnect()
  controlsRo = null
  detachAccordions()
  detachAnnotationPlugin()
  try {
    specPlot?.remove_layer(specUuid)
  } catch {
    /* noop */
  }
  try {
    wfPlot?.remove_layer(wfUuid)
  } catch {
    /* noop */
  }
  try {
    specPlot?.disable_listeners()
  } catch {
    /* noop */
  }
  try {
    wfPlot?.disable_listeners()
  } catch {
    /* noop */
  }
  specPlot = null
  wfPlot = null
})
</script>

<template>
  <div
    id="sdr-waterfall"
    ref="rootEl"
    :class="{
      'panel-closed': !panelOpen,
      'edge-resize': nearEdge,
      'decode-open': store.decodeDockOpen,
      'not-playing': !store.playing,
      sweeping: sweeping,
    }"
  >
    <div v-if="store.searchSweeping" class="sdr-wf-search-overlay">
      <div class="sdr-wf-search-overlay-inner">
        <div class="sdr-wf-search-overlay-stack">
          <div class="sdr-wf-search-overlay-headline">Searching</div>
          <div v-if="store.searchLabel" class="sdr-wf-scan-overlay-groups">
            <BaseChip as="span" active>{{ store.searchLabel }}</BaseChip>
          </div>
          <div
            class="sdr-wf-search-overlay-progress"
            :aria-valuenow="searchOverlayProgressPct"
            aria-valuemin="0"
            aria-valuemax="100"
            role="progressbar"
          >
            <div
              class="sdr-wf-search-overlay-progress-fill"
              :style="{ width: searchOverlayProgressPct + '%' }"
            ></div>
          </div>
          <div class="sdr-wf-search-overlay-range">
            <span class="sdr-wf-search-overlay-range-val">{{ searchOverlayLowMHz }}</span>
            <span class="sdr-wf-search-overlay-range-sep">→</span>
            <span class="sdr-wf-search-overlay-range-val">{{ searchOverlayHighMHz }}</span>
            <span class="sdr-wf-search-overlay-range-unit">MHz</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="store.scanSweeping" class="sdr-wf-search-overlay">
      <div class="sdr-wf-search-overlay-inner">
        <div class="sdr-wf-search-overlay-stack">
          <div class="sdr-wf-search-overlay-headline">Scanning</div>
          <div class="sdr-wf-scan-overlay-groups">
            <BaseChip
              v-for="(name, idx) in store.scanGroupNames"
              :key="name + idx"
              as="span"
              active
              >{{ name }}</BaseChip
            >
          </div>
        </div>
      </div>
    </div>
    <div ref="controlsEl" class="sdr-wf-controls">
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Zoom</span>
        <div class="sdr-wf-slider-wrap">
          <input
            v-model.number="zoom"
            class="sdr-wf-slider"
            type="range"
            :min="ZOOM_MIN"
            :max="ZOOM_MAX"
            step="0.5"
            :disabled="!store.playing || sweeping"
            :aria-label="`Zoom ${zoom}x`"
          />
        </div>
      </div>
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Max</span>
        <div class="sdr-wf-slider-wrap">
          <input
            v-model.number="zmaxSlider"
            class="sdr-wf-slider"
            type="range"
            min="0"
            max="80"
            step="1"
            :disabled="!store.playing || sweeping"
            :aria-label="`Max ${zmax} dB`"
          />
        </div>
      </div>
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Min</span>
        <div class="sdr-wf-slider-wrap">
          <input
            v-model.number="zminSlider"
            class="sdr-wf-slider"
            type="range"
            min="20"
            max="120"
            step="1"
            :disabled="!store.playing || sweeping"
            :aria-label="`Min ${zmin} dB`"
          />
        </div>
      </div>
    </div>
    <div
      ref="specEl"
      class="sdr-wf-spectrum"
      :class="{ 'sdr-wf-spectrum--panning': freqDragging }"
      :style="spectrumStyle"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @touchstart.capture="onPlotTouchStart"
      @wheel.capture="onPlotWheel"
      @contextmenu.prevent
    >
      <div
        v-if="store.displayBandPlan && visibleBands.length > 0"
        class="sdr-wf-band-overlay"
        :style="bandOverlayStyle"
      >
        <div
          v-for="b in visibleBands"
          :key="b.key"
          class="sdr-wf-band"
          :style="{ left: b.leftPct + '%', width: b.widthPct + '%' }"
          :title="b.name"
        >
          <span v-if="b.label">{{ b.label }}</span>
        </div>
      </div>
      <div class="sdr-wf-tick-gutter" :style="tickGutterStyle">
        <div
          v-for="t in freqTicks"
          :key="t.key"
          class="sdr-wf-tick"
          :style="{ left: t.leftPct + '%' }"
        ></div>
        <span
          v-for="t in freqTicks"
          v-show="t.labeled"
          :key="`l-${t.key}`"
          class="sdr-wf-freq-label"
          :style="{ left: t.leftPct + '%' }"
          >{{ t.label }}</span
        >
      </div>
      <div
        v-if="store.displayKnownFrequencies && visibleKnownFreqs.length > 0"
        class="sdr-wf-known-overlay"
        :style="knownFreqOverlayStyle"
      >
        <div
          v-for="f in visibleKnownFreqs"
          :key="f.key"
          class="sdr-wf-known-marker"
          :class="{
            'sdr-wf-known-marker--open': openKnownKey === f.key,
            'sdr-wf-known-marker--tuned': f.tunedLabel !== null,
          }"
          :style="{ left: f.leftPct + '%' }"
        >
          <button
            type="button"
            class="sdr-wf-known-marker-dot"
            :aria-label="f.isCluster ? `${f.count} known frequencies` : f.label"
            :aria-expanded="openKnownKey === f.key"
            @click="toggleKnownMarker(f.key)"
            @pointerenter="onKnownMarkerPointerEnter($event, f.key)"
            @pointerleave="onKnownMarkerPointerLeave(f.key)"
          >
            <svg
              class="sdr-wf-known-marker-glyph"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              overflow="visible"
              aria-hidden="true"
            >
              <!-- Just the green dot of the SENTINEL ⊙ mark — no outer ring. -->
              <circle cx="7" cy="7" r="2.8" fill="#c8ff00" />
            </svg>
            <span v-if="f.isCluster" class="sdr-wf-known-marker-badge">{{ f.count }}</span>
          </button>
          <span
            v-if="f.tunedLabel !== null && !isKnownPopoverShown(f.key)"
            class="sdr-wf-known-marker-tag"
            >{{ f.tunedLabel }}</span
          >
          <div v-if="isKnownPopoverShown(f.key)" class="sdr-wf-known-marker-pop" role="tooltip">
            <template v-if="f.isCluster">
              <span v-for="m in f.members" :key="m.id" class="sdr-wf-known-marker-pop-line">{{
                m.label
              }}</span>
            </template>
            <span v-else class="sdr-wf-known-marker-pop-line">{{ f.label }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      ref="wfEl"
      class="sdr-wf-raster"
      :style="rasterStyle"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @mousemove="onWaterfallMouseMove"
      @mouseleave="onWaterfallMouseLeave"
      @touchstart.capture="onPlotTouchStart"
      @wheel.capture="onPlotWheel"
      @contextmenu.prevent
    >
      <div
        v-if="
          waterfallTimeMarkers.length > 0 ||
          visibleWaterfallSecondTicks.length > 0 ||
          signalMarkerLabels.length > 0
        "
        class="sdr-wf-time-overlay"
        :style="timeMarkerOverlayStyle"
      >
        <div
          v-for="marker in waterfallTimeMarkers"
          :key="marker.key"
          class="sdr-wf-time-marker"
          :style="{ top: marker.topPx + 'px' }"
        >
          <span class="sdr-wf-time-label">{{ marker.label }}</span>
        </div>
        <div
          v-for="tick in visibleWaterfallSecondTicks"
          :key="`sec-${tick.key}`"
          class="sdr-wf-second-tick"
          :style="{ top: tick.topPx + 'px' }"
        ></div>
        <div
          v-for="signalLabel in signalMarkerLabels"
          :key="signalLabel.key"
          class="sdr-wf-time-marker"
          :style="{ top: signalLabel.topPx + 'px' }"
        >
          <span
            class="sdr-wf-time-label"
            :class="
              signalLabel.variant === 'start'
                ? 'sdr-wf-time-label--signal-start'
                : 'sdr-wf-time-label--signal-end'
            "
            >{{ signalLabel.label }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
