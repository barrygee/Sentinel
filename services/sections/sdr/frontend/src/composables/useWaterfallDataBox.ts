/**
 * The spectrum's data box — the rectangle sigplot draws the trace in, inside
 * its axis gutters — measured into refs, and the inline styles every HTML
 * overlay derives from it so the band strip, the frequency ticks and the
 * known-frequency markers line up with the trace whatever the font scaling.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C15). `useWaterfallPlots`
 * calls `measure` with the spectrum plot's margins after every layout change
 * and draw; `useFrequencyDrag` and `useSignalMarkers` read the insets.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { SPEC_YMAX_DB, SPEC_YMIN_DB } from './useWaterfallViewRange'

/** sigplot's internal margins (`plot._Mx`): data box edges in canvas px. */
export interface PlotMargins {
  l: number
  r: number
  t: number
  b: number
  width: number
  height: number
}

/** An inline style object for an overlay element. */
type OverlayStyle = Record<string, string | undefined>

/** The measured data box and the overlay styles built from it. */
export interface WaterfallDataBox {
  bandInsetLeftPx: Ref<number>
  bandInsetRightPx: Ref<number>
  bandInsetBottomPx: Ref<number>
  bandInsetTopPx: Ref<number>
  dataBoxWidthPx: Ref<number>
  bandOverlayStyle: ComputedRef<OverlayStyle>
  spectrumStyle: ComputedRef<OverlayStyle>
  rasterStyle: ComputedRef<OverlayStyle>
  tickGutterStyle: ComputedRef<OverlayStyle>
  knownFreqOverlayStyle: ComputedRef<OverlayStyle>
  /** Copies the spectrum plot's live margins into the insets. */
  measure: (margins: PlotMargins) => void
}

/** Builds the data box refs for one waterfall. */
export function useWaterfallDataBox(): WaterfallDataBox {
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

  function measure(mx: PlotMargins) {
    // Exact fractional pixels, NOT floor/ceil to whole pixels: known-frequency
    // markers and the click-to-tune math (useFrequencyDrag) both project onto this inset via
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

  return {
    bandInsetLeftPx,
    bandInsetRightPx,
    bandInsetBottomPx,
    bandInsetTopPx,
    dataBoxWidthPx,
    bandOverlayStyle,
    spectrumStyle,
    rasterStyle,
    tickGutterStyle,
    knownFreqOverlayStyle,
    measure,
  }
}
