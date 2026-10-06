import { describe, it, expect } from 'vitest'
import {
  CORRECTION_MS,
  deadReckon,
  displayedPosition,
  observedAt,
  reanchor,
  snapshotAgeMs,
  startTracking,
  type TrackedPosition,
} from './aircraftPosition'

/** One nautical mile of latitude, in degrees. */
const NM_LAT = 1 / 60

describe('deadReckon', () => {
  it('moves due north by the distance flown', () => {
    // 360 kt for 10 s = 1 nm.
    const [lon, lat] = deadReckon(-1.5, 54, 0, 360, 10)
    expect(lon).toBeCloseTo(-1.5, 9)
    expect(lat).toBeCloseTo(54 + NM_LAT, 4)
  })

  it('moves due east without changing latitude (to first order)', () => {
    const [lon, lat] = deadReckon(0, 0, 90, 360, 10)
    expect(lon).toBeCloseTo(NM_LAT, 4)
    expect(lat).toBeCloseTo(0, 6)
  })

  it('stays put with no time elapsed', () => {
    expect(deadReckon(-1.5, 54, 45, 450, 0)).toEqual([
      expect.closeTo(-1.5, 9),
      expect.closeTo(54, 9),
    ])
  })
})

describe('snapshotAgeMs', () => {
  it('reads a positive age', () => {
    expect(snapshotAgeMs('3089')).toBe(3089)
  })

  it.each([
    ['a missing header', null],
    ['an empty header', ''],
    ['a malformed header', 'soon'],
    ['a negative age', '-500'],
    ['an infinite age', 'Infinity'],
    ['zero', '0'],
  ])('treats %s as a fresh snapshot', (_label, headerValue) => {
    expect(snapshotAgeMs(headerValue)).toBe(0)
  })
})

describe('observedAt', () => {
  it('subtracts the snapshot age and how long before it the position was heard', () => {
    expect(observedAt(100_000, 3_000, 2.5)).toBe(94_500)
  })

  it('uses the arrival time alone for a fresh snapshot with no seen_pos', () => {
    expect(observedAt(100_000, 0)).toBe(100_000)
  })

  it.each([
    ['negative', -4],
    ['not a number', Number.NaN],
  ])('ignores a seen_pos that is %s', (_label, seenPos) => {
    expect(observedAt(100_000, 1_000, seenPos)).toBe(99_000)
  })
})

describe('startTracking', () => {
  it('records the report at its observation time with no correction', () => {
    expect(startTracking({ lon: -1.5, lat: 54, gs: 400, track: 90 }, 5_000)).toEqual({
      lon: -1.5,
      lat: 54,
      gs: 400,
      track: 90,
      lastSeen: 5_000,
    })
  })

  it('defaults a missing speed to zero and a missing track to none', () => {
    const tracked = startTracking({ lon: -1.5, lat: 54 }, 5_000)
    expect(tracked.gs).toBe(0)
    expect(tracked.track).toBeNull()
  })
})

describe('displayedPosition', () => {
  const eastbound: TrackedPosition = { lon: 0, lat: 0, gs: 360, track: 90, lastSeen: 0 }

  it('dead-reckons from the observation time, not from now', () => {
    // Observed 10 s ago at 360 kt: 1 nm along the track already.
    expect(displayedPosition(eastbound, 10_000)[0]).toBeCloseTo(NM_LAT, 4)
  })

  it('holds an aircraft with no track where it was reported', () => {
    expect(displayedPosition({ ...eastbound, track: null }, 60_000)).toEqual([0, 0])
  })

  it('holds a stationary aircraft where it was reported', () => {
    expect(displayedPosition({ ...eastbound, gs: 0 }, 60_000)).toEqual([0, 0])
  })

  it('never projects backwards for an observation stamped after now', () => {
    expect(displayedPosition({ ...eastbound, lastSeen: 5_000 }, 1_000)).toEqual([
      expect.closeTo(0, 9),
      expect.closeTo(0, 9),
    ])
  })

  describe('with a correction fading out', () => {
    const corrected: TrackedPosition = {
      lon: 10,
      lat: 50,
      gs: 0,
      track: null,
      lastSeen: 0,
      correction: { lon: 0.2, lat: -0.1, startedAt: 1_000 },
    }

    it('starts from where the aircraft was drawn', () => {
      expect(displayedPosition(corrected, 1_000)).toEqual([10.2, 49.9])
    })

    it('is halfway onto the report halfway through', () => {
      const [lon, lat] = displayedPosition(corrected, 1_000 + CORRECTION_MS / 2)
      expect(lon).toBeCloseTo(10.1, 9)
      expect(lat).toBeCloseTo(49.95, 9)
    })

    it('sits exactly on the report once the correction has run out, and stays there', () => {
      expect(displayedPosition(corrected, 1_000 + CORRECTION_MS)).toEqual([10, 50])
      expect(displayedPosition(corrected, 1_000 + 10 * CORRECTION_MS)).toEqual([10, 50])
    })

    it('applies the full correction if the clock reads earlier than its start', () => {
      expect(displayedPosition(corrected, 0)).toEqual([10.2, 49.9])
    })
  })
})

