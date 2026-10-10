/**
 * Which name a band-plan strip on the spectrum shows, given how wide it is.
 *
 * A band's box can be far narrower than its name (30m Amateur spans 50 kHz),
 * and a centred name in an `overflow: hidden` box is cropped at both ends
 * ("M AMATE"). So the strip shows the full name when it fits, else the short
 * form (its first word — "30M"), else nothing; never a cropped fragment.
 */

/** Width of one glyph at the strip's 700/11px Barlow, uppercase — as the tick labels assume. */
export const BAND_LABEL_PX_PER_CHAR = 7

/** The label's horizontal padding (6px either side, `.sdr-wf-band span`). */
export const BAND_LABEL_PADDING_PX = 12

function fits(text: string, boxWidthPx: number): boolean {
  return text.length * BAND_LABEL_PX_PER_CHAR + BAND_LABEL_PADDING_PX <= boxWidthPx
}

/** A band name's short form: its first word ("30m Amateur" → "30m"). */
export function shortBandName(name: string): string {
  // Everything from the first whitespace on is dropped.
  return name.trim().replace(/\s.*$/s, '')
}

/**
 * The label for a band strip `boxWidthPx` wide: the full name, the short
 * form, or '' when neither fits. An unmeasured box (0) keeps the full name.
 */
export function fitBandLabel(name: string, boxWidthPx: number): string {
  if (boxWidthPx <= 0 || fits(name, boxWidthPx)) return name
  const short = shortBandName(name)
  return fits(short, boxWidthPx) ? short : ''
}
