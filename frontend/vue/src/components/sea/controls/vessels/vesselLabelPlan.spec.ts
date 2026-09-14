import { describe, it, expect } from 'vitest'
import {
  estimateLabelWidth,
  planVesselLabels,
  vesselFacesLeft,
  type ScreenPoint,
} from './vesselLabelPlan'
import type { SeaLabelFieldMap, SeaVessel } from '@/stores/sea'

const ALL_OFF: SeaLabelFieldMap = {
  name: false,
  type: false,
  mmsi: false,
  flag: false,
  destination: false,
  speed: false,
  course: false,
}
const NAME_ONLY: SeaLabelFieldMap = { ...ALL_OFF, name: true }

function vessel(overrides: Partial<SeaVessel> = {}): SeaVessel {
  return {
    mmsi: '232000001',
    name: 'ALPHA',
    imo: '',
    callsign: '',
    type: '70',
    typeLabel: 'CARGO',
    family: 'cargo',
    destination: 'DOVER',
    lat: 51,
    lon: 1,
    sog: 10,
    cog: 45,
    heading: null,
    navStatus: 0,
    lastPositionMs: 0,
    lastPositionUtc: '',
    ...overrides,
  }
}

function positions(entries: Array<[SeaVessel, ScreenPoint]>): Map<string, ScreenPoint> {
  return new Map(entries.map(([each, at]) => [each.mmsi, at]))
}

describe('vesselFacesLeft', () => {
  it('uses the heading first, then the course, and reads no bearing as right-facing', () => {
    expect(vesselFacesLeft(vessel({ heading: 90, cog: 270 }))).toBe(true)
    expect(vesselFacesLeft(vessel({ heading: null, cog: 270 }))).toBe(false)
    expect(vesselFacesLeft(vessel({ heading: null, cog: null }))).toBe(false)
  })
})

describe('estimateLabelWidth', () => {
  it('grows with the name and every enabled field that has a value', () => {
    const base = estimateLabelWidth(vessel(), ALL_OFF)
    const named = estimateLabelWidth(vessel(), NAME_ONLY)
    expect(named).toBeGreaterThan(base)
    expect(estimateLabelWidth(vessel({ name: 'A MUCH LONGER NAME' }), NAME_ONLY)).toBeGreaterThan(
      named,
    )
    const everything: SeaLabelFieldMap = {
      name: true,
      type: true,
      mmsi: true,
      flag: false,
      destination: true,
      speed: true,
      course: true,
    }
    expect(estimateLabelWidth(vessel(), everything)).toBeGreaterThan(named)
    // Fields with no value add nothing even when enabled.
    const empty = vessel({ typeLabel: '', destination: '', sog: null, cog: null })
    expect(estimateLabelWidth(empty, everything)).toBe(
      estimateLabelWidth(empty, { ...ALL_OFF, name: true, mmsi: true }),
    )
  })
})

describe('planVesselLabels', () => {
  it('labels every vessel whose pill fits', () => {
    const a = vessel({ mmsi: '1', name: 'A' })
    const b = vessel({ mmsi: '2', name: 'B' })
    const plan = planVesselLabels(
      [b, a],
      positions([
        [a, { x: 0, y: 0 }],
        [b, { x: 500, y: 500 }],
      ]),
      NAME_ONLY,
    )
    // Placed in name order, not arrival order, so the choice is stable.
    expect(plan.labelled.map((each) => each.name)).toEqual(['A', 'B'])
    expect(plan.counts).toEqual([])
  })

  it('collapses colliding vessels into a count, keeping a lone leftover as a pill', () => {
    const a = vessel({ mmsi: '1', name: 'A' })
    const b = vessel({ mmsi: '2', name: 'B' }) // overlaps A, same cell → counted
    const c = vessel({ mmsi: '3', name: 'C' }) // overlaps A, same cell → counted
    const d = vessel({ mmsi: '4', name: 'D' }) // overlaps A but alone in its cell → pill anyway
    const plan = planVesselLabels(
      [a, b, c, d],
      positions([
        [a, { x: 100, y: 100 }],
        [b, { x: 102, y: 103 }],
        [c, { x: 105, y: 101 }],
        [d, { x: 140, y: 100 }],
      ]),
      NAME_ONLY,
    )
    expect(plan.labelled.map((each) => each.name)).toEqual(['A', 'D'])
    expect(plan.counts).toHaveLength(1)
    const [count] = plan.counts
    expect(count!.members.map((each) => each.name)).toEqual(['B', 'C'])
    expect(count!.position).toEqual({ x: 103.5, y: 102 })
    expect(count!.lngLat).toEqual([1, 51])
    expect(count!.key).toBe(`${Math.floor(102 / 32)}:${Math.floor(103 / 32)}`)
  })

  it('always keeps the selected vessel labelled, even when it would collide', () => {
    const a = vessel({ mmsi: '1', name: 'A' })
    const z = vessel({ mmsi: '2', name: 'Z' })
    const plan = planVesselLabels(
      [a, z],
      positions([
        [a, { x: 100, y: 100 }],
        [z, { x: 101, y: 101 }],
      ]),
      NAME_ONLY,
      '2',
    )
    expect(plan.labelled.map((each) => each.name)).toEqual(['Z', 'A'])
  })

  it('accounts for left-facing pills when checking overlap', () => {
    // A left-facing pill extends leftwards, so a vessel just to its left collides.
    const left = vessel({ mmsi: '1', name: 'LEFT', cog: 90, heading: 90 })
    const other = vessel({ mmsi: '2', name: 'OTHER', cog: 0 })
    const plan = planVesselLabels(
      [left, other],
      positions([
        [left, { x: 200, y: 100 }],
        [other, { x: 150, y: 100 }],
      ]),
      NAME_ONLY,
    )
    expect(plan.labelled).toHaveLength(2) // colliding but each alone in its cell
    const apart = planVesselLabels(
      [left, other],
      positions([
        [left, { x: 200, y: 100 }],
        [other, { x: 260, y: 100 }],
      ]),
      NAME_ONLY,
    )
    expect(apart.labelled).toHaveLength(2)
  })

  it('groups everything in a wide view, on a coarser cell, but a lone vessel keeps its pill', () => {
    const a = vessel({ mmsi: '1', name: 'A' })
    const b = vessel({ mmsi: '2', name: 'B' })
    const c = vessel({ mmsi: '3', name: 'C' })
    const plan = planVesselLabels(
      [a, b, c],
      positions([
        [a, { x: 10, y: 10 }],
        [b, { x: 60, y: 60 }], // far enough apart for pills, same 72px cell
        [c, { x: 500, y: 500 }],
      ]),
      NAME_ONLY,
      '',
      { groupAll: true, cellPx: 72 },
    )
    expect(plan.counts).toHaveLength(1)
    expect(plan.counts[0]!.members.map((each) => each.name)).toEqual(['A', 'B'])
    expect(plan.labelled.map((each) => each.name)).toEqual(['C'])
  })

  it('handles an empty view', () => {
    expect(planVesselLabels([], new Map(), NAME_ONLY)).toEqual({
      labelled: [],
      counts: [],
    })
  })
})
