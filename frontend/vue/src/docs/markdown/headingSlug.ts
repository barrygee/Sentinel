/**
 * GitHub-compatible heading anchors, so a `#fragment` copied from GitHub (or
 * written in a doc to be read on GitHub) lands on the same heading in the app.
 *
 * This file has no imports on purpose: the CI link check
 * (`scripts/check-doc-links.ts`) loads it directly to compute the same anchors.
 */

/**
 * The base slug of a heading's text: lower-case, everything except letters,
 * marks, numbers, underscores and hyphens dropped, spaces turned into hyphens.
 */
export function baseHeadingSlug(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Creates a slugger for one document. Repeated headings get `-1`, `-2`
 * suffixes in document order, exactly as GitHub numbers them, so create a new
 * slugger per document and feed it every heading in order.
 */
export function createHeadingSlugger(): (headingText: string) => string {
  const used = new Set<string>()
  const repeatCounts = new Map<string, number>()
  return (headingText: string): string => {
    const base = baseHeadingSlug(headingText)
    let candidate = base
    let repeat = repeatCounts.get(base) ?? 0
    // A heading literally titled "Setup 1" can collide with the numbered repeat
    // of "Setup", so keep counting until the slug is genuinely unused.
    while (used.has(candidate)) {
      repeat += 1
      candidate = `${base}-${repeat}`
    }
    repeatCounts.set(base, repeat)
    used.add(candidate)
    return candidate
  }
}
