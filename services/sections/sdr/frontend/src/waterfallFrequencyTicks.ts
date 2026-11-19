/**
 * The frequency axis under the spectrum: where each tick line sits and which
 * ticks carry a label. sigplot's own x-axis labels are suppressed (see
 * `sigplotAxisPatches.ts`), so these are drawn as HTML by
 * `SdrFrequencyTickGutter.vue` and must land exactly where sigplot would put them.
 */

/** Hz in one MHz: the spectrum's x-axis unit. */
export const HZ_PER_MHZ = 1e6

/** One tick on the frequency gutter. */
export interface FrequencyTick {
  key: string
  /** Position across the data box, 0..100. */
  leftPct: number
  label: string
  /** False when the label is thinned out so neighbouring pills never overlap. */
  labeled: boolean
}

/** What the tick layout needs: the full span, the visible window and the data box width. */
export interface FrequencyTickWindow {
  spanStartHz: number
  spanEndHz: number
  windowLowHz: number
  windowHighHz: number
  /** Data box width in px; 0 while unmeasured (every label then stays visible). */
  dataBoxWidthPx: number
}

/**
 * Lay out the ticks for the visible window.
 *
 * Step size mirrors sigplot's mx.tics() nice-number selection (mx.js:2834-2889)
 * applied to the VISIBLE (zoom-aware) window with the SAME xdiv the spectrum
 * plot is given — full-span / 0.1 MHz. At full zoom that produces 0.1 MHz
 * steps; when zoomed in, sigplot picks a finer nice number (0.05, 0.02, 0.01…)
 * for its labels, and we must match so every label gets a tick (not just the
 * labels that happen to land on 0.1 MHz multiples).
 *
 * @returns The ticks left to right; empty when the span is empty.
 */
export function layoutFrequencyTicks(view: FrequencyTickWindow): FrequencyTick[] {
  const lo = view.spanStartHz
  const hi = view.spanEndHz
  if (hi <= lo) return []
  const winLo = view.windowLowHz
  const winHi = view.windowHighHz
  const windowWidthHz = winHi - winLo
  const fullSpanMHz = (hi - lo) / HZ_PER_MHZ
  const ndiv = Math.max(2, Math.round(fullSpanMHz / 0.1))
  const winMHz = windowWidthHz / HZ_PER_MHZ
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
  const ticks: FrequencyTick[] = []
  let widestLabelChars = 0
  for (let tickHz = first; tickHz <= winHi; tickHz += stepHz) {
    const label = formatFreqTick(tickHz, decimals)
    widestLabelChars = Math.max(widestLabelChars, label.length)
    ticks.push({
      key: `t-${tickHz}`,
      leftPct: ((tickHz - winLo) / windowWidthHz) * 100,
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
  const boxWidthPx = view.dataBoxWidthPx
  // syncBandInset measures the data box (boxWidthPx > 0) before the first frame
  // produces a span, so by the time this code runs the box is always measured;
  // the unmeasured arm is defensive — leave every label visible.
  /* v8 ignore start */
  if (boxWidthPx <= 0) return ticks
  /* v8 ignore stop */
  const tickGapPx = (stepHz / windowWidthHz) * boxWidthPx
  const labelPillPx = widestLabelChars * 7 + 9 * 2
  const minLabelGapPx = labelPillPx + 6
  const labelStride = Math.max(1, Math.ceil(minLabelGapPx / tickGapPx))
  for (let index = 0; index < ticks.length; index += 1) {
    ticks[index]!.labeled = index % labelStride === 0
  }
  return ticks
}

/**
 * Format a tick frequency (Hz) with an SI unit suffix chosen by magnitude:
 * kHz → "K", MHz → "M", GHz → "G". `mhzDecimals` is computed in MHz (the axis's
 * native unit), so the precision is re-derived for the chosen unit: scaling
 * Hz→kHz shifts the decimal point three places (so +3 decimals vs MHz), Hz→GHz
 * shifts it back three (−3), and the value is then trimmed of trailing zeros so
 * e.g. 123.00 reads "123M", 123.45 reads "123.45M".
 */
export function formatFreqTick(hz: number, mhzDecimals: number): string {
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
