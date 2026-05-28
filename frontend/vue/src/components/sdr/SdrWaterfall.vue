<script setup lang="ts">
import './SdrWaterfall.css'
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import sigplot, { type Plot, type AccordionPlugin } from 'sigplot'
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
  Mx: { stk: Array<{ x1: number; y1: number; x2: number; y2: number }>; level: number; active_canvas: HTMLCanvasElement; fg: string; bg: string; width: number; height: number },
  xdiv: number,
  ydiv: number,
  xlab: number,
  ylab: number,
  flags: { noaxisbox?: boolean; exactbox?: boolean; grid?: boolean | string; noxtics?: boolean; noytics?: boolean; noxtlab?: boolean; noytlab?: boolean; noxplab?: boolean; noyplab?: boolean },
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
    b: number; l: number; text_h: number; text_w: number
    canvas?: HTMLCanvasElement
  },
  x: number,
  y: number,
  lbl: string,
  color?: string,
) {
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
    typeof lbl === 'string' && /^-?\d+\.?\d*$/.test(lbl.trim()) &&
    typeof Mx?.b === 'number' && typeof Mx?.text_h === 'number' &&
    y > Mx.b + Mx.text_h * 0.5 && y < Mx.b + Mx.text_h * 2
  // Capture the ORIGINAL label length before any rewrite — sigplot used this
  // length to compute the x it passed in (x = tick − round(origLen/2)*text_w),
  // so recovering the tick position must use the same length. Rewriting first
  // and then using lbl.length here would offset the tick by ±text_w whenever
  // the rewrite changes the character count (e.g. "124." → "124.0").
  const origLen = typeof lbl === 'string' ? lbl.length : 0
  if (typeof lbl === 'string' && /^-?\d+\.$/.test(lbl.trim())) {
    // sigplot's trimlabel() appends a trailing "." to integer tick labels.
    // On the x-axis (MHz) keep one decimal place ("344." → "344.0") so labels
    // read consistently as MHz; elsewhere (y-axis dB) strip the dot.
    lbl = isXAxisLabel ? lbl.replace(/\.$/, '.0') : lbl.replace(/\.$/, '')
  } else if (isXAxisLabel && typeof lbl === 'string' && /^-?\d+$/.test(lbl.trim())) {
    // The first x-axis tick (xTIC.dtic1) bypasses trimlabel() and arrives as a
    // bare integer like "433". Pad it to "433.0" for consistency with the rest.
    lbl = lbl + '.0'
  }
  if (isXAxisLabel) {
    // X-axis freq labels are rendered as HTML in the template (.sdr-wf-freq-label)
    // so each label gets its own background box. Skip the canvas draw entirely.
    return
  }
  return _origMxText.call(this, Mx, x, y, lbl, color)
}
import { useSdrStore, type SdrMode } from '@/stores/sdr'
import { useSettingsStore } from '@/stores/settings'
import { useDocumentEvent } from '@/composables/useDocumentEvent'

const store = useSdrStore()
const settings = useSettingsStore()

// ── RF band plan ─────────────────────────────────────────────────────────────
// Reference allocations used to label the spectrum (e.g. "Medium Wave"). Sourced
// from the sdr.bandPlan config setting (seeded from backend/default_config.json).
interface RfBand { name: string; startHz: number; endHz: number }
const bandPlan = computed<RfBand[]>(() =>
  settings.getSetting<RfBand[]>('sdr', 'bandPlan', []),
)

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
// Height of the band overlay in pixels. Set so the top of the strip aligns
// with the -100 dB horizontal gridline in the spectrum (data-box-relative).
const bandHeightPx = ref(0)

// Pixel distance from the BOTTOM of .sdr-wf-spectrum up to the first horizontal
// dB gridline above the floor (one ydiv step above zmin). The freq labels are
// centred on this line.
const firstGridlineFromBottomPx = ref(0)

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
  height: bandHeightPx.value > 0 ? `${bandHeightPx.value}px` : undefined,
}))

// The waterfall flex sibling sits flush against .sdr-wf-spectrum's bottom
// edge — sigplot draws the spectrum's x-axis frequency labels in the bottom
// gutter of its canvas, so without margin the waterfall covers them. Margin
// matches the live label-gutter height (height − Mx.b, same value used for
// the band overlay's bottom inset) so the gap is always exactly enough.
const spectrumStyle = computed(() => ({
  marginBottom: `${bandInsetBottomPx.value}px`,
}))

// ── Layout: track the SDR side panel open/closed state ───────────────────────
function _readSidebarOpen(): boolean {
  try { return sessionStorage.getItem('sentinel_sidebar_open') === '1' } catch { return false }
}
const panelOpen = ref<boolean>(_readSidebarOpen())
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  panelOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

