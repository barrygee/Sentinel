<script setup lang="ts">
import './SdrWaterfall.css'
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import sigplot, { type Plot } from 'sigplot'
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

// Bands that intersect the visible span, with their position as a 0..1 fraction
// across the plot — consumed by the band strip overlay in the template.
const visibleBands = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  const w = hi - lo
  if (w <= 0) return []
  return bandPlan.value
    .filter((b) => b.endHz > lo && b.startHz < hi)
    .map((b) => {
      const left = Math.max(0, (b.startHz - lo) / w)
      const right = Math.min(1, (b.endHz - lo) / w)
      return { name: b.name, leftPct: left * 100, widthPct: (right - left) * 100 }
    })
})

// ── Layout: track the SDR side panel open/closed state ───────────────────────
function _readSidebarOpen(): boolean {
  try { return sessionStorage.getItem('sentinel_sidebar_open') === '1' } catch { return false }
}
const panelOpen = ref<boolean>(_readSidebarOpen())
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  panelOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

// ── Intensity (Min/Max) — drives sigplot zmin/zmax on the waterfall ──────────
// The backend sends raw FFT power: 10*log10(|FFT|^2), NOT normalised, so the
// real range is roughly 0..80 dB (int8 IQ), not the -110..-20 a normalised
// receiver would show. Defaults must bracket the real data or the colormap
// pins everything to one colour (the "solid red" symptom). The waterfall also
// starts in auto-scale (autol) so it always has contrast regardless; the
// sliders then act as a manual override.
const zmin = ref(0)
const zmax = ref(80)
const autoScale = ref(true)
// Waterfall colour auto-scale window (frames). sigplot's autol:N recomputes
// the z colour range every ~N frames. A small N (was 5) chases the noise
// floor at LOW bandwidth/sample-rate — where most of the span is random
// noise — re-mapping the whole raster's colours every few frames => the
// "jumpy at 10kHz, fine at wide bandwidth" symptom. A long window (~100
// frames ≈ 4s) keeps colours stable while still adapting to real signal
// level changes over seconds. (Spectrum LINE keeps a responsive autol;
// only the raster colour-map needs to be steady.)
const WF_AUTOL = 100

// ── Plot instances & layer uuids — deliberately NON-reactive ─────────────────
// sigplot mutates the Plot object heavily; wrapping it in Vue reactivity breaks
// it and tanks performance. Keep these as plain module-of-component bindings.
let specPlot: Plot | null = null
let wfPlot: Plot | null = null
let specUuid = ''
let wfUuid = ''
let subsize = 0
let ro: ResizeObserver | null = null

const rootEl = ref<HTMLElement | null>(null)
const specEl = ref<HTMLElement | null>(null)
const wfEl = ref<HTMLElement | null>(null)

const BG = '#0a0d14'

// Shared "no chrome" options. Option names verified against the installed
// sigplot v3.1.7 constructor (node_modules/sigplot/js/sigplot.js:7314-7359).
// NOTE: the option is `nospecs` (with an 's') — `Gx.specs = !o.nospecs`. When
// false it forces show_x_axis / show_y_axis / show_readout all off, which
// removes the axes, the readout/title strip and the spec area in one shot.
const CLEAN: Record<string, unknown> = {
  nospecs: true,           // <- the key one in v3.1.7: Gx.specs = !o.nospecs
  nospec: true,            // older sigplot 2.x spelling — harmless if ignored
  nogrid: true,
  noxaxis: true,
  noyaxis: true,
  noreadout: true,
  nomenu: true,
  nopan: true,
  nodragdrop: true,
  nokeypress: true,
  no_legend_button: true,
  legend: false,
  hide_note: true,
  autohide_panbars: true,
}

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
    { type: 1000, xunits: 3, yunits: 26, size: n, xstart: xstartHz, xdelta: xdeltaHz },
    { color: '#ffffff', fillStyle: 'rgba(255,255,255,0.35)' },
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
    colors: { bg: BG, fg: '#8b97a8' },
  })
  wfPlot = new sigplot.Plot(wfEl.value, {
    ...CLEAN,
    colors: { bg: BG, fg: BG },
  })

  buildPipes(1024)

  // sigplot sizes its canvas to the element's clientHeight at creation time and
  // only resizes on checkresize(). The flex children settle their final height
  // AFTER creation, so force a resize on the next frame (fixes the canvas being
  // stuck at its initial ~300px). Observe the plot ELEMENTS (not just the root)
  // so internal flex resizes — and the side-panel toggle — both trigger it.
  ro = new ResizeObserver(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
  })
  ro.observe(specEl.value as HTMLElement)
  ro.observe(wfEl.value as HTMLElement)

  requestAnimationFrame(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
  })
}

onMounted(() => {
  // Defer until the fixed/flex container has resolved its real pixel size.
  // layer2d derives the waterfall geometry once at init from the plot height,
  // so creating the plots before layout settles breaks the raster.
  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(initPlots)
  })
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
      buildPipes(frame.bins.length)
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
          lps: WF_ROWS,
          pipesize: WF_ROWS * subsize * 2,
        },
        { drawmode: 'falling', framesize: subsize },
      )
      wfPlot.change_settings({ cmap: 1, autol: WF_AUTOL })
    } catch { /* noop */ }
  },
)

// Moving a slider switches the waterfall from auto-scale to the fixed range.
watch([zmin, zmax], ([lo, hi]) => {
  autoScale.value = false
  wfPlot?.change_settings({ autol: -1, zmin: lo, zmax: hi })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (drawRaf) cancelAnimationFrame(drawRaf)
  pendingFrame = null
  ro?.disconnect()
  ro = null
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
    :class="{ 'panel-closed': !panelOpen }"
  >
    <div class="sdr-wf-controls">
      <label>
        Max
        <input type="range" min="-120" max="20" step="1" v-model.number="zmax" />
        <span>{{ zmax }}</span>
      </label>
      <label>
        Min
        <input type="range" min="-120" max="20" step="1" v-model.number="zmin" />
        <span>{{ zmin }}</span>
      </label>
    </div>
    <div ref="specEl" class="sdr-wf-spectrum"></div>
    <div class="sdr-wf-bands">
      <div
        v-for="b in visibleBands"
        :key="b.name"
        class="sdr-wf-band"
        :style="{ left: b.leftPct + '%', width: b.widthPct + '%' }"
        :title="b.name"
      >
        <span>{{ b.name }}</span>
      </div>
    </div>
    <div ref="wfEl" class="sdr-wf-raster"></div>
  </div>
</template>
