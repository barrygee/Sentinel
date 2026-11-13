/** Pairs per line: a SHA-256 fingerprint's 32 pairs make two even lines. */
export const PAIRS_PER_LINE = 16

/**
 * A certificate fingerprint (`AA:BB:…`) as lines of sixteen pairs, joined by
 * newlines for a `white-space: pre-wrap` element. Lines break between pairs,
 * never inside one: a pair split across lines is easy to misread when the
 * operator compares it with the host's own, character by character.
 */
export function fingerprintLines(fingerprint: string | null | undefined): string {
  const pairs = (fingerprint ?? '').split(':')
  const lines: string[] = []
  for (let index = 0; index < pairs.length; index += PAIRS_PER_LINE) {
    lines.push(pairs.slice(index, index + PAIRS_PER_LINE).join(':'))
  }
  return lines.join('\n')
}
