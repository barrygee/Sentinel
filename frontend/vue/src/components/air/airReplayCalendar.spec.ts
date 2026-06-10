import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CAL_MONTHS,
  toIso,
  formatDisplayDate,
  buildCalCells,
  prevMonth,
  nextMonth,
} from './airReplayCalendar'

describe('CAL_MONTHS', () => {
  it('lists the twelve month names in calendar order', () => {
    expect(CAL_MONTHS).toHaveLength(12)
    expect(CAL_MONTHS[0]).toBe('January')
    expect(CAL_MONTHS[11]).toBe('December')
  })
})

describe('toIso', () => {
  it('formats a date as zero-padded YYYY-MM-DD in local time', () => {
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toIso(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
})

describe('formatDisplayDate', () => {
  it('reorders an ISO date into a spaced DD / MM / YYYY display string', () => {
    expect(formatDisplayDate('2026-06-10')).toBe('10 / 06 / 2026')
  })
})

describe('prevMonth', () => {
  it('decrements the month within the same year', () => {
    expect(prevMonth(5, 2026)).toEqual({ month: 4, year: 2026 })
  })

  it('wraps January back to December of the previous year', () => {
    expect(prevMonth(0, 2026)).toEqual({ month: 11, year: 2025 })
  })
})

describe('nextMonth', () => {
  it('increments the month within the same year', () => {
    expect(nextMonth(5, 2026)).toEqual({ month: 6, year: 2026 })
  })

  it('wraps December forward to January of the next year', () => {
    expect(nextMonth(11, 2026)).toEqual({ month: 0, year: 2027 })
  })
})

describe('buildCalCells', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fix "today" so the `today` flag is deterministic.
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('always returns a 42-cell (6-week) grid', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '',
      availableSet: new Set(),
    })
    expect(cells).toHaveLength(42)
  })

  it('marks leading days from the previous month as "other"', () => {
    // June 2026 starts on a Monday, so there are no leading other-days; use a
    // month that does. May 2026 starts on a Friday → 4 leading prev-month cells.
    const cells = buildCalCells({
      year: 2026,
      month: 4,
      selectedIso: '',
      availableSet: new Set(),
    })
    expect(cells[0]!.other).toBe(true)
    expect(cells[0]!.iso).toBe('2026-04-27')
    // The first in-month cell is the 1st of May.
    const firstInMonth = cells.find((cell) => !cell.other)!
    expect(firstInMonth.day).toBe(1)
    expect(firstInMonth.iso).toBe('2026-05-01')
  })

  it('marks trailing days from the next month as "other"', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '',
      availableSet: new Set(),
    })
    const lastCell = cells[41]!
    expect(lastCell.other).toBe(true)
    expect(lastCell.iso.startsWith('2026-07')).toBe(true)
  })

  it('flags the cell whose ISO equals today', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '',
      availableSet: new Set(['2026-06-10']),
    })
    const todayCell = cells.find((cell) => cell.iso === '2026-06-10')!
    expect(todayCell.today).toBe(true)
    expect(cells.filter((cell) => cell.today)).toHaveLength(1)
  })

  it('flags the cell matching the selected ISO', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '2026-06-15',
      availableSet: new Set(['2026-06-15']),
    })
    expect(cells.find((cell) => cell.iso === '2026-06-15')!.selected).toBe(true)
  })

  it('disables cells whose ISO is not in the available set', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '',
      availableSet: new Set(['2026-06-10']),
    })
    expect(cells.find((cell) => cell.iso === '2026-06-10')!.disabled).toBe(false)
    expect(cells.find((cell) => cell.iso === '2026-06-11')!.disabled).toBe(true)
  })

  it('disables cells before minIso even when otherwise available', () => {
    const allJune = new Set(
      Array.from({ length: 30 }, (_, index) => `2026-06-${String(index + 1).padStart(2, '0')}`),
    )
    const cells = buildCalCells({
      year: 2026,
      month: 5,
      selectedIso: '',
      availableSet: allJune,
      minIso: '2026-06-15',
    })
    expect(cells.find((cell) => cell.iso === '2026-06-14')!.disabled).toBe(true)
    expect(cells.find((cell) => cell.iso === '2026-06-15')!.disabled).toBe(false)
    expect(cells.find((cell) => cell.iso === '2026-06-16')!.disabled).toBe(false)
  })

  it('produces unique keys for every cell', () => {
    const cells = buildCalCells({
      year: 2026,
      month: 4,
      selectedIso: '',
      availableSet: new Set(),
    })
    expect(new Set(cells.map((cell) => cell.key)).size).toBe(42)
  })
})
