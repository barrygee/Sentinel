/** A run of text and whether it is a search match (rendered as `<mark>`). */
export interface HighlightSegment {
  text: string
  match: boolean
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A pattern for the terms where they start a word, case-insensitive, longest
 * term first. A search for "adsb" is a prefix match, so it must not light up
 * the "adsb" inside "readsb". One pattern serves both the highlighting and the
 * snippet's choice of where to centre, so they cannot disagree.
 *
 * @returns Null when there are no usable terms.
 */
function wordStartPattern(terms: readonly string[]): RegExp | null {
  const usableTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term !== ''))]
  if (usableTerms.length === 0) return null
  usableTerms.sort((first, second) => second.length - first.length)
  return new RegExp(`(?<![\\p{L}\\p{N}_-])(${usableTerms.map(escapeForPattern).join('|')})`, 'giu')
}

/** Splits `text` into plain and matching runs for the given terms. */
export function highlightSegments(text: string, terms: readonly string[]): HighlightSegment[] {
  const pattern = wordStartPattern(terms)
  if (pattern === null || text === '') return [{ text, match: false }]
  // split() with one capture group puts every match at an odd index.
  return text
    .split(pattern)
    .map((part, index) => ({ text: part, match: index % 2 === 1 }))
    .filter((segment) => segment.text !== '')
}

/**
 * A short excerpt of `text` around the first match, so a result shows why it
 * matched. Cuts on word boundaries and marks a cut with an ellipsis.
 */
export function snippetAround(text: string, terms: readonly string[], radius = 90): string {
  const firstMatch = wordStartPattern(terms)?.exec(text)?.index ?? -1
  const start = Math.max(0, firstMatch === -1 ? 0 : firstMatch - radius)
  const end = Math.min(text.length, start + radius * 2)
  let excerpt = text.slice(start, end)
  if (start > 0) excerpt = excerpt.replace(/^\S*\s/, '')
  if (end < text.length) excerpt = excerpt.replace(/\s\S*$/, '')
  return `${start > 0 ? '\u2026' : ''}${excerpt}${end < text.length ? '\u2026' : ''}`
}
