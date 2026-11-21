import { describe, it, expect } from 'vitest'
import {
  describeReplayMoment,
  formatReplayMoment,
  fromUtcInputValue,
  toUtcInputValue,
} from './playbackTime'

// 14 Nov 2026 13:42:10 UTC.
const MOMENT = Date.UTC(2026, 10, 14, 13, 42, 10)

describe('playbackTime', () => {
  it('formats the replayed moment in UTC with a two-digit day and time', () => {
    expect(formatReplayMoment(MOMENT)).toBe('14 NOV 13:42:10 UTC')
    expect(formatReplayMoment(Date.UTC(2026, 0, 3, 4, 5, 6))).toBe('03 JAN 04:05:06 UTC')
  })

  it('describes the moment in words for screen readers', () => {
    expect(describeReplayMoment(MOMENT)).toBe('14 November 2026, 13:42:10 UTC')
    expect(describeReplayMoment(Date.UTC(2026, 0, 3, 4, 5, 6))).toBe('3 January 2026, 04:05:06 UTC')
  })

  it('writes and reads datetime-local values as UTC', () => {
    expect(toUtcInputValue(MOMENT)).toBe('2026-11-14T13:42')
    expect(fromUtcInputValue('2026-11-14T13:42')).toBe(Date.UTC(2026, 10, 14, 13, 42))
  })

  it.each(['', '2026-11-14', '2026-11-14T13:42:10', 'nonsense', '2026-13-40T99:99'])(
    'reads %j as no moment',
    (value) => {
      expect(fromUtcInputValue(value)).toBeNull()
    },
  )
})