// Pull the overlay-visibility flags from the DB whenever a config JSON upload
// replaces them, so the waterfall reacts even when the settings panel isn't
// mounted (the toggle controls also subscribe, but only while rendered).
useDocumentEvent('sentinel:config-uploaded', () => {
  void store.hydrateShowBandPlanFromDb()
  void store.hydrateShowKnownFreqsFromDb()
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
const zmin = ref(0)  // seeded from DEVICE_DB_RANGE below
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
  set: (v: number) => { zmax.value = -v },
})
const zminSlider = computed({
  get: () => -zmin.value,
  set: (v: number) => { zmin.value = -v },
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
const zoom = ref(ZOOM_MIN)

// The visible (zoom-aware) frequency window for the current span. Centred on
// the selected frequency, then clamped so the window never extends past the
// span edges (zooming into a near-edge frequency slides the window inward
// rather than showing empty space outside the data). At zoom <= 1 this is the
// full span. Single source of truth for applyZoom() AND every overlay computed
// (visibleBands / freqTicks / visibleKnownFreqs / onPlotMouseUp) so the trace
// and overlays always agree on what's on screen.
function zoomWindowHz(lo: number, hi: number): { winLo: number; winHi: number } {
  if (zoom.value <= ZOOM_MIN || hi <= lo) return { winLo: lo, winHi: hi }
  const win = (hi - lo) / zoom.value
  const halfWin = win / 2
  // Selected frequency; fall back to the span midpoint if not yet known.
  const sel = store.currentFreqHz || (lo + hi) / 2
  // Clamp the centre so [centre-halfWin, centre+halfWin] stays inside [lo, hi].
  const center = Math.min(hi - halfWin, Math.max(lo + halfWin, sel))
  return { winLo: center - halfWin, winHi: center + halfWin }
}

function applyZoom() {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return
  // Zoom is a pure viewport change — sigplot.zoom() re-windows the existing
  // raster in place. Do NOT rebuild the pipe here: that would wipe the
  // waterfall history. Historical rows simply stretch across the new viewport.
  if (zoom.value <= ZOOM_MIN) {
    try { specPlot?.unzoom() } catch { /* noop */ }
    try { wfPlot?.unzoom() } catch { /* noop */ }
    return
  }
  // Window centred on the selected frequency, clamped to the span edges.
  const { winLo: x1Hz, winHi: x2Hz } = zoomWindowHz(lo, hi)
  // The two plots are in DIFFERENT x-units (see comment near specAcc/wfAcc):
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
  try { specPlot?.unzoom() } catch { /* noop */ }
  try { wfPlot?.unzoom() } catch { /* noop */ }
  try { specPlot?.zoom({ x: x1MHz }, { x: x2MHz }, false) } catch { /* noop */ }
  try { wfPlot?.zoom({ x: x1Hz }, { x: x2Hz }, false) } catch { /* noop */ }
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
// The backend emits dBFS (0 dB = full-scale tone — see backend/services/sdr.py).
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
  rtl_tcp:  { ymin: -100, ymax: 0 }, // 8-bit IQ (only device wired today)
  hackrf:   { ymin: -100, ymax: 0 }, // 8-bit IQ  — placeholder
  airspy:   { ymin: -120, ymax: 0 }, // 12-bit IQ — placeholder
  sdrplay:  { ymin: -140, ymax: 0 }, // 14-bit IQ — placeholder
}
const ACTIVE_DEVICE: SdrDeviceId = 'rtl_tcp'
const SPEC_YMIN_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymin
const SPEC_YMAX_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymax
// Seed the sliders with the device's default range — must happen after both
// the refs (above) and the DEVICE_DB_RANGE constants are declared.
zmin.value = SPEC_YMIN_DB
zmax.value = SPEC_YMAX_DB

// Apply a (min, max) dB range to BOTH plots: spectrum trace y-axis and
// waterfall colour map. ydiv is recomputed so tick steps land on endpoints
// (sigplot pins dtic1 = ymin when ydiv is negative — see plot init for the
// rationale). Called from the [zmin, zmax] watcher.
function applySpecRange(lo: number, hi: number) {
  if (!(hi > lo)) return
  const span = hi - lo
  const ydiv = -Math.max(1, Math.round(span / 20))
  try { specPlot?.change_settings({ ymin: lo, ymax: hi, ydiv }) } catch { /* noop */ }
  try { wfPlot?.change_settings({ autol: -1, zmin: lo, zmax: hi }) } catch { /* noop */ }
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

// ── Tuned-frequency marker (SigPlot Accordion plugin) ────────────────────────
// Two instances because the two plots use different x-axis units (verified):
// the SPECTRUM layer x is in MHz (xstartMHz/xdeltaMHz) while the WATERFALL
// layer x is in raw Hz. With mode:'absolute' the accordion positions itself in
// the plot's x data units, so each instance gets its centre/width in that
// plot's units. Single source of truth is the store (currentFreqHz + bwHz).
let specAcc: AccordionPlugin | null = null   // MHz spectrum plot — shaded passband
let wfAcc: AccordionPlugin | null = null     // Hz waterfall plot — shaded passband
// Carrier-line accordions: zero-shade, single line drawn on the actual carrier
// frequency. Decoupled from the passband shading so SSB modes (USB/LSB) can
// shift the shaded rectangle to one side while keeping the tuning line on the
// carrier itself, matching SDR#.
let specCar: AccordionPlugin | null = null
let wfCar: AccordionPlugin | null = null

// SDR# convention: SSB modes draw the passband on a single side of the carrier
// (USB → above, LSB → below). Other modes are symmetric around the carrier.
// The carrier itself stays at the red centre line on the plot; only the shaded
// rectangle shifts. Inverse undoes the shift so a drag commits the carrier, not
// the bracket centre.
function bracketGeomHz(carrierHz: number, bwHz: number, mode: SdrMode) {
  if (mode === 'USB') return { centerHz: carrierHz + bwHz / 2, widthHz: bwHz }
  if (mode === 'LSB') return { centerHz: carrierHz - bwHz / 2, widthHz: bwHz }
  return { centerHz: carrierHz, widthHz: bwHz }
}
function carrierFromBracketHz(centerHz: number, widthHz: number, mode: SdrMode) {
  if (mode === 'USB') return centerHz - widthHz / 2
  if (mode === 'LSB') return centerHz + widthHz / 2
  return centerHz
}

// Known-frequency labels (from the frequency manager). Sigplot AnnotationPlugin
// renders text/images on the spectrum canvas with native Hz→pixel mapping and
// auto-clipping at the data box. Each annotation's `value` is a pre-rendered
// off-screen canvas with a vertical line + label text, so sigplot handles
// positioning under zoom/tune for free.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let knownFreqPlugin: any = null
let lastCommittedFreqHz = 0
let lastCommittedBwHz = 0
// Independent drag baseline, snapshotted on mousedown over an accordion. The
// mouseup handler diffs the live centre/width against THIS — not against
// lastCommitted*, which applyMarker() overwrites on every store change (and a
// reactive bwHz round-trip can fire applyMarker mid-drag, resetting the
// baseline to the dragged value → mouseup sees zero delta → "nothing dragged"
// and the change is lost before it ever reaches the panel).
let dragBaseFreqHz = 0
let dragBaseBwHz = 0
let dragActive = false
// Guards the document mouseup handler while WE set centre/width programmatically
// (applyMarker / post-drag re-sync) so our own writes aren't read back as a
// user drag.
let suppressAccEvents = false
// True while the cursor is hovering an accordion edge (the resize zone). Drives
// a cursor: ew-resize override so the user sees a resize affordance instead of
// the plot's default crosshair. sigplot computes this hit-test for us and
// stores it on properties.edge_highlight during its own _onMouseMove.
const nearEdge = ref(false)
const MIN_BW_HZ = 200

// Render one known-frequency marker (line + label) onto an off-screen canvas.
// AnnotationPlugin draws it centred on (pxl.x, pxl.y), so we build the marker
// with the vertical line dead-centre horizontally — the line then lands exactly
// on the frequency pixel. The label sits on the right of the line. `rowOffset`
// shifts the canvas vertically by N×rowHeight so clustered labels stagger.
// Known-frequency markers — rendered as HTML in the template (SVG ring +
// label box), matching the map's "SET LOCATION" pop-up style. AnnotationPlugin
// is kept attached but empty (vertical line removed; the SVG ring is the
// frequency indicator).
const KNOWN_FREQ_MAX_ROWS = 3

// Shared off-screen 2D context used to measure the rendered pixel width of
// label text. Created lazily so SSR/jsdom paths never touch document. Cheap to
// keep around — the canvas isn't attached anywhere.
let _labelMeasureCtx: CanvasRenderingContext2D | null = null
function labelMeasureCtx(): CanvasRenderingContext2D {
  if (!_labelMeasureCtx) {
    const c = document.createElement('canvas')
    _labelMeasureCtx = c.getContext('2d')!
    _labelMeasureCtx.font = '700 11px "Barlow", sans-serif'
  }
  return _labelMeasureCtx
}

// Visible known frequencies for the HTML label overlay: zoom-aware leftPct
// matching visibleBands math, plus a staggered `row` index so clustered labels
// don't overlap. Returns the same data set used to drive the canvas annotations
// (kept consistent so the line + label always pair up).
interface KnownFreqEntry {
  key: string
  label: string
  frequencyHz: number
  leftPct: number
  row: number
}
const visibleKnownFreqs = computed<KnownFreqEntry[]>(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return []
  const { winLo, winHi } = zoomWindowHz(lo, hi)
  const w = winHi - winLo
  // All markers sit on a single row by default. The CSS uses `flex-end` and
  // `flex-wrap` on the overlay so when labels would overlap, the browser wraps
  // them to additional rows automatically — no manual stagger math required.
  const out: KnownFreqEntry[] = []
  for (const f of store.frequencies) {
    if (f.frequency_hz < winLo || f.frequency_hz > winHi) continue
    out.push({
      key: String(f.id),
      label: f.label,
      frequencyHz: f.frequency_hz,
      leftPct: ((f.frequency_hz - winLo) / w) * 100,
      row: 0,
    })
  }
  return out
})

// No-op kept for the existing watchers — the HTML overlay (visibleKnownFreqs)
// drives all rendering now. The AnnotationPlugin was previously used for the
// vertical canvas line, which has been replaced by the SVG ring on the HTML
// marker. Leave the plugin attached but empty (cheap; harmless).
function syncKnownFrequencies() {
  if (!knownFreqPlugin) return
  knownFreqPlugin.clear_annotations()
  try { specPlot?.redraw() } catch { /* noop */ }
}

// Push the store's tuned freq + demod bandwidth onto BOTH accordions, each in
// its plot's x units (spectrum=MHz, waterfall=Hz). Also refreshes the drag
// limits to the current span and the visible/hidden state from play status.
// Cheap to call repeatedly — the fluent setter no-ops on unchanged values.
function applyMarker() {
  if (!specAcc || !wfAcc) return
  const fHz = store.currentFreqHz
  const bHz = Math.max(MIN_BW_HZ, store.bwHz || 10000)
  const span =
    store.sampleRate || (spanEndHz.value - spanStartHz.value) || bHz
  const { centerHz, widthHz } = bracketGeomHz(fHz, bHz, store.currentMode)
  // Carrier-line accordions hold a fixed near-zero width — they only draw the
  // tuning line at the actual carrier, never participate in passband shading.
  const CARRIER_W_HZ = 1
  suppressAccEvents = true
  try {
    specAcc.center(centerHz / HZ_PER_MHZ)
    specAcc.width(widthHz / HZ_PER_MHZ)
    specAcc.min_width(MIN_BW_HZ / HZ_PER_MHZ)
    specAcc.max_width(span / HZ_PER_MHZ)
    wfAcc.center(centerHz)
    wfAcc.width(widthHz)
    wfAcc.min_width(MIN_BW_HZ)
    wfAcc.max_width(span)
    if (specCar) {
      specCar.center(fHz / HZ_PER_MHZ)
      specCar.width(CARRIER_W_HZ / HZ_PER_MHZ)
      specCar.min_width(CARRIER_W_HZ / HZ_PER_MHZ)
      specCar.max_width(span / HZ_PER_MHZ)
    }
    if (wfCar) {
      wfCar.center(fHz)
      wfCar.width(CARRIER_W_HZ)
      wfCar.min_width(CARRIER_W_HZ)
      wfCar.max_width(span)
    }
    const vis = store.playing
    specAcc.display(vis)
    wfAcc.display(vis)
    if (specCar) specCar.display(vis)
    if (wfCar) wfCar.display(vis)
  } finally {
    suppressAccEvents = false
  }
  lastCommittedFreqHz = fHz
  lastCommittedBwHz = bHz
}

// Bands that intersect the visible (zoom-aware) frequency window, each with
// its position as a 0..100% fraction across the plot's data area. Consumed
// by the HTML band overlay in the template — coloured rectangles sit on the
// bottom of the spectrum canvas with the band name centred inside.
//
// Zoom handling mirrors applyZoom() / onPlotMouseUp(): the visible window is
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
  const nsig = df < 1 ? Math.ceil(Math.log10(Math.max(df, 1e-36))) - 1
                      : Math.floor(Math.log10(Math.max(df, 1e-36)))
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
  const decimals = Math.max(1, Math.min(6, -Math.floor(Math.log10(dticMHz)) + (dticMHz < 1 ? 1 : 0)))
  const ticks: { key: string; leftPct: number; label: string }[] = []
  for (let f = first; f <= winHi; f += stepHz) {
    const mhz = f / HZ_PER_MHZ
    ticks.push({
      key: `t-${f}`,
      leftPct: ((f - winLo) / w) * 100,
      label: mhz.toFixed(decimals),
    })
  }
  return ticks
})

