/**
 * The waterfall's two sigplot plots: creating them once layout settles, their
 * layers (the spectrum line and the scrolling raster), feeding them every
 * spectrum frame, blanking them when playback stops, keeping their zoom window
 * and dB range in step with the sliders, measuring their data boxes for the
 * HTML overlays, and tearing it all down on unmount.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C15), the last of the
 * series: the interaction composables (C11–C14) plug in through `attach*`
 * hooks and getters, and read the plots through the shared handles this fills.
 * The component calls it where its plot block used to be, after every other
 * composable, so its watchers and lifecycle hooks keep their order.
 */
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import sigplot, { type AccordionPlugin, type Plot } from 'sigplot'
import { installMarginTweaks } from '../sigplotAxisPatches'
import { HZ_PER_MHZ } from '../waterfallFrequencyTicks'
import type { WaterfallPlotHandles } from '../waterfallPlotHandles'
import { ZOOM_MIN, type WaterfallViewRange } from './useWaterfallViewRange'
import type { SdrMode, SdrSpectrumFrame } from '../stores/sdr'
import type { PlotMargins } from './useWaterfallDataBox'
import type {
  KnownFrequencyAnnotationHost,
  KnownFrequencyAnnotationPlugin,
} from './useKnownFrequencyMarkers'

/** The parts of the SDR store the plots read and write. */
export interface WaterfallPlotSource {
  readonly lastSpectrum: SdrSpectrumFrame | null
  readonly playing: boolean
  readonly displayPaused: boolean
  readonly searchSweeping: boolean
  readonly scanSweeping: boolean
  readonly currentFreqHz: number
  readonly bwHz: number
  readonly sampleRate: number
  readonly currentMode: SdrMode
  /** Asks the backend for this many FFT bins. */
  requestFftSize: (bins: number) => void
  setViewSettings: (settings: {
    zoom?: number
    zmin?: number
    zmax?: number
    autoScale?: boolean
  }) => void
}

