import { describe, it, expect } from 'vitest'
import {
  passKey,
  passSecondary,
  isInProgress,
  aosText,
  accPassIsNow,
  findAutoTuneConflicts,
  type SatPass,
  type AccPass,
} from './spacePassesUtils'

// Build a SatPass with sensible defaults so each test overrides only the fields
// it cares about. AOS/LOS default to a window one hour wide starting "now".
function makePass(overrides: Partial<SatPass> = {}): SatPass {
  const aos = 1_000_000_000_000
  return {
    norad_id: '25544',
    name: 'ISS (ZARYA)',
    category: 'space_station',
    aos_utc: new Date(aos).toISOString(),
    los_utc: new Date(aos + 600_000).toISOString(),
    aos_unix_ms: aos,
    los_unix_ms: aos + 600_000,
    duration_s: 600,
    max_elevation_deg: 45,
    max_el_utc: new Date(aos + 300_000).toISOString(),
    ...overrides,
  }
}

describe('passKey', () => {
  it('combines the norad id and AOS timestamp', () => {
    expect(passKey(makePass({ norad_id: '12345', aos_unix_ms: 999 }))).toBe('12345_999')
  })

  it('distinguishes two passes of the same satellite by AOS', () => {
    const first = passKey(makePass({ aos_unix_ms: 1 }))
    const second = passKey(makePass({ aos_unix_ms: 2 }))
    expect(first).not.toBe(second)
  })
})

describe('passSecondary', () => {
  it('maps a known category to its short label and includes the NORAD id', () => {
    expect(passSecondary(makePass({ category: 'space_station', norad_id: '25544' }))).toBe(
      'STATION · NORAD 25544',
    )
  })

  it('uppercases an unknown category that has no short label', () => {
    expect(passSecondary(makePass({ category: 'exotic', norad_id: '7' }))).toBe('EXOTIC · NORAD 7')
  })

  it('omits the category segment when the category is null', () => {
    expect(passSecondary(makePass({ category: null, norad_id: '7' }))).toBe('NORAD 7')
  })

  it('omits the category segment when the category is an empty string', () => {
    expect(passSecondary(makePass({ category: '', norad_id: '7' }))).toBe('NORAD 7')
  })
})

describe('isInProgress', () => {
  const pass = makePass({ aos_unix_ms: 100, los_unix_ms: 200 })

  it('is true at the exact AOS boundary', () => {
    expect(isInProgress(pass, 100)).toBe(true)
  })

  it('is true at the exact LOS boundary', () => {
    expect(isInProgress(pass, 200)).toBe(true)
  })

  it('is true mid-pass', () => {
    expect(isInProgress(pass, 150)).toBe(true)
  })

  it('is false before AOS', () => {
    expect(isInProgress(pass, 99)).toBe(false)
  })

  it('is false after LOS', () => {
    expect(isInProgress(pass, 201)).toBe(false)
  })

  it('defaults nowMs to the current time', () => {
    const live = makePass({ aos_unix_ms: Date.now() - 1000, los_unix_ms: Date.now() + 1000 })
    expect(isInProgress(live)).toBe(true)
  })
})

describe('aosText', () => {
  it('reports IN PROGRESS while the pass is overhead', () => {
    const pass = makePass({ aos_unix_ms: 100, los_unix_ms: 200 })
    expect(aosText(pass, 150)).toBe('IN PROGRESS')
  })

  it('uses the countdown format when AOS is under an hour away', () => {
    const now = 1_000_000_000_000
    const pass = makePass({ aos_unix_ms: now + 90_000, los_unix_ms: now + 600_000 })
    // 90s = 1m 30s
    expect(aosText(pass, now)).toBe('IN 1m 30s')
  })

  it('uses a clock time when AOS is an hour or more away', () => {
    const now = 1_000_000_000_000
    const aos = now + 3_600_000
    const pass = makePass({ aos_unix_ms: aos, los_unix_ms: aos + 600_000 })
    const expected = new Date(aos).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    expect(aosText(pass, now)).toBe(expected)
  })

  it('defaults nowMs to the current time', () => {
    const pass = makePass({ aos_unix_ms: Date.now() - 1000, los_unix_ms: Date.now() + 1000 })
    expect(aosText(pass)).toBe('IN PROGRESS')
  })
})

describe('accPassIsNow', () => {
  const accPass: AccPass = {
    aos_utc: '',
    los_utc: '',
    aos_unix_ms: 100,
    los_unix_ms: 200,
    duration_s: 100,
    max_elevation_deg: 30,
    max_el_utc: '',
  }

  it('is true within the window (inclusive of both boundaries)', () => {
    expect(accPassIsNow(accPass, 100)).toBe(true)
    expect(accPassIsNow(accPass, 150)).toBe(true)
    expect(accPassIsNow(accPass, 200)).toBe(true)
  })

  it('is false outside the window', () => {
    expect(accPassIsNow(accPass, 99)).toBe(false)
    expect(accPassIsNow(accPass, 201)).toBe(false)
  })
})