// Inline style for the tick gutter overlay — spans the data box horizontally
// (same insets as the band overlay) and the freq-label gutter vertically.
const tickGutterStyle = computed(() => ({
  left: `${bandInsetLeftPx.value}px`,
  right: `${bandInsetRightPx.value}px`,
  height: `${bandInsetBottomPx.value}px`,
}))

// Inline style for the known-frequency label overlay — a zero-height strip
// whose bottom edge sits one division up from the data-box floor; each marker
// is centred vertically on that line (translateY(50%) in CSS). The vertical
// anchor is a fixed fraction of the data box (see syncBandInset) so the labels
// stay put when the Min/Max sliders move. Horizontal insets match the data box.
const knownFreqOverlayStyle = computed(() => ({
  left: `${bandInsetLeftPx.value}px`,
  right: `${bandInsetRightPx.value}px`,
  bottom: `${firstGridlineFromBottomPx.value}px`,
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
  const el = mdownEl
  mdownEl = null
  if (e.button !== 0 || !el || el !== e.currentTarget) return
  // A marker drag also ends with a mouseup over the plot — ignore it.
  if (dragActive || accIsDragging(specAcc) || accIsDragging(wfAcc)) return
  // Moved more than the slop? It was a drag/pan, not a click.
  if (
    Math.abs(e.clientX - mdownX) > CLICK_SLOP_PX ||
    Math.abs(e.clientY - mdownY) > CLICK_SLOP_PX
  ) return
  if (!store.playing) return
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return
  const rect = el.getBoundingClientRect()
  const dataLeft = rect.left + bandInsetLeftPx.value
  const dataWidth = rect.width - bandInsetLeftPx.value - bandInsetRightPx.value
  if (dataWidth <= 0) return
  let frac = (e.clientX - dataLeft) / dataWidth
  frac = Math.min(1, Math.max(0, frac))
  // Account for an active horizontal zoom: the visible window is the full span
  // / zoom, centred on the selected frequency and clamped to the span. Map the
  // fraction within that window, not the full span, so a click lands on what
  // the user sees.
  const { winLo, winHi } = zoomWindowHz(lo, hi)
  const freqHz = Math.round(winLo + frac * (winHi - winLo))
  if (store.autoCenterWaterfallOnTune) {
    // Auto-centre ON: retune the hardware so the clicked freq becomes the new
    // span centre. Clear any prior demod offset — the bar returns to centre.
    store.setTuningOffsetHz(0)
  } else {
    // Auto-centre OFF: keep the hardware where it is; the audio NCO offset
    // (clicked − hardware centre) demodulates the clicked freq instead. The
    // hardware centre is the live frame centre (midpoint of the full span),
    // NOT currentFreqHz (the demod target, which may already be off-centre).
    const hwCenter = (lo + hi) / 2
    store.setTuningOffsetHz(Math.round(freqHz - hwCenter))
  }
  // Both paths go through requestTune so the panel updates the displayed freq
  // (currentFreqHz / readout / input) and the marker follows. The panel skips
  // the hardware retune when auto-centre is OFF (offset handles the audio).
  store.requestTune(freqHz)
}

// Read the spectrum plot's real data-area margins (Mx.l / Mx.r / Mx.b) and
// drive the HTML band overlay's inset from them so it lines up with the data
// area on all three edges (top is intentionally open — the strip grows up
// from the data-box bottom). Mx is sigplot-internal (no public accessor); the
// plugin base reads it the same way (this._plot._Mx), so this is the
// supported-by-precedent path.
function syncBandInset() {
  const mx = (specPlot as unknown as {
    _Mx?: { l: number; r: number; t: number; b: number; width: number; height: number }
  } | null)?._Mx
  if (!mx || !mx.width) return
  bandInsetLeftPx.value = Math.max(0, Math.floor(mx.l))
  bandInsetRightPx.value = Math.max(0, Math.ceil(mx.width - mx.r))
  // mx.b is the pixel y of the data-box BOTTOM (sigplot draws ticks/labels
  // below it). Distance from the canvas/element bottom = height − b.
  bandInsetBottomPx.value = Math.max(0, Math.ceil(mx.height - mx.b))
  bandInsetTopPx.value = Math.max(0, Math.ceil(mx.t) - 1)
  // Band overlay grows up from the data-box bottom to the -100 dB gridline.
  // mx.t..mx.b span the y-axis range SPEC_YMAX_DB..SPEC_YMIN_DB.
  const dataBoxHeightPx = mx.b - mx.t
  const yRangeDb = SPEC_YMAX_DB - SPEC_YMIN_DB
  if (dataBoxHeightPx > 0 && yRangeDb > 0) {
    const TARGET_DB = -100
    const dbFromBottom = TARGET_DB - SPEC_YMIN_DB
    bandHeightPx.value = Math.max(20, Math.round((dbFromBottom / yRangeDb) * dataBoxHeightPx * 0.1875) + 4)
  }
  // Known-freq labels (TRANSATLANTIC etc.) anchor one division up from the
  // data-box floor. This MUST be pinned to a FIXED fraction of the data box,
  // NOT the live (zmax-zmin) slider span: the data box is a fixed pixel
  // rectangle that always maps onto whatever range the Min/Max sliders set, so
  // deriving the anchor from the live span makes the labels slide up/down as
  // the user drags the sliders. Use the STATIC device dB range (same constants
  // the band overlay uses) so the labels hold their vertical position.
  if (dataBoxHeightPx > 0) {
    const staticSpanDb = SPEC_YMAX_DB - SPEC_YMIN_DB
    const ndiv = Math.max(1, Math.round(staticSpanDb / 20))
    // One division above the floor = 1/ndiv of the data-box height.
    const gridlineFromBoxBottomPx = dataBoxHeightPx / ndiv
    firstGridlineFromBottomPx.value =
      Math.max(0, Math.round(gridlineFromBoxBottomPx + (mx.height - mx.b)))
  }
}

// Type for poking the plugin's internal drag flags (no public accessor).
type AccDragState = { dragging?: boolean; edge_dragging?: boolean }
function accIsDragging(a: AccordionPlugin | null): boolean {
  const s = a as unknown as AccDragState | null
  return !!s && (!!s.dragging || !!s.edge_dragging)
}
function accIsEdgeDragging(a: AccordionPlugin | null): boolean {
  const s = a as unknown as AccDragState | null
  return !!s && !!s.edge_dragging
}

// Live mirror: while the user drags one plot's accordion, sigplot's
// _onMouseMove updates ONLY that plot (and refreshes only it). Mirror its live
// centre/width onto the OTHER plot every mousemove so both move together
// instead of the other one snapping only on release. Units differ (spectrum =
// MHz, waterfall = Hz), so convert per direction. suppressAccEvents stops the
// mirrored setter from being read back as a second drag.
// Snapshot the pre-drag baseline the instant the user grabs an accordion. The
// sigplot accordion sets its dragging/edge_dragging flag in its own mousedown
// (fired via the plot's internal 'mdown' before this document-level handler on
// the same native event), so by the time we run accIsDragging() it's already
// true. We capture the CURRENT live centre/width as the baseline — this is the
// value before the user moves the mouse — and freeze it for the whole drag.
useDocumentEvent('mousedown', () => {
  if (!specAcc || !wfAcc) return
  if (!accIsDragging(specAcc) && !accIsDragging(wfAcc)) return
  dragBaseBwHz = wfAcc.width()
  dragBaseFreqHz = carrierFromBracketHz(wfAcc.center(), dragBaseBwHz, store.currentMode)
  dragActive = true
})

useDocumentEvent('mousemove', () => {
  if (suppressAccEvents || !specAcc || !wfAcc) return
  const specDragging = accIsDragging(specAcc)
  const wfDragging = accIsDragging(wfAcc)
  if (!specDragging && !wfDragging) return
  const mode = store.currentMode
  const isSSB = mode === 'USB' || mode === 'LSB'
  const edgeDragging = isSSB && (accIsEdgeDragging(specAcc) || accIsEdgeDragging(wfAcc))
  suppressAccEvents = true
  try {
    // Read sigplot's just-updated geometry from whichever accordion the user
    // grabbed (units: spectrum=MHz, waterfall=Hz).
    let rawCenterHz: number
    let rawWidthHz: number
    if (specDragging) {
      rawCenterHz = specAcc.center() * HZ_PER_MHZ
      rawWidthHz = specAcc.width() * HZ_PER_MHZ
    } else {
      rawCenterHz = wfAcc.center()
      rawWidthHz = wfAcc.width()
    }

    let carrierHz: number
    let widthHz: number
    if (isSSB && edgeDragging) {
      // Resize: keep the carrier-side edge pinned to the original carrier and
      // let the outer edge follow the cursor. sigplot grows width symmetrically
      // around its (shifted) centre, so the outer edge is at
      //   USB: rawCenter + rawWidth/2  (above the carrier)
      //   LSB: rawCenter - rawWidth/2  (below the carrier)
      // New width = distance from carrier to that outer edge.
      carrierHz = dragBaseFreqHz
      const outerHz = mode === 'USB'
        ? rawCenterHz + rawWidthHz / 2
        : rawCenterHz - rawWidthHz / 2
      widthHz = Math.max(MIN_BW_HZ, Math.abs(outerHz - carrierHz))
    } else if (isSSB) {
      // Move: sigplot moved the bracket centre; the carrier must trail it by
      // exactly bw/2 (USB: carrier below the new centre, LSB: above).
      carrierHz = carrierFromBracketHz(rawCenterHz, rawWidthHz, mode)
      widthHz = rawWidthHz
    } else {
      // Symmetric modes — carrier IS the centre.
      carrierHz = rawCenterHz
      widthHz = rawWidthHz
    }

    const { centerHz: bcHz, widthHz: bwOut } = bracketGeomHz(carrierHz, widthHz, mode)
    specAcc.center(bcHz / HZ_PER_MHZ)
    specAcc.width(bwOut / HZ_PER_MHZ)
    wfAcc.center(bcHz)
    wfAcc.width(bwOut)
    if (specCar) {
      specCar.center(carrierHz / HZ_PER_MHZ)
    }
    if (wfCar) {
      wfCar.center(carrierHz)
    }
  } finally {
    suppressAccEvents = false
  }
})

// Cursor affordance: show ew-resize when the pointer is over an accordion edge
// (the bandwidth resize zone). We can't piggyback on sigplot's edge_highlight:
// sigplot's mousemove handler is rate-throttled (throttledOnMouseMove), so when
// a raw document mousemove fires, edge_highlight is stale/lagging. Instead we
// replicate sigplot's own hit-test (_onMouseDown, sigplot.accordion.js:488):
// vertical accordion → mouse x within (edge_line_width + 5) px of loc_1/loc_2.
// loc_1/loc_2 are canvas-pixel edge positions, refreshed every draw (not
// throttled), and the plot's Mx gives the data-area bounds. The plot's
// internal canvas is absolutely positioned at (0,0) inside the plot element,
// so the element's client rect maps clientX→xpos exactly like sigplot does.
type AccGeom = {
  edge_dragging?: boolean
  properties?: { loc_1?: number; loc_2?: number; edge_line_style?: { lineWidth?: number } }
}
type PlotMx = { l: number; r: number; t: number; b: number }
function nearAccEdge(
  acc: AccordionPlugin | null,
  plot: Plot | null,
  el: HTMLElement | null,
  clientX: number,
  clientY: number,
): boolean {
  const a = acc as unknown as AccGeom | null
  if (!a || !el) return false
  if (a.edge_dragging) return true // mid-resize: hold the cursor for the whole drag
  const p = a.properties
  if (!p || p.loc_1 === undefined || p.loc_2 === undefined) return false
  const mx = (plot as unknown as { _Mx?: PlotMx } | null)?._Mx
  if (!mx) return false
  const rect = el.getBoundingClientRect()
  const xpos = clientX - rect.left
  const ypos = clientY - rect.top
  if (xpos < mx.l || xpos > mx.r || ypos < mx.t || ypos > mx.b) return false
  const elw = p.edge_line_style?.lineWidth ?? 1
  const tol = elw + 5
  return Math.abs(p.loc_1 - xpos) < tol || Math.abs(p.loc_2 - xpos) < tol
}
useDocumentEvent('mousemove', (e: Event) => {
  const me = e as MouseEvent
  nearEdge.value =
    nearAccEdge(specAcc, specPlot, specEl.value, me.clientX, me.clientY) ||
    nearAccEdge(wfAcc, wfPlot, wfEl.value, me.clientX, me.clientY)
})

// Drag-commit. sigplot's Accordion never fires its 'change'/'accordiontag'
// events on drag-end (its _onDocMouseUp is dead code: `!dragging ||
// !edge_dragging` is always true since mousedown sets exactly one of them).
// So we detect a user drag ourselves on document mouseup by reading the live
// centre/width sigplot writes during _onMouseMove. useDocumentEvent must be
// called synchronously in setup (it registers onMounted/onUnmounted); the
// accordions are null until initPlots() runs, hence the guard.
useDocumentEvent('mouseup', () => {
  if (suppressAccEvents || !specAcc || !wfAcc) return
  if (!dragActive) return // mouseup without a drag we initiated
  dragActive = false
  // Read the final geometry from the WATERFALL accordion (Hz, no MHz rounding
  // loss). The mousemove mirror keeps both accordions in lock-step, so either
  // is authoritative; we pick Hz to avoid a float round-trip through MHz.
  const mode = store.currentMode
  const bw = wfAcc.width()
  const carrierHz = carrierFromBracketHz(wfAcc.center(), bw, mode)
  const freqMoved = Math.abs(carrierHz - dragBaseFreqHz) > 1
  const bwMoved = Math.abs(bw - dragBaseBwHz) > 1
  if (!freqMoved && !bwMoved) return
  if (freqMoved) store.requestTune(Math.round(carrierHz))
  if (bwMoved) store.requestBandwidth(Math.round(bw))
  lastCommittedFreqHz = carrierHz
  lastCommittedBwHz = bw
  // Re-sync both plots immediately so the un-dragged plot follows now (don't
  // wait for the debounced backend echo). Re-derive the bracket geometry from
  // the carrier — for SSB, resizing must keep the carrier-side edge anchored
  // on the red line instead of drifting.
  const { centerHz: syncCenterHz, widthHz: syncWidthHz } = bracketGeomHz(carrierHz, bw, mode)
  suppressAccEvents = true
  try {
    specAcc.center(syncCenterHz / HZ_PER_MHZ)
    specAcc.width(syncWidthHz / HZ_PER_MHZ)
    wfAcc.center(syncCenterHz)
    wfAcc.width(syncWidthHz)
  } finally {
    suppressAccEvents = false
  }
  // Drag-bug mitigation: _onDocMouseUp never resets these (dead code), so a
  // stray later mousemove over the plot could re-drag the marker (and our
  // mousemove mirror would chase it). Force-reset on every commit.
  for (const s of [specAcc, wfAcc] as unknown as AccDragState[]) {
    s.dragging = false
    s.edge_dragging = false
  }
})

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
    if (slider) slider.style.setProperty('--wf-slider-len', `${wrap.clientHeight}px`)
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
// Keep in sync with MAX_FFT_SIZE in backend/services/sdr.py — the backend
// snaps any request above this back down to the cap, so asking for more than
// MAX_BINS just wastes the frontend's per-zoom math.
const MAX_BINS = 32768
function computeDesiredBins(): number {
  const el = wfEl.value
  if (!el) return MIN_BINS
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
let lastRequestedBins = 0
let _fftSizeDebounce: ReturnType<typeof setTimeout> | null = null
function publishDesiredBins() {
  const n = computeDesiredBins()
  if (n === lastRequestedBins) return
  lastRequestedBins = n
  store.requestFftSize(n)
}
function scheduleDesiredBins() {
  if (_fftSizeDebounce) clearTimeout(_fftSizeDebounce)
  _fftSizeDebounce = setTimeout(publishDesiredBins, 250)
}

function buildPipes(n: number) {
  if (!specPlot || !wfPlot) return
  if (subsize) {
    try { specPlot.remove_layer(specUuid) } catch { /* noop */ }
    try { wfPlot.remove_layer(wfUuid) } catch { /* noop */ }
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
  if (!specEl.value || !wfEl.value || !rootEl.value) return

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
    stk0: (specPlot as unknown as { _Mx: { stk: Array<{ ymin: number; ymax: number }> } })?._Mx?.stk?.[0],
  })

  // Publish the canvas-sized FFT bin target now so the backend can switch as
  // soon as the WS is up (SdrPanel forwards on socket open if it fires early).
  publishDesiredBins()
  buildPipes(lastRequestedBins || MIN_BINS)

  // Tuned-frequency marker. Two AccordionPlugin instances (one per plot) — see
  // the unit-split note at their declaration. Plugins live on _Gx.plugins with
  // an independent canvas, so they survive buildPipes() layer rebuilds; we just
  // re-assert centre/width after a rebuild via applyMarker().
  const Acc = sigplot.plugins.AccordionPlugin
  const accCommon = {
    mode: 'absolute' as const,
    direction: 'vertical' as const,
    // Keep draw_center_line on but make it visually invisible — sigplot's
    // move-drag hit-test uses `center_line_style.lineWidth` as the click
    // tolerance around center_location. A wider, transparent line gives the
    // user a comfortable area to grab the bracket without painting a second
    // line on top of the carrier-line accordion.
    draw_center_line: true,
    draw_edge_lines: false,
    shade_area: true,
    fill_style: { fillStyle: '#000000', opacity: 0.35 },
    center_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 20, lineCap: 'butt' },
    edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 0, lineCap: 'butt' },
  }
  const carCommon = {
    mode: 'absolute' as const,
    direction: 'vertical' as const,
    draw_center_line: true,
    draw_edge_lines: false,
    shade_area: false,
    fill_style: { fillStyle: 'rgba(0,0,0,0)', opacity: 0 },
    center_line_style: { strokeStyle: '#c8ff00', lineWidth: 1, lineCap: 'butt' },
    edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 0, lineCap: 'butt' },
  }
  specAcc = new Acc({ ...accCommon })
  wfAcc = new Acc({ ...accCommon })
  specCar = new Acc({ ...carCommon })
  wfCar = new Acc({ ...carCommon })
  specPlot.add_plugin(specAcc, 1)
  wfPlot.add_plugin(wfAcc, 1)
  specPlot.add_plugin(specCar, 1)
  wfPlot.add_plugin(wfCar, 1)
  applyMarker()

  // Known-frequency labels on the spectrum. AnnotationPlugin draws each
  // annotation's `value` (text OR a canvas image) at real-coordinate `x`,
  // auto-clipped to the data box. Spectrum x is in MHz, so annotation.x is
  // frequency_hz / 1e6. We rebuild the annotation list whenever store.frequencies
  // changes; pan/zoom are handled natively by sigplot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnnotationPlugin = (sigplot.plugins as unknown as { AnnotationPlugin: any }).AnnotationPlugin
  knownFreqPlugin = new AnnotationPlugin({ display: true })
  specPlot.add_plugin(knownFreqPlugin, 2)
  syncKnownFrequencies()

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
    const Mx = (plot as unknown as {
      _Mx: { l: number; r: number; t: number; text_w: number; text_h: number; width: number }
    })._Mx
    let _l = Mx.l
    Object.defineProperty(Mx, 'l', {
      configurable: true,
      get() { return _l },
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
      get() { return _t },
      set(v: number) {
        const th = Mx.text_h || 12
        _t = Math.max(v, Math.round(th * 1.2))
      },
    })
    // Extend Mx.r to the canvas right edge so there's no visible right gutter.
    let _r = Mx.r
    Object.defineProperty(Mx, 'r', {
      configurable: true,
      get() { return _r },
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
      get() { return _b },
      set(v: number) {
        const th = Mx.text_h || 12
        const desired = ((plot as unknown as { _Mx: { height: number } })._Mx.height) - Math.round(th * 3.2)
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
    // Canvas resize: only refresh the bin target when Full Waterfall Update
    // is ON. Otherwise the bin count is pinned to its mount-time value so a
    // side-panel toggle / browser zoom doesn't wipe the waterfall history.
    if (store.fullWaterfallUpdate) scheduleDesiredBins()
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
  void store.hydrateShowBandPlanFromDb()
  void store.hydrateShowKnownFreqsFromDb()
  // Defer until the fixed/flex container has resolved its real pixel size.
  // layer2d derives the waterfall geometry once at init from the plot height,
  // so creating the plots before layout settles breaks the raster.
  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(initPlots)
  })
  // Size the rotated sliders once layout settles, then keep them in sync as
  // the column height changes (panel toggle, window resize, footer/nav).
  requestAnimationFrame(sizeSliders)
  if (controlsEl.value) {
    controlsRo = new ResizeObserver(sizeSliders)
    controlsRo.observe(controlsEl.value)
  }
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
  if (frame && store.playing && !store.searchSweeping && specPlot) {
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
    if (!store.playing || store.searchSweeping || !frame || !specPlot || !wfPlot) return

    // Update the frequency span (drives the axis scaling + band overlay).
    // sample_rate spans the full FFT; bin 0 sits at center - rate/2.
    const half = frame.sample_rate / 2
    spanStartHz.value = frame.center_hz - half
    spanEndHz.value = frame.center_hz + half

    // Rebuild the layers when the bin count OR the tuning/scale changes so the
    // axis and waterfall stay aligned to the real frequencies.
    const scaleChanged =
      frame.center_hz !== lastCenterHz || frame.sample_rate !== lastSampleRate
    if (frame.bins.length !== subsize || scaleChanged) {
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
      // sigplot's Layer2D push only writes the layer's advancing time-window
      // (this.ymin/this.ymax) back into Mx.stk when Mx.level === 0
      // (sigplot.layer2d.js:409-414). When the user has zoomed, Mx.level > 0
      // and the stack entry stays pinned to the y-window captured at zoom
      // time. As new rows come in, the layer's effective time-window drifts
      // forward, but the zoom level keeps showing the old window — visible
      // symptom is an empty band growing up from the bottom of the
      // waterfall. Mirror the stk[0] update into the active level so the zoom
      // window tracks live data.
      const wfMx = (wfPlot as unknown as {
        _Mx: { level: number; stk: Array<{ ymin: number; ymax: number }> }
        _Gx: { lyr: Array<{ ymin: number; ymax: number }> }
      })._Mx
      const wfGx = (wfPlot as unknown as {
        _Gx: { lyr: Array<{ ymin: number; ymax: number }> }
      })._Gx
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
    if (drawRaf) { cancelAnimationFrame(drawRaf); drawRaf = 0 }
    pendingFrame = null
    const blank = new Float32Array(subsize)
    try { specPlot.reload(specUuid, blank) } catch { /* noop */ }
    // Rebuild the waterfall pipe to clear its scroll history.
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
      wfPlot.change_settings({ cmap: 1, autol: WF_AUTOL })
    } catch { /* noop */ }
    // Reset Min/Max to device defaults and re-enable waterfall auto-scale, so
    // the next play starts with a fresh canvas. The watcher on [zmin, zmax]
    // would re-disable auto-scale, so suppress it for this programmatic reset
    // by setting autoScale AFTER the refs.
    if (zmin.value !== SPEC_YMIN_DB || zmax.value !== SPEC_YMAX_DB) {
      zmin.value = SPEC_YMIN_DB
      zmax.value = SPEC_YMAX_DB
    }
    autoScale.value = true
    try {
      specPlot.change_settings({
        ymin: SPEC_YMIN_DB,
        ymax: SPEC_YMAX_DB,
        ydiv: -Math.max(1, Math.round((SPEC_YMAX_DB - SPEC_YMIN_DB) / 20)),
      })
    } catch { /* noop */ }
    // Hide the marker while stopped (the pipe rebuild dropped its canvas draw
    // anyway); applyMarker reads store.playing for visibility.
    applyMarker()
  },
)

