import { describe, it, expect } from 'vitest'
import { formatDegrees, formatFixTime, formatKnots, navStatusLabel } from './seaFormat'

describe('seaFormat', () => {
  it('labels known navigational statuses and shows unknown codes as-is', () => {
    expect(navStatusLabel(0)).toBe('UNDER WAY')
    expect(navStatusLabel(1)).toBe('AT ANCHOR')
    expect(navStatusLabel(5)).toBe('MOORED')
    expect(navStatusLabel(14)).toBe('AIS-SART')
    expect(navStatusLabel(11)).toBe('STATUS 11')
    expect(navStatusLabel(null)).toBe('—')
  })

  it('formats speed to a tenth of a knot', () => {
    expect(formatKnots(18.44)).toBe('18.4 KN')
    expect(formatKnots(0)).toBe('0.0 KN')
    expect(formatKnots(null)).toBe('—')
  })

  it('rounds bearings to whole degrees', () => {
    expect(formatDegrees(121.6)).toBe('122°')
    expect(formatDegrees(0)).toBe('0°')
    expect(formatDegrees(null)).toBe('—')
  })

  it('formats a fix time as HH:MM:SSZ', () => {
    expect(formatFixTime(Date.UTC(2026, 8, 12, 8, 41, 3))).toBe('08:41:03Z')
  })
})