describe('reanchor', () => {
  const held: TrackedPosition = { lon: 0, lat: 0, gs: 0, track: null, lastSeen: 10_000 }

  it('ignores a report no newer than the one held (a cached snapshot served again)', () => {
    expect(reanchor(held, { lon: 5, lat: 5 }, 10_000, 20_000)).toBeNull()
    expect(reanchor(held, { lon: 5, lat: 5 }, 9_000, 20_000)).toBeNull()
  })

  it('anchors on the newer report, dated by its observation', () => {
    const next = reanchor(held, { lon: 0.3, lat: 0.1, gs: 200, track: 45 }, 15_000, 15_000)!
    expect(next).toMatchObject({ lon: 0.3, lat: 0.1, gs: 200, track: 45, lastSeen: 15_000 })
  })

  it('does not jump: the aircraft is drawn where it was, then glides onto the report', () => {
    const now = 15_000
    const before = displayedPosition(held, now)
    const next = reanchor(held, { lon: 0.3, lat: 0.1 }, now, now)!

    expect(displayedPosition(next, now)).toEqual([
      expect.closeTo(before[0], 9),
      expect.closeTo(before[1], 9),
    ])
    expect(displayedPosition(next, now + CORRECTION_MS)).toEqual([0.3, 0.1])
  })

  it('does not jump when the report was observed a while ago and the aircraft has moved on since', () => {
    const now = 25_000
    const before = displayedPosition(held, now)
    // Observed 10 s ago heading north at 360 kt — it is 1 nm past the report by now.
    const next = reanchor(held, { lon: 0, lat: 1, gs: 360, track: 0 }, now - 10_000, now)!
    const [lon, lat] = displayedPosition(next, now)
    expect(lon).toBeCloseTo(before[0], 9)
    expect(lat).toBeCloseTo(before[1], 9)
  })

  it('glides onto where the report puts the aircraft now, not where it was when observed', () => {
    // Observed 10 s ago heading north at 360 kt: by now it is 1 nm further on.
    const now = 25_000
    const next = reanchor(held, { lon: 0, lat: 1, gs: 360, track: 0 }, now - 10_000, now)!
    const [, settledLat] = displayedPosition(next, now + CORRECTION_MS)
    const [, expectedLat] = deadReckon(0, 1, 0, 360, (10_000 + CORRECTION_MS) / 1000)
    expect(settledLat).toBeCloseTo(expectedLat, 9)
  })

  it('carries an unfinished glide into the next one rather than snapping', () => {
    const first = reanchor(held, { lon: 1, lat: 0 }, 11_000, 11_000)!
    // Halfway through the first glide the aircraft is drawn at lon 0.5.
    const midGlide = 11_000 + CORRECTION_MS / 2
    const second = reanchor(first, { lon: 1, lat: 0 }, midGlide, midGlide)!
    expect(displayedPosition(second, midGlide)[0]).toBeCloseTo(0.5, 9)
  })

  it('glides the short way across the antimeridian', () => {
    const nearDateLine: TrackedPosition = { lon: 179.9, lat: 0, gs: 0, track: null, lastSeen: 0 }
    const next = reanchor(nearDateLine, { lon: -179.9, lat: 0 }, 1_000, 1_000)!
    expect(next.correction!.lon).toBeCloseTo(-0.2, 9)
  })

  it('takes the eastward sign for a correction exactly half a world away', () => {
    const next = reanchor(held, { lon: 180, lat: 0 }, 11_000, 11_000)!
    expect(next.correction!.lon).toBe(180)
  })
})