// Track external tuning (typed freq, saved-freq click, mode change, backend
// status reconcile — all flow into the store) and play/stop visibility. Skip
// while WE are mid programmatic write to avoid feeding our own change back.
watch(
  () => [store.currentFreqHz, store.bwHz, store.sampleRate, store.playing, store.currentMode] as const,
  () => { if (!suppressAccEvents) applyMarker() },
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
watch(zmin, () => { lastTouched = 'min' })
watch(zmax, () => { lastTouched = 'max' })

watch([zmin, zmax], ([lo, hi]) => {
  // Guard against the user dragging one slider past the other: clamp the
  // moving slider to leave a 1 dB gap, leaving the stationary one untouched.
  // SDR++ behaviour — see User Guide v1.1 p. 31 (Min/Max are independent
  // endpoints; raising Min into Max does not push Max).
  if (hi <= lo) {
    if (lastTouched === 'min') { zmin.value = hi - 1; return }
    if (lastTouched === 'max') { zmax.value = lo + 1; return }
    return  // unknown source — bail out without thrashing either slider
  }
  autoScale.value = false
  applySpecRange(lo, hi)
  // Re-measure: the freq-label gridline position depends on the live dB range.
  syncBandInset()
})

// Moving the Zoom slider re-windows both plots around the tuned centre. When
// the "Full Waterfall Update" setting is ON (SDR++ User Guide v1.1 p. 34) we
// also ask the backend for more FFT bins so the visible window keeps ~1 bin
// per device px — sharp raster at any zoom level, at the cost of wiping the
// waterfall history every time the bin count changes (the new bin count
// triggers buildPipes() in the frame watcher). When OFF, bins are fixed at
// mount time: the raster gets pixelated when zoomed in, but history is
// preserved across zoom changes.
watch(zoom, () => {
  applyZoom()
  if (store.fullWaterfallUpdate) scheduleDesiredBins()
})

// Re-window when the selected frequency moves while zoomed in. Retuning with
// auto-centre ON changes the span centre, which rebuilds the layers (frame
// watcher → buildPipes → applyZoom). But with auto-centre OFF the span centre
// is unchanged — only the demod target (currentFreqHz) moves — so without this
// the zoom viewport would stay pinned to the previous frequency. No-op at
// zoom <= 1 (applyZoom takes the unzoom path). The overlay computeds already
// track currentFreqHz reactively via zoomWindowHz().
watch(() => store.currentFreqHz, () => {
  if (zoom.value > ZOOM_MIN) applyZoom()
})

// Toggling Full Waterfall Update ON mid-session: refresh the bin target
// immediately so the raster snaps to sharp at the current zoom without
// waiting for the next zoom action.
watch(() => store.fullWaterfallUpdate, (on) => {
  if (on) scheduleDesiredBins()
})

// Rebuild known-frequency annotations when the manager list changes. Pan/zoom
// don't need a rebuild — sigplot re-runs the plugin's draw on every redraw and
// maps annotation.x (MHz) through the live coordinate system. The watch on
// spanStartHz keeps the stagger-row calculation in step with span/zoom changes
// (so labels re-distribute across rows when the visible range changes).
watch(() => store.frequencies, syncKnownFrequencies, { deep: true })
watch([spanStartHz, spanEndHz], syncKnownFrequencies)

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (drawRaf) cancelAnimationFrame(drawRaf)
  pendingFrame = null
  ro?.disconnect()
  ro = null
  controlsRo?.disconnect()
  controlsRo = null
  try { if (specAcc) specPlot?.remove_plugin(specAcc) } catch { /* noop */ }
  try { if (wfAcc) wfPlot?.remove_plugin(wfAcc) } catch { /* noop */ }
  try { if (specCar) specPlot?.remove_plugin(specCar) } catch { /* noop */ }
  try { if (wfCar) wfPlot?.remove_plugin(wfCar) } catch { /* noop */ }
  try { if (knownFreqPlugin) specPlot?.remove_plugin(knownFreqPlugin) } catch { /* noop */ }
  specAcc = null
  wfAcc = null
  specCar = null
  wfCar = null
  knownFreqPlugin = null
  try { specPlot?.remove_layer(specUuid) } catch { /* noop */ }
  try { wfPlot?.remove_layer(wfUuid) } catch { /* noop */ }
  try { specPlot?.disable_listeners() } catch { /* noop */ }
  try { wfPlot?.disable_listeners() } catch { /* noop */ }
  specPlot = null
  wfPlot = null
})
</script>

