/**
 * Patches to sigplot's internal `mx` drawing module and to each plot's margins,
 * so the spectrum and waterfall draw the axis chrome Sentinel wants. Importing
 * this module applies the `mx` patches once, app-wide (sigplot has no per-plot
 * seam for them); `installMarginTweaks` is applied per plot by
 * `useWaterfallPlots`.
 */
import type { Plot } from 'sigplot'
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

/**
 * Narrow the gutters sigplot reserves around a plot's data box.
 *
 * sigplot hard-codes the left gutter at `text_w * 6` (sigplot.js:3807), which
 * leaves a wide gap between the dB tick labels and the trace; our labels are at
 * most 4 chars wide ("-120"), so a setter on `_Mx.l` shrinks it. BOTH plots must
 * use the same factor, or the same frequency lands at a different screen x on
 * the spectrum and the waterfall.
 *
 * @param plot - A sigplot plot whose `_Mx` margins should be overridden.
 */
export function installMarginTweaks(plot: Plot): void {
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
  // gap (the mx.text override above shifts label baselines into the extra
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