/** What the component hands the plots. */
export interface WaterfallPlotsOptions {
  source: WaterfallPlotSource
  plots: WaterfallPlotHandles
  spectrumElement: () => HTMLElement | null
  waterfallElement: () => HTMLElement | null
  /** The current frame's span; the frame watcher writes it. */
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
  viewRange: Pick<
    WaterfallViewRange,
    | 'zoom'
    | 'zmin'
    | 'zmax'
    | 'autoScale'
    | 'livePanOffsetHz'
    | 'applyZoom'
    | 'applySpecRange'
    | 'clampSliderCollision'
  >
  /** Copies the spectrum's margins into the overlay insets (useWaterfallDataBox). */
  measureSpectrumDataBox: (margins: PlotMargins) => void
  /** The raster's data box, which the time markers hang off (useSignalMarkers). */
  waterfallDataTopPx: Ref<number>
  waterfallDataHeightPx: Ref<number>
  recordRowPushTime: (pushedAtMs: number, bins: number[]) => void
  clearRowPushTimes: () => void
  /** The tuning bracket (useBandwidthBracketDrag). */
  attachAccordions: (
    AccordionPluginClass: typeof AccordionPlugin,
    spectrumPlot: Plot,
    waterfallPlot: Plot,
  ) => void
  detachAccordions: () => void
  applyMarker: () => void
  isWritingBracket: () => boolean
  /** The gutter pan (useFrequencyDrag). */
  isFreqDragActive: () => boolean
  /** The known-frequency annotation plugin (useKnownFrequencyMarkers). */
  attachAnnotationPlugin: (
    host: KnownFrequencyAnnotationHost,
    plugin: KnownFrequencyAnnotationPlugin,
  ) => void
  detachAnnotationPlugin: () => void
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
export const WF_ROWS = 400

// Waterfall colour auto-scale window (frames). sigplot's autol:N recomputes
// the z colour range every ~N frames. A small N (was 5) chases the noise
// floor at LOW bandwidth/sample-rate — where most of the span is random
// noise — re-mapping the whole raster's colours every few frames => the
// "jumpy at 10kHz, fine at wide bandwidth" symptom. A long window (~100
// frames ≈ 4s) keeps colours stable while still adapting to real signal
// level changes over seconds. (Spectrum LINE keeps a responsive autol;
// only the raster colour-map needs to be steady.)
const WF_AUTOL = 100

const MIN_BINS = 1024
// Keep in sync with MAX_FFT_SIZE in sentinel_radio/services/sdr.py — the backend
// snaps any request above this back down to the cap, so asking for more than
// MAX_BINS just wastes the frontend's per-zoom math.
const MAX_BINS = 32768

/** Builds the plots for one waterfall. */
export function useWaterfallPlots({
  source,
  plots,
  spectrumElement,
  waterfallElement,
  spanStartHz,
  spanEndHz,
  viewRange,
  measureSpectrumDataBox,
  waterfallDataTopPx,
  waterfallDataHeightPx,
  recordRowPushTime,
  clearRowPushTimes,
  attachAccordions,
  detachAccordions,
  applyMarker,
  isWritingBracket,
  isFreqDragActive,
  attachAnnotationPlugin,
  detachAnnotationPlugin,
}: WaterfallPlotsOptions): void {
  const { zoom, zmin, zmax, autoScale, livePanOffsetHz, applyZoom, applySpecRange } = viewRange
  // Layer uuids and the current bin count — plain bindings, like the plots.
  let specUuid = ''
  let wfUuid = ''
  let subsize = 0
  let ro: ResizeObserver | null = null
  // Same scaling expressed in MHz. The spectrum axis is fed these so SigPlot
  // renders frequency labels directly in MHz (e.g. 100.5000) to match the
  // radio's MHz frequency display, instead of auto-scaling raw Hz to its own
  // "100.5M" form. At ~100 magnitude SigPlot's mx.mult() returns 1.0 (no extra
  // unit scaling), so the tick text is the plain MHz value.
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
  function computeDesiredBins(): number {
    const el = waterfallElement()
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
    source.requestFftSize(bins)
    return bins
  }

  function buildPipes(n: number) {
    // Both callers (initPlots and the lastSpectrum watch) only run with the plots
    // present — the watch guards `!plots.spectrum || !plots.waterfall` and returns first.
    /* v8 ignore start */
    if (!plots.spectrum || !plots.waterfall) return
    /* v8 ignore stop */
    if (subsize) {
      try {
        plots.spectrum.remove_layer(specUuid)
      } catch {
        /* noop */
      }
      try {
        plots.waterfall.remove_layer(wfUuid)
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
    specUuid = plots.spectrum.overlay_array(
      null,
      { type: 1000, xunits: 3, yunits: 26, size: n, xstart: xstartMHz, xdelta: xdeltaMHz },
      { color: '#00aaff', fillStyle: 'rgba(0,170,255,0.14)' },
    )
    // Waterfall: 2-D raster via overlay_pipe + push (the documented scrolling-2D
    // pattern). `drawmode:'falling'` => newest row enters at the top and the
    // history scrolls downward. `lps` fixes the history depth so it doesn't
    // depend on mount-time pixel height; `pipesize` sizes the ring buffer.
    wfUuid = plots.waterfall.overlay_pipe(
      {
        type: 2000,
        subsize: n,
        xunits: 3,
        xstart: plots.firstBinHz,
        xdelta: plots.hzPerBin,
        lps: WF_ROWS,
        pipesize: WF_ROWS * n * 2,
      },
      { drawmode: 'falling', framesize: n },
    )
    // cmap 1 = the blue→red ramp. Start auto-scaling z to the live data so the
    // raster always has contrast; the Min/Max sliders switch to a fixed range.
    if (autoScale.value) {
      plots.waterfall.change_settings({ cmap: 1, autol: WF_AUTOL })
    } else {
      plots.waterfall.change_settings({ cmap: 1, autol: -1, zmin: zmin.value, zmax: zmax.value })
    }
  }

  let rafId = 0

  function initPlots() {
    // Deferred via a double rAF that onBeforeUnmount cancels, so by the time this
    // runs the template refs are always populated.
    /* v8 ignore start */
    const spectrumHost = spectrumElement()
    const waterfallHost = waterfallElement()
    if (!spectrumHost || !waterfallHost) return
    /* v8 ignore stop */

    // Spectrum keeps the SigPlot axes (frequency grid + dB scale) — only the
    // interactive chrome (menu/pan/drag/legend) is suppressed. fg drives the
    // axis lines, ticks and labels; the trace itself is coloured separately via
    // the layer's `color`/`fillStyle` options in buildPipes().
    // noreadout: hide the x:/y:/dx:/dy: cursor panel. xlabel/ylabel are left
    // unset (null) so SigPlot does NOT render the "<ylabel> vs <xlabel>" title
    // strip — the axis tics already make the units obvious. Both are independent
    // of show_x_axis/show_y_axis, so the grid + scale remain.
    plots.spectrum = new sigplot.Plot(spectrumHost, {
      // dB ruler driven by the Min/Max sliders (SDR++ behaviour, manual pp. 30-31).
      // autoy:0 = Fix mode, no Y auto-scaling — sigplot stays on whatever ymin/ymax
      // we last set via change_settings(). Initial values come from the slider
      // refs, which were seeded from the per-device DEVICE_DB_RANGE (useWaterfallViewRange).
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
    plots.waterfall = new sigplot.Plot(waterfallHost, {
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
      ymin: (plots.spectrum as unknown as { _Gx: { ymin: number } })?._Gx?.ymin,
      ymax: (plots.spectrum as unknown as { _Gx: { ymax: number } })?._Gx?.ymax,
      autoy: (plots.spectrum as unknown as { _Gx: { autoy: number } })?._Gx?.autoy,
      autol: (plots.spectrum as unknown as { _Gx: { autol: number } })?._Gx?.autol,
      stk0: (plots.spectrum as unknown as { _Mx: { stk: Array<{ ymin: number; ymax: number }> } })
        ?._Mx?.stk?.[0],
    })

    // Publish the canvas-sized FFT bin target now so the backend can switch as
    // soon as the WS is up (SdrPanel forwards on socket open if it fires early).
    buildPipes(publishDesiredBins())

    // Tuned-frequency marker: the passband and carrier-line accordions on both
    // plots (composables/useBandwidthBracketDrag.ts), pinned to the source.
    attachAccordions(sigplot.plugins.AccordionPlugin, plots.spectrum, plots.waterfall)

    // The known-frequency AnnotationPlugin (kept attached but empty — the HTML
    // marker overlay draws the markers; see useKnownFrequencyMarkers).
    const AnnotationPlugin = (
      sigplot.plugins as unknown as {
        AnnotationPlugin: new (options: { display: boolean }) => KnownFrequencyAnnotationPlugin
      }
    ).AnnotationPlugin
    attachAnnotationPlugin(
      plots.spectrum as unknown as KnownFrequencyAnnotationHost,
      new AnnotationPlugin({ display: true }),
    )

    // The axis/tick `fg` colour is also used by default for the grid lines.
    // Override the grid stroke independently so the grid stays dark while
    // tick labels remain white.
    // Preserve sigplot's default dashed grid pattern (`on:1, off:3`); only swap
    // the colour so labels stay white but the grid is black.
    const gridStyle = { color: '#888888', mode: 'dashed', on: 1, off: 3 }
    plots.spectrum.change_settings({ gridStyle })
    // Waterfall keeps grid drawn in the BG colour so it stays invisible. Visible
    // grid lines bleed through the unfilled portion of the raster (rows that
    // haven't received pipe data yet — drawmode 'falling' fills top-down, so on
    // fresh start the bottom of the canvas exposes the grid until lps rows arrive).
    // Grid + tick suppression for the waterfall is handled at the mx.drawaxis
    // patch site (sigplotAxisPatches.ts) — it short-circuits all tick/label/grid drawing
    // when Mx.fg === Mx.bg (true only for the waterfall plot). Settings-level
    // change_settings({ grid: false }) leaves Mx.tics' tick-stub draws untouched.

    // Narrow both plots' gutters identically (see sigplotAxisPatches) — the
    // spectrum and waterfall must share Mx.l or their frequencies misalign.
    installMarginTweaks(plots.spectrum)
    installMarginTweaks(plots.waterfall)

    // sigplot sizes its canvas to the element's clientHeight at creation time and
    // only resizes on checkresize(). The flex children settle their final height
    // AFTER creation, so force a resize on the next frame (fixes the canvas being
    // stuck at its initial ~300px). Observe the plot ELEMENTS (not just the root)
    // so internal flex resizes — and the side-panel toggle — both trigger it.
    ro = new ResizeObserver(() => {
      plots.spectrum?.checkresize()
      plots.waterfall?.checkresize()
      syncBandInset()
      // The bin count stays pinned to its mount-time value on canvas resize, so a
      // side-panel toggle / browser zoom doesn't wipe the waterfall history.
    })
    ro.observe(spectrumHost)
    ro.observe(waterfallHost)

    requestAnimationFrame(() => {
      plots.spectrum?.checkresize()
      plots.waterfall?.checkresize()
      syncBandInset()
    })
  }

  // Read the spectrum plot's real data-area margins and hand them to the
  // overlay insets (useWaterfallDataBox), then the raster's. Mx is
  // sigplot-internal (no public accessor); the plugin base reads it the same way
  // (this._plot._Mx), so this is the supported-by-precedent path.
  function syncBandInset() {
    const mx = (plots.spectrum as unknown as { _Mx?: PlotMargins } | null)?._Mx
    if (!mx || !mx.width) return
    measureSpectrumDataBox(mx)
    syncWaterfallDataBox()
  }

  // Same read as syncBandInset, against the WATERFALL plot: its data box top and
  // height are what the time markers hang off. Kept separate because the two
  // plots only share their horizontal margins — vertically the raster fills its
  // own element.
  function syncWaterfallDataBox() {
    const mx = (
      plots.waterfall as unknown as {
        _Mx?: { t: number; b: number; height: number }
      } | null
    )?._Mx
    if (!mx || !(mx.b > mx.t)) return
    waterfallDataTopPx.value = Math.max(0, Math.round(mx.t))
    waterfallDataHeightPx.value = Math.round(mx.b - mx.t)
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
    if (
      frame &&
      source.playing &&
      !source.displayPaused &&
      !(source.searchSweeping || source.scanSweeping) &&
      plots.spectrum
    ) {
      plots.spectrum.reload(specUuid, frame.bins)
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
    () => source.lastSpectrum,
    (frame) => {
      if (
        !source.playing ||
        source.displayPaused ||
        source.searchSweeping ||
        source.scanSweeping ||
        !frame ||
        !plots.spectrum ||
        !plots.waterfall
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
        plots.firstBinHz = spanStartHz.value
        plots.hzPerBin = frame.sample_rate / Math.max(1, frame.bins.length)
        xstartMHz = plots.firstBinHz / HZ_PER_MHZ
        xdeltaMHz = plots.hzPerBin / HZ_PER_MHZ
        // Drive freq tick spacing in 0.1 MHz steps regardless of the device's
        // sample-rate span. xdiv == (span in MHz) / 0.1. change_settings() does
        // not handle xdiv, so write to _Gx directly.
        const spanMHz = frame.sample_rate / HZ_PER_MHZ
        const xdiv = Math.max(2, Math.round(spanMHz / 0.1))
        ;(plots.spectrum as unknown as { _Gx: { xdiv: number } })._Gx.xdiv = xdiv
        ;(plots.waterfall as unknown as { _Gx: { xdiv: number } })._Gx.xdiv = xdiv
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
        plots.waterfall.push(wfUuid, frame.bins)
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
          plots.waterfall as unknown as {
            _Mx: { level: number; stk: Array<{ ymin: number; ymax: number }> }
            _Gx: { lyr: Array<{ ymin: number; ymax: number }> }
          }
        )._Mx
        const wfGx = (
          plots.waterfall as unknown as {
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
    () => source.playing,
    (isPlaying) => {
      if (isPlaying || !plots.spectrum || !plots.waterfall || !subsize) return
      // Drop any frame queued for the next paint so it can't draw post-stop.
      if (drawRaf) {
        cancelAnimationFrame(drawRaf)
        drawRaf = 0
      }
      pendingFrame = null
      const blank = new Float32Array(subsize)
      try {
        plots.spectrum.reload(specUuid, blank)
      } catch {
        /* noop */
      }
      // Rebuild the waterfall pipe to clear its scroll history.
      clearRowPushTimes()
      try {
        plots.waterfall.remove_layer(wfUuid)
        wfUuid = plots.waterfall.overlay_pipe(
          {
            type: 2000,
            subsize,
            xunits: 3,
            // Same Hz scaling as buildPipes — without xstart/xdelta the axis
            // defaults to a 0..N bin index, which after a stop/play cycle leaves
            // the waterfall (and its marker) misaligned with the spectrum.
            xstart: plots.firstBinHz,
            xdelta: plots.hzPerBin,
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
          plots.waterfall.change_settings({ cmap: 1, autol: WF_AUTOL })
        } else {
          plots.waterfall.change_settings({
            cmap: 1,
            autol: -1,
            zmin: zmin.value,
            zmax: zmax.value,
          })
        }
      } catch {
        /* noop */
      }
      // Hide the marker while stopped (the pipe rebuild dropped its canvas draw
      // anyway); applyMarker reads source.playing for visibility.
      applyMarker()
    },
  )

  // Track external tuning (typed freq, saved-freq click, mode change, backend
  // status reconcile — all flow into the store) and play/stop visibility. Skip
  // while WE are mid programmatic write to avoid feeding our own change back.
  watch(
    () =>
      [
        source.currentFreqHz,
        source.bwHz,
        source.sampleRate,
        source.playing,
        source.currentMode,
      ] as const,
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
  watch([zmin, zmax], ([lo, hi]) => {
    // Sliders crossed: viewRange stops the one just moved short of the other,
    // which re-fires this watcher with a valid range.
    if (viewRange.clampSliderCollision(lo, hi)) return
    autoScale.value = false
    applySpecRange(lo, hi)
    // Persist so the Max/Min range survives navigating away and back.
    source.setViewSettings({ zmin: lo, zmax: hi, autoScale: false })
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
    source.setViewSettings({ zoom: z })
  })

  // Re-window when the selected frequency moves while zoomed in. Retuning with
  // auto-centre ON changes the span centre, which rebuilds the layers (frame
  // watcher → buildPipes → applyZoom). But with auto-centre OFF the span centre
  // is unchanged — only the demod target (currentFreqHz) moves — so without this
  // the zoom viewport would stay pinned to the previous frequency. No-op at
  // zoom <= 1 (applyZoom takes the unzoom path). The overlay computeds already
  // track currentFreqHz reactively via zoomWindowHz().
  watch(
    () => source.currentFreqHz,
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
    detachAccordions()
    detachAnnotationPlugin()
    try {
      plots.spectrum?.remove_layer(specUuid)
    } catch {
      /* noop */
    }
    try {
      plots.waterfall?.remove_layer(wfUuid)
    } catch {
      /* noop */
    }
    try {
      plots.spectrum?.disable_listeners()
    } catch {
      /* noop */
    }
    try {
      plots.waterfall?.disable_listeners()
    } catch {
      /* noop */
    }
    plots.spectrum = null
    plots.waterfall = null
  })
}
