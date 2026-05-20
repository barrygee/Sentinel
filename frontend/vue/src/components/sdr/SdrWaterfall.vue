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
  Mx: { stk: Array<{ x1: number; y1: number; x2: number; y2: number }>; level: number; active_canvas: HTMLCanvasElement; fg: string; width: number; height: number },
  xdiv: number,
  ydiv: number,
  xlab: number,
  ylab: number,
  flags: { noaxisbox?: boolean; exactbox?: boolean },
) {
  const userWantsBox = !flags.noaxisbox
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
    y += Mx.text_h * 1.0
    const ctx = Mx.canvas?.getContext('2d')
    if (ctx && typeof Mx.text_w === 'number') {
      const tickX = x + Math.round(lbl.length / 2) * Mx.text_w
      const measuredW = ctx.measureText(lbl).width
      x = tickX - measuredW / 2
    }
  }
  return _origMxText.call(this, Mx, x, y, lbl, color)
}
import { useSdrStore } from '@/stores/sdr'
import { useSettingsStore } from '@/stores/settings'
import { useDocumentEvent } from '@/composables/useDocumentEvent'

const store = useSdrStore()
const settings = useSettingsStore()

// ── RF band plan ─────────────────────────────────────────────────────────────
// Reference allocations used to label the spectrum (e.g. "Medium Wave"). Comes
// from the sdr.bandPlan config setting (seeded from backend/default_config.json);
// this built-in list is the fallback so the overlay works even before the DB
// has the row (existing installs were seeded before bandPlan was added).
interface RfBand { name: string; startHz: number; endHz: number }
const DEFAULT_BANDS: RfBand[] = [
  { name: 'Longwave', startHz: 148500, endHz: 283500 },
  { name: 'Medium Wave', startHz: 526500, endHz: 1606500 },
  { name: '120m', startHz: 2300000, endHz: 2495000 },
  { name: '90m', startHz: 3200000, endHz: 3400000 },
  { name: '75m', startHz: 3900000, endHz: 4000000 },
  { name: '60m', startHz: 4750000, endHz: 4995000 },
  { name: '49m', startHz: 5900000, endHz: 6200000 },
  { name: '40m', startHz: 7200000, endHz: 7450000 },
  { name: '31m', startHz: 9400000, endHz: 9900000 },
  { name: '25m', startHz: 11600000, endHz: 12100000 },
  { name: '22m', startHz: 13570000, endHz: 13870000 },
  { name: '19m', startHz: 15100000, endHz: 15800000 },
  { name: '16m', startHz: 17480000, endHz: 17900000 },
  { name: '13m', startHz: 21450000, endHz: 21850000 },
  { name: '11m', startHz: 25670000, endHz: 26100000 },
  { name: 'CB', startHz: 26965000, endHz: 27405000 },
  { name: '10m Amateur', startHz: 28000000, endHz: 29700000 },
  { name: '6m Amateur', startHz: 50000000, endHz: 54000000 },
  { name: 'FM Broadcast', startHz: 87500000, endHz: 108000000 },
  { name: 'Air Band', startHz: 108000000, endHz: 137000000 },
  { name: '2m Amateur', startHz: 144000000, endHz: 148000000 },
  { name: 'Marine VHF', startHz: 156000000, endHz: 162025000 },
  { name: 'MilAir', startHz: 225000000, endHz: 400000000 },
  { name: '70cm Amateur', startHz: 430000000, endHz: 440000000 },
]
const bandPlan = computed<RfBand[]>(() =>
  settings.getSetting<RfBand[]>('sdr', 'bandPlan', DEFAULT_BANDS),
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

// ── Intensity (Min/Max) — drives sigplot zmin/zmax on the waterfall ──────────
// The backend emits dBFS (0 dB = full-scale tone), so values are negative and
// the noise floor sits around -70..-100 for an 8-bit RTL-SDR. Defaults must
// bracket the real data or the colormap pins everything to one colour (the
// "solid red" symptom). The waterfall also starts in auto-scale (autol) so it
// always has contrast regardless; the sliders then act as a manual override.
const zmin = ref(-100)
const zmax = ref(0)
const autoScale = ref(true)

// ── Zoom — horizontal (frequency) zoom into the centre of the span ───────────
// 1 = full span (no zoom); ZOOM_MAX = tightest. The visible window is the full
// span / zoom, centred on the tuned frequency, applied to BOTH plots so the
// spectrum and waterfall stay aligned. SigPlot's zoom({x},{x}, continuous:true)
// updates the current zoom level in place (no zoom-stack growth); zoom === 1
// calls unzoom() to restore the natural full-span view.
const ZOOM_MIN = 1
const ZOOM_MAX = 50
const zoom = ref(ZOOM_MIN)

function applyZoom() {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return
  if (zoom.value <= ZOOM_MIN) {
    try { specPlot?.unzoom() } catch { /* noop */ }
    try { wfPlot?.unzoom() } catch { /* noop */ }
    return
  }
  // Window centred on the tuned centre frequency (midpoint of the span).
  const center = (lo + hi) / 2
  const halfWin = (hi - lo) / (2 * zoom.value)
  const x1 = center - halfWin
  const x2 = center + halfWin
  // y left undefined => keep the full vertical (dB / history) range.
  try { specPlot?.zoom({ x: x1 }, { x: x2 }, true) } catch { /* noop */ }
  try { wfPlot?.zoom({ x: x1 }, { x: x2 }, true) } catch { /* noop */ }
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

// ── Spectrum dB axis — STATIC like SDR++, per-device ─────────────────────────
// The backend emits dBFS (0 dB = full-scale tone — see backend/services/sdr.py).
// The ceiling is therefore 0 for every device; the floor is set by the ADC's
// dynamic range (≈ +6 dB per extra bit of resolution beyond 8). Pinning the
// spectrum Y-axis to this range stops the left dB ruler from breathing every
// few frames (the SDR++ behaviour: signals slide vertically against a fixed
// scale).
//
// FUTURE: when the backend starts reporting the active device (e.g. a `device`
// field on the spectrum frame, or a `deviceType` ref on the SDR store), make
// ACTIVE_DEVICE reactive and watch it to call
// `specPlot.change_settings({ ymin, ymax })` (sigplot supports this at
// runtime; see node_modules/sigplot/js/sigplot.js lines 2039-2074).
type SdrDeviceId = 'rtl_tcp' | 'hackrf' | 'airspy' | 'sdrplay'
const DEVICE_DB_RANGE: Record<SdrDeviceId, { ymin: number; ymax: number }> = {
  // Ranges must divide cleanly by 20 dB so sigplot's tick steps land on the
  // ymax/ymin endpoints — otherwise the bottom label sits below the data box
  // (uneven gap between the lowest two labels).
  rtl_tcp:  { ymin: -100, ymax: 0 }, // 8-bit IQ (only device wired today)
  hackrf:   { ymin: -100, ymax: 0 }, // 8-bit IQ  — placeholder
  airspy:   { ymin: -120, ymax: 0 }, // 12-bit IQ — placeholder
  sdrplay:  { ymin: -140, ymax: 0 }, // 14-bit IQ — placeholder
}
const ACTIVE_DEVICE: SdrDeviceId = 'rtl_tcp'
const SPEC_YMIN_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymin
const SPEC_YMAX_DB = DEVICE_DB_RANGE[ACTIVE_DEVICE].ymax

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
let specAcc: AccordionPlugin | null = null   // MHz spectrum plot
let wfAcc: AccordionPlugin | null = null     // Hz waterfall plot
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
  suppressAccEvents = true
  try {
    specAcc.center(fHz / HZ_PER_MHZ)
    specAcc.width(bHz / HZ_PER_MHZ)
    specAcc.min_width(MIN_BW_HZ / HZ_PER_MHZ)
    specAcc.max_width(span / HZ_PER_MHZ)
    wfAcc.center(fHz)
    wfAcc.width(bHz)
    wfAcc.min_width(MIN_BW_HZ)
    wfAcc.max_width(span)
    const vis = store.playing
    specAcc.display(vis)
    wfAcc.display(vis)
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
  let winLo = lo
  let winHi = hi
  if (zoom.value > ZOOM_MIN) {
    const center = (lo + hi) / 2
    const halfWin = (hi - lo) / (2 * zoom.value)
    winLo = center - halfWin
    winHi = center + halfWin
  }
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
// label (every 0.1 MHz — matches the xdiv we push to sigplot in the spectrum
// watch). Positions are 0..100% across the data box, same window math as
// visibleBands so zoom keeps them aligned with the labels sigplot draws.
const freqTicks = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return []
  let winLo = lo
  let winHi = hi
  if (zoom.value > ZOOM_MIN) {
    const center = (lo + hi) / 2
    const halfWin = (hi - lo) / (2 * zoom.value)
    winLo = center - halfWin
    winHi = center + halfWin
  }
  const w = winHi - winLo
  const stepHz = 0.1 * HZ_PER_MHZ
  const first = Math.ceil(winLo / stepHz) * stepHz
  const ticks: { key: string; leftPct: number }[] = []
  for (let f = first; f <= winHi; f += stepHz) {
    ticks.push({ key: `t-${f}`, leftPct: ((f - winLo) / w) * 100 })
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
  if (e.button !== 0) return
  mdownEl = e.currentTarget as HTMLElement
  mdownX = e.clientX
  mdownY = e.clientY
}

function onPlotMouseUp(e: MouseEvent) {
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
  // / zoom, centred on the tuned frequency. Map the fraction within that
  // window, not the full span, so a click lands on what the user sees.
  let winLo = lo
  let winHi = hi
  if (zoom.value > ZOOM_MIN) {
    const center = (lo + hi) / 2
    const halfWin = (hi - lo) / (2 * zoom.value)
    winLo = center - halfWin
    winHi = center + halfWin
  }
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
  // Band overlay grows up from the data-box bottom to the -100 dB gridline.
  // mx.t..mx.b span the y-axis range SPEC_YMAX_DB..SPEC_YMIN_DB.
  const dataBoxHeightPx = mx.b - mx.t
  const yRangeDb = SPEC_YMAX_DB - SPEC_YMIN_DB
  if (dataBoxHeightPx > 0 && yRangeDb > 0) {
    const TARGET_DB = -100
    const dbFromBottom = TARGET_DB - SPEC_YMIN_DB
    bandHeightPx.value = Math.max(0, Math.round((dbFromBottom / yRangeDb) * dataBoxHeightPx))
  }
}

// Type for poking the plugin's internal drag flags (no public accessor).
type AccDragState = { dragging?: boolean; edge_dragging?: boolean }
function accIsDragging(a: AccordionPlugin | null): boolean {
  const s = a as unknown as AccDragState | null
  return !!s && (!!s.dragging || !!s.edge_dragging)
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
  dragBaseFreqHz = wfAcc.center()
  dragBaseBwHz = wfAcc.width()
  dragActive = true
})

useDocumentEvent('mousemove', () => {
  if (suppressAccEvents || !specAcc || !wfAcc) return
  const specDragging = accIsDragging(specAcc)
  const wfDragging = accIsDragging(wfAcc)
  if (!specDragging && !wfDragging) return
  suppressAccEvents = true
  try {
    if (specDragging) {
      // Spectrum is in MHz → push Hz onto the waterfall.
      wfAcc.center(specAcc.center() * HZ_PER_MHZ)
      wfAcc.width(specAcc.width() * HZ_PER_MHZ)
    } else {
      // Waterfall is in Hz → push MHz onto the spectrum.
      specAcc.center(wfAcc.center() / HZ_PER_MHZ)
      specAcc.width(wfAcc.width() / HZ_PER_MHZ)
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
  const freqHz = wfAcc.center()
  const bw = wfAcc.width()
  const freqMoved = Math.abs(freqHz - dragBaseFreqHz) > 1
  const bwMoved = Math.abs(bw - dragBaseBwHz) > 1
  if (!freqMoved && !bwMoved) return
  if (freqMoved) store.requestTune(Math.round(freqHz))
  if (bwMoved) store.requestBandwidth(Math.round(bw))
  lastCommittedFreqHz = freqHz
  lastCommittedBwHz = bw
  // Re-sync both plots immediately so the un-dragged plot follows now (don't
  // wait for the debounced backend echo).
  suppressAccEvents = true
  try {
    specAcc.center(freqHz / HZ_PER_MHZ)
    specAcc.width(bw / HZ_PER_MHZ)
    wfAcc.center(freqHz)
    wfAcc.width(bw)
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
const MIN_BINS = 1024
const MAX_BINS = 8192
function computeDesiredBins(): number {
  const el = wfEl.value
  if (!el) return MIN_BINS
  const dpr = window.devicePixelRatio || 1
  const px = Math.max(1, Math.round(el.clientWidth * dpr))
  if (px <= MIN_BINS) return MIN_BINS
  if (px >= MAX_BINS) return MAX_BINS
  // Round UP to the next power of two so each FFT bin is at most ~1 device px
  // (downscaling looks sharp; upscaling is what causes blockiness).
  return 1 << Math.ceil(Math.log2(px))
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
    // Static dB ruler (SDR++ behaviour): autoy:0 = Fix mode, no Y auto-scaling.
    // ymin/ymax come from the per-device range table above so signals slide
    // against a fixed scale instead of the scale chasing the signals.
    autoy: 0,
    ymin: SPEC_YMIN_DB,
    ymax: SPEC_YMAX_DB,
    // Negative ydiv bypasses sigplot's mx.tics() "nice number" rounding (which
    // can place the first tick BELOW ymin, leaving the bottom label visually
    // outside the data box). With ydiv<0, sigplot pins dtic1 = ymin exactly and
    // dtic = (ymin-ymax)/ydiv, so ticks land precisely on ymin..ymax in N steps.
    ydiv: -Math.round((SPEC_YMAX_DB - SPEC_YMIN_DB) / 20),
    nomenu: true,
    nopan: true,
    nodragdrop: true,
    nokeypress: true,
    no_legend_button: true,
    legend: false,
    noreadout: true,
    hide_note: true,
    autohide_panbars: true,
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
    draw_center_line: true,
    draw_edge_lines: false,
    shade_area: true,
    fill_style: { fillStyle: '#000000', opacity: 0.35 },
    center_line_style: { strokeStyle: '#c8ff00', lineWidth: 1, lineCap: 'butt' },
    edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 0, lineCap: 'butt' },
  }
  specAcc = new Acc({ ...accCommon })
  wfAcc = new Acc({ ...accCommon })
  specPlot.add_plugin(specAcc, 1)
  wfPlot.add_plugin(wfAcc, 1)
  applyMarker()

  // The axis/tick `fg` colour is also used by default for the grid lines.
  // Override the grid stroke independently so the grid stays dark while
  // tick labels remain white.
  // Preserve sigplot's default dashed grid pattern (`on:1, off:3`); only swap
  // the colour so labels stay white but the grid is black.
  const gridStyle = { color: '#888888', mode: 'dashed', on: 1, off: 3 }
  specPlot.change_settings({ gridStyle })
  wfPlot.change_settings({ gridStyle })

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
        const desired = ((plot as unknown as { _Mx: { height: number } })._Mx.height) - Math.round(th * 2.5)
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
    // Canvas width changed (or DPR — observed via clientWidth on layout) →
    // recompute the desired FFT bin count and (debounced) ask the backend.
    scheduleDesiredBins()
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
  if (frame && store.playing && specPlot) {
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
    if (!store.playing || !frame || !specPlot || !wfPlot) return

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
    // Hide the marker while stopped (the pipe rebuild dropped its canvas draw
    // anyway); applyMarker reads store.playing for visibility.
    applyMarker()
  },
)

// Track external tuning (typed freq, saved-freq click, mode change, backend
// status reconcile — all flow into the store) and play/stop visibility. Skip
// while WE are mid programmatic write to avoid feeding our own change back.
watch(
  () => [store.currentFreqHz, store.bwHz, store.sampleRate, store.playing] as const,
  () => { if (!suppressAccEvents) applyMarker() },
)

// Moving a slider switches the waterfall from auto-scale to the fixed range.
watch([zmin, zmax], ([lo, hi]) => {
  autoScale.value = false
  wfPlot?.change_settings({ autol: -1, zmin: lo, zmax: hi })
})

// Moving the Zoom slider re-windows both plots around the tuned centre.
watch(zoom, applyZoom)

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
  specAcc = null
  wfAcc = null
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
            min="-120"
            max="20"
            step="1"
            v-model.number="zmax"
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
            min="-120"
            max="20"
            step="1"
            v-model.number="zmin"
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
    >
      <div class="sdr-wf-band-overlay" :style="bandOverlayStyle">
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
      </div>
    </div>
    <div
      ref="wfEl"
      class="sdr-wf-raster"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
    ></div>
  </div>
</template>
