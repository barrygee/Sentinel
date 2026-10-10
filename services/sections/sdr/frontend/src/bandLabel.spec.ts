import { describe, it, expect } from 'vitest'
import {
  BAND_LABEL_PADDING_PX,
  BAND_LABEL_PX_PER_CHAR,
  fitBandLabel,
  shortBandName,
} from './bandLabel'

/** The strip width a label of `chars` characters needs, exactly. */
const widthFor = (chars: number) => chars * BAND_LABEL_PX_PER_CHAR + BAND_LABEL_PADDING_PX

describe('shortBandName', () => {
  it('is the first word', () => {
    expect(shortBandName('30m Amateur')).toBe('30m')
  })

  it('is the whole name when it is one word', () => {
    expect(shortBandName('31m')).toBe('31m')
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(shortBandName('  2m   Amateur ')).toBe('2m')
  })

  it('is empty for an empty name', () => {
    expect(shortBandName('')).toBe('')
  })
})

describe('fitBandLabel', () => {
  it('shows the full name when it fits, including exactly', () => {
    expect(fitBandLabel('30m Amateur', widthFor(11))).toBe('30m Amateur')
    expect(fitBandLabel('30m Amateur', 500)).toBe('30m Amateur')
  })

  it('falls back to the short form when the full name would be cropped', () => {
    expect(fitBandLabel('30m Amateur', widthFor(11) - 1)).toBe('30m')
    expect(fitBandLabel('30m Amateur', widthFor(3))).toBe('30m')
  })

  it('shows nothing when even the short form would be cropped', () => {
    expect(fitBandLabel('30m Amateur', widthFor(3) - 1)).toBe('')
  })

  it('keeps the full name in a box not yet measured', () => {
    expect(fitBandLabel('30m Amateur', 0)).toBe('30m Amateur')
  })
})
