import { describe, expect, it } from 'vitest'
import { fingerprintLines, PAIRS_PER_LINE } from './fingerprintLines'

const pairs = (count: number) =>
  Array.from({ length: count }, (_unused, index) =>
    index.toString(16).padStart(2, '0').toUpperCase(),
  )

describe('fingerprintLines', () => {
  it('splits a SHA-256 fingerprint into two lines of sixteen pairs, between pairs', () => {
    const all = pairs(32)
    expect(fingerprintLines(all.join(':'))).toBe(
      `${all.slice(0, PAIRS_PER_LINE).join(':')}\n${all.slice(PAIRS_PER_LINE).join(':')}`,
    )
  })

  it('keeps a short fingerprint on one line', () => {
    expect(fingerprintLines(pairs(5).join(':'))).toBe('00:01:02:03:04')
  })

  it('puts the remainder of an uneven fingerprint on a last, shorter line', () => {
    const all = pairs(17)
    expect(fingerprintLines(all.join(':')).split('\n')).toEqual([all.slice(0, 16).join(':'), '10'])
  })

  it.each([null, undefined, ''])('is empty for no fingerprint (%s)', (missing) => {
    expect(fingerprintLines(missing)).toBe('')
  })
})