<template>
  <div
    id="sdr-waterfall"
    ref="rootEl"
    :class="{ 'panel-closed': !panelOpen, 'edge-resize': nearEdge }"
  >
    <div v-if="store.searchSweeping" class="sdr-wf-search-overlay">
      <span class="sdr-wf-search-overlay-label">WATERFALL PAUSED — SEARCHING</span>
    </div>
    <div class="sdr-wf-controls" ref="controlsEl">
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Zoom</span>
        <div class="sdr-wf-slider-wrap">
          <input
            class="sdr-wf-slider"
            type="range"
            :min="ZOOM_MIN"
            :max="ZOOM_MAX"
            step="0.5"
            v-model.number="zoom"
            :aria-label="`Zoom ${zoom}x`"
          />
        </div>
      </div>
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Max</span>
        <div class="sdr-wf-slider-wrap">
          <input
            class="sdr-wf-slider"
            type="range"
            min="0"
            max="80"
            step="1"
            v-model.number="zmaxSlider"
            :aria-label="`Max ${zmax} dB`"
          />
        </div>
      </div>
      <div class="sdr-wf-ctl">
        <span class="sdr-wf-ctl-label">Min</span>
        <div class="sdr-wf-slider-wrap">
          <input
            class="sdr-wf-slider"
            type="range"
            min="20"
            max="120"
            step="1"
            v-model.number="zminSlider"
            :aria-label="`Min ${zmin} dB`"
          />
        </div>
      </div>
    </div>
    <div
      ref="specEl"
      class="sdr-wf-spectrum"
      :style="spectrumStyle"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @contextmenu.prevent
    >
      <div v-if="store.showBandPlan && visibleBands.length > 0" class="sdr-wf-band-overlay" :style="bandOverlayStyle">
        <div
          v-for="b in visibleBands"
          :key="b.key"
          class="sdr-wf-band"
          :style="{ left: b.leftPct + '%', width: b.widthPct + '%' }"
          :title="b.name"
        >
          <span>{{ b.name }}</span>
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
          :key="`l-${t.key}`"
          class="sdr-wf-freq-label"
          :style="{ left: t.leftPct + '%' }"
        >{{ t.label }}</span>
      </div>
      <div
        v-if="store.showKnownFreqs && visibleKnownFreqs.length > 0"
        class="sdr-wf-known-overlay"
        :style="knownFreqOverlayStyle"
      >
        <div
          v-for="f in visibleKnownFreqs"
          :key="f.key"
          class="sdr-wf-known-marker"
          :style="{ left: f.leftPct + '%' }"
          :title="f.label"
        >
          <svg class="sdr-wf-known-marker-ring" width="14" height="14" viewBox="0 0 14 14" overflow="visible" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="#c8ff00" stroke-width="1.5" />
            <circle cx="7" cy="7" r="1.5" fill="#ffffff" />
          </svg>
          <span class="sdr-wf-known-marker-label">{{ f.label }}</span>
        </div>
      </div>
    </div>
    <div
      ref="wfEl"
      class="sdr-wf-raster"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @contextmenu.prevent
    ></div>
  </div>
</template>
