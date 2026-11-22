import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  formatPeriod,
  formatPeriodEdge,
  formatSources,
  mergeCoveragePeriods,
} from './historySummary'

const MINUTE = 60_000

describe('mergeCoveragePeriods', () => {
  it('joins touching buckets and splits at gaps, oldest first', () => {
    const periods = mergeCoveragePeriods(
      [
        [10 * MINUTE, 3, 'online'],
        [0, 5, 'online'],
        [MINUTE, 2, 'online'],
        [11 * MINUTE, 1, 'offgrid'],
      ],
      MINUTE,
    )
    expect(periods).toEqual([
      { start: 0, end: 2 * MINUTE, sources: ['online'] },
      { start: 10 * MINUTE, end: 12 * MINUTE, sources: ['offgrid', 'online'] },
    ])
  })

  it('counts a bucket heard from both sources once', () => {
    expect(
      mergeCoveragePeriods(
        [
          [0, 1, 'online'],
          [0, 1, 'offgrid'],
        ],
        MINUTE,
      ),
    ).toEqual([{ start: 0, end: MINUTE, sources: ['offgrid', 'online'] }])
  })

  it('nothing recorded is no periods', () => {
    expect(mergeCoveragePeriods([], MINUTE)).toEqual([])
  })
})

describe('formatting', () => {
  it('formats edges and periods in UTC', () => {
    expect(formatPeriodEdge(Date.UTC(2026, 10, 8, 5, 7))).toBe('08 NOV 05:07')
    expect(formatPeriod(Date.UTC(2026, 10, 18, 5, 10), Date.UTC(2026, 10, 22, 13, 20))).toBe(
      '18 NOV 05:10 – 22 NOV 13:20 UTC',
    )
  })

  it.each([
    [['online'], 'ONLINE'],
    [['offgrid'], 'OFF GRID'],
    [['offgrid', 'online'], 'OFF GRID + ONLINE'],
  ])('names sources %j as %s', (sources, expected) => {
    expect(formatSources(sources)).toBe(expected)
  })

  it.each([
    [0, '0 KB'],
    [100, '1 KB'],
    [8192, '8 KB'],
    [12 * 1024 ** 2, '12 MB'],
    [3.5 * 1024 ** 3, '3.5 GB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})