describe('findAutoTuneConflicts', () => {
  const now = 1_000_000_000_000
  const armed = (ids: string[]) => (noradId: string) => ids.includes(noradId)

  it('returns no conflicts when the candidate has no future passes', () => {
    const passes = [makePass({ norad_id: 'A', aos_unix_ms: now - 2000, los_unix_ms: now - 1000 })]
    expect(findAutoTuneConflicts('A', passes, armed(['B']), now)).toEqual([])
  })

  it('flags an armed satellite whose pass overlaps the candidate', () => {
    const passes = [
      makePass({ norad_id: 'A', name: 'Sat A', aos_unix_ms: now + 1000, los_unix_ms: now + 5000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 3000, los_unix_ms: now + 7000 }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B']), now)
    expect(conflicts).toEqual([
      { noradId: 'B', name: 'Sat B', aosMs: now + 3000, losMs: now + 7000 },
    ])
  })

  it('ignores satellites that are not armed', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 5000 }),
      makePass({ norad_id: 'B', aos_unix_ms: now + 3000, los_unix_ms: now + 7000 }),
    ]
    expect(findAutoTuneConflicts('A', passes, armed([]), now)).toEqual([])
  })

  it('ignores armed passes that do not time-overlap the candidate', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 2000 }),
      makePass({ norad_id: 'B', aos_unix_ms: now + 3000, los_unix_ms: now + 4000 }),
    ]
    expect(findAutoTuneConflicts('A', passes, armed(['B']), now)).toEqual([])
  })

  it('skips the candidate satellite when scanning others (no self-conflict)', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 5000 }),
      makePass({ norad_id: 'A', aos_unix_ms: now + 2000, los_unix_ms: now + 6000 }),
    ]
    expect(findAutoTuneConflicts('A', passes, armed(['A']), now)).toEqual([])
  })

  it('ignores an armed pass that has already ended', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 5000 }),
      makePass({ norad_id: 'B', aos_unix_ms: now - 5000, los_unix_ms: now - 1000 }),
    ]
    expect(findAutoTuneConflicts('A', passes, armed(['B']), now)).toEqual([])
  })

  it('keeps only the earliest overlapping window per conflicting satellite', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 9000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 5000, los_unix_ms: now + 8000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 2000, los_unix_ms: now + 4000 }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B']), now)
    expect(conflicts).toEqual([
      { noradId: 'B', name: 'Sat B', aosMs: now + 2000, losMs: now + 4000 },
    ])
  })

  it('keeps the earliest window when the earlier overlapping pass is seen first', () => {
    // Earlier B pass listed first, a later overlapping B pass second: the second
    // must be discarded because its AOS is not earlier than the recorded one.
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 9000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 2000, los_unix_ms: now + 4000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 5000, los_unix_ms: now + 8000 }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B']), now)
    expect(conflicts).toEqual([
      { noradId: 'B', name: 'Sat B', aosMs: now + 2000, losMs: now + 4000 },
    ])
  })

  it('sorts multiple conflicting satellites by AOS', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 9000 }),
      makePass({ norad_id: 'C', name: 'Sat C', aos_unix_ms: now + 6000, los_unix_ms: now + 7000 }),
      makePass({ norad_id: 'B', name: 'Sat B', aos_unix_ms: now + 2000, los_unix_ms: now + 3000 }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B', 'C']), now)
    expect(conflicts.map((conflict) => conflict.noradId)).toEqual(['B', 'C'])
  })

  it('falls back to the norad id when the conflicting pass has no name', () => {
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now + 1000, los_unix_ms: now + 5000 }),
      makePass({ norad_id: 'B', name: '', aos_unix_ms: now + 2000, los_unix_ms: now + 4000 }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B']), now)
    expect(conflicts[0]!.name).toBe('B')
  })

  it('considers only the candidate passes whose LOS is in the future', () => {
    // The candidate has an expired pass and a future one; an armed sat overlaps
    // only the expired window, so there must be no conflict.
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: now - 5000, los_unix_ms: now - 1000 }),
      makePass({ norad_id: 'A', aos_unix_ms: now + 10000, los_unix_ms: now + 15000 }),
      makePass({ norad_id: 'B', aos_unix_ms: now - 4000, los_unix_ms: now - 2000 }),
    ]
    expect(findAutoTuneConflicts('A', passes, armed(['B']), now)).toEqual([])
  })

  it('defaults nowMs to the current time', () => {
    const liveNow = Date.now()
    const passes = [
      makePass({ norad_id: 'A', aos_unix_ms: liveNow + 1000, los_unix_ms: liveNow + 5000 }),
      makePass({
        norad_id: 'B',
        name: 'Sat B',
        aos_unix_ms: liveNow + 2000,
        los_unix_ms: liveNow + 4000,
      }),
    ]
    const conflicts = findAutoTuneConflicts('A', passes, armed(['B']))
    expect(conflicts).toHaveLength(1)
  })
})
