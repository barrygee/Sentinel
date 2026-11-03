import { describe, expect, it } from 'vitest'
import { planformPolygons } from './planformGeometry'
import { AIRCRAFT_FAMILIES, AIRCRAFT_FAMILY_IDS } from './aircraftFamilies'
import type {
  AircraftPlanform,
  EngineSpec,
  FuselageSpec,
  LiftingSurfaceSpec,
  PlanformPolygon,
  RotorSpec,
} from './aircraftPlanform'

/** Twice the signed area (shoelace); positive is the winding every part must share. */
function signedDoubleArea(polygon: PlanformPolygon): number {
  let doubleArea = 0
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length]!
    doubleArea += current.x * next.y - next.x * current.y
  })
  return doubleArea
}

/** Axis-aligned bounds of a polygon. */
function boundsOf(polygon: PlanformPolygon) {
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

const FUSELAGE: FuselageSpec = {
  length: 30,
  width: 4,
  noseLength: 5,
  tailConeLength: 8,
  tailTipWidth: 1,
  noseShape: 'rounded',
}

const WING: LiftingSurfaceSpec = {
  span: 20,
  rootChord: 6,
  tipChord: 2,
  leadingEdgeSweepDeg: 45,
  rootLeadingEdgeFromNose: 10,
}

const ROTOR: RotorSpec = {
  diameter: 10,
  bladeCount: 4,
  bladeChord: 0.5,
  hubFromNose: 4,
  lateralOffset: 0,
  bladeAngleOffsetDeg: 0,
}

describe('planformPolygons', () => {
  it('returns nothing for a planform with no parts', () => {
    expect(planformPolygons({})).toEqual([])
  })

  it('winds every part of every family the same way, so overlapping parts union', () => {
    for (const familyId of AIRCRAFT_FAMILY_IDS) {
      for (const polygon of planformPolygons(AIRCRAFT_FAMILIES[familyId].planform)) {
        expect(signedDoubleArea(polygon), familyId).toBeGreaterThan(0)
      }
    }
  })

  it('rewinds parts generated the other way round (a nose-pointing rotor blade)', () => {
    const [blade] = planformPolygons({ rotors: [{ ...ROTOR, bladeCount: 1 }] })
    expect(signedDoubleArea(blade!)).toBeGreaterThan(0)
  })

  describe('fuselage', () => {
    it('runs from the nose tip at y = 0 to the tail at its length, at its full width', () => {
      const [fuselage] = planformPolygons({ fuselage: FUSELAGE })
      expect(boundsOf(fuselage!)).toEqual({ minX: -2, maxX: 2, minY: 0, maxY: 30 })
    })

    it('ends in a tail tip of the given width', () => {
      const [fuselage] = planformPolygons({ fuselage: FUSELAGE })
      const tailPoints = fuselage!.filter((point) => point.y === 30)
      expect(tailPoints.map((point) => point.x).sort()).toEqual([-0.5, 0.5])
    })

    it('is mirrored exactly about the centreline', () => {
      const [fuselage] = planformPolygons({ fuselage: FUSELAGE })
      for (const point of fuselage!) {
        expect(
          fuselage!.some(
            (other) => Math.abs(other.x + point.x) < 1e-9 && Math.abs(other.y - point.y) < 1e-9,
          ),
        ).toBe(true)
      }
    })

    it.each([
      ['pointed', 0],
      ['rounded', 0],
      ['blunt', 0.55 * 2],
    ] as const)(
      'starts a %s nose %f m either side of the centreline',
      (noseShape, tipHalfWidth) => {
        const [fuselage] = planformPolygons({ fuselage: { ...FUSELAGE, noseShape } })
        const tipXs = fuselage!.filter((point) => point.y === 0).map((point) => Math.abs(point.x))
        expect(Math.max(...tipXs)).toBeCloseTo(tipHalfWidth)
      },
    )

    it('fills a rounded nose out faster than a pointed one', () => {
      const widthPartWayAlong = (noseShape: FuselageSpec['noseShape']) => {
        const [fuselage] = planformPolygons({ fuselage: { ...FUSELAGE, noseShape } })
        const nearTip = fuselage!.filter((point) => point.y > 0 && point.y < 1.5)
        return Math.max(...nearTip.map((point) => point.x))
      }
      expect(widthPartWayAlong('rounded')).toBeGreaterThan(widthPartWayAlong('pointed'))
    })
  })

  describe('lifting surfaces', () => {
    it('sweeps the tip back by tan(sweep) × half-span and spans the full width', () => {
      const [wing] = planformPolygons({ wing: WING })
      // 45° over a 10 m half-span puts the tip leading edge 10 m behind the root's.
      expect(boundsOf(wing!)).toEqual({ minX: -10, maxX: 10, minY: 10, maxY: 22 })
    })

    it('draws a straight trailing edge with six corners', () => {
      expect(planformPolygons({ wing: WING })[0]).toHaveLength(6)
    })

    it('adds a trailing-edge kink on each side when a kink fraction is given', () => {
      const [wing] = planformPolygons({ wing: { ...WING, trailingEdgeKinkFraction: 0.4 } })
      expect(wing).toHaveLength(8)
      // The kink sits on the root's trailing edge line, 40% of the way out.
      const kinkPoints = wing!.filter((point) => point.y === 16 && point.x !== 0)
      expect(kinkPoints.map((point) => point.x).sort((a, b) => a - b)).toEqual([-4, 4])
    })

    it('ignores a kink fraction of zero', () => {
      const [wing] = planformPolygons({ wing: { ...WING, trailingEdgeKinkFraction: 0 } })
      expect(wing).toHaveLength(6)
    })

    it('draws a tailplane and a canard the same way as a wing', () => {
      const polygons = planformPolygons({ tailplane: WING, canard: WING })
      expect(polygons).toHaveLength(2)
      expect(boundsOf(polygons[0]!)).toEqual(boundsOf(polygons[1]!))
    })
  })

  describe('engines', () => {
    const PYLON_ENGINE: EngineSpec = { lateralOffset: 5, fromNose: 10, length: 4, diameter: 2 }

    it('mirrors an off-centre engine to both sides', () => {
      const polygons = planformPolygons({ engines: [PYLON_ENGINE] })
      expect(polygons.map((polygon) => boundsOf(polygon))).toEqual([
        { minX: 4, maxX: 6, minY: 10, maxY: 14 },
        { minX: -6, maxX: -4, minY: 10, maxY: 14 },
      ])
    })

    it('draws a centreline engine once', () => {
      expect(planformPolygons({ engines: [{ ...PYLON_ENGINE, lateralOffset: 0 }] })).toHaveLength(1)
    })

    it('rounds a nacelle shorter than it is wide into a disc of its length', () => {
      const [nacelle] = planformPolygons({
        engines: [{ lateralOffset: 0, fromNose: 0, length: 1, diameter: 3 }],
      })
      const bounds = boundsOf(nacelle!)
      expect(bounds.maxX - bounds.minX).toBeCloseTo(1)
      expect(bounds.maxY - bounds.minY).toBeCloseTo(1)
    })

    it('puts a tractor propeller across the front of the nacelle', () => {
      const [, propeller] = planformPolygons({
        engines: [{ ...PYLON_ENGINE, lateralOffset: 0, propellerDiameter: 3 }],
      })
      const bounds = boundsOf(propeller!)
      expect(bounds.maxX - bounds.minX).toBeCloseTo(3)
      expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(10)
      // Thickness is 5% of the diameter.
      expect(bounds.maxY - bounds.minY).toBeCloseTo(0.15)
    })

    it('puts a pusher propeller across the back of the nacelle', () => {
      const [, propeller] = planformPolygons({
        engines: [{ ...PYLON_ENGINE, lateralOffset: 0, propellerDiameter: 3, pusher: true }],
      })
      const bounds = boundsOf(propeller!)
      expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(14)
    })

    it('keeps a tiny propeller at least 0.1 m thick so it still draws', () => {
      const [, propeller] = planformPolygons({
        engines: [{ ...PYLON_ENGINE, lateralOffset: 0, propellerDiameter: 0.5 }],
      })
      const bounds = boundsOf(propeller!)
      expect(bounds.maxY - bounds.minY).toBeCloseTo(0.1)
    })

    it('draws only the propeller for an engine with no nacelle', () => {
      const polygons = planformPolygons({
        engines: [{ lateralOffset: 0, fromNose: 0, length: 0, diameter: 0, propellerDiameter: 2 }],
      })
      expect(polygons).toHaveLength(1)
      expect(polygons[0]).toHaveLength(4)
    })
  })

  describe('rotors', () => {
    it('draws one polygon per blade plus the hub', () => {
      expect(planformPolygons({ rotors: [ROTOR] })).toHaveLength(5)
    })

    it('points blade one at the nose, reaching the rotor radius ahead of the hub', () => {
      const [firstBlade] = planformPolygons({ rotors: [{ ...ROTOR, bladeCount: 1 }] })
      const bounds = boundsOf(firstBlade!)
      expect(bounds.minY).toBeCloseTo(4 - 5)
      expect(bounds.maxY).toBeCloseTo(4)
      expect(bounds.maxX - bounds.minX).toBeCloseTo(0.5)
    })

    it('sizes the hub by the blade chord, or 8% of the radius when that is larger', () => {
      const hubRadius = (bladeChord: number) => {
        const polygons = planformPolygons({ rotors: [{ ...ROTOR, bladeCount: 1, bladeChord }] })
        const bounds = boundsOf(polygons.at(-1)!)
        return (bounds.maxX - bounds.minX) / 2
      }
      expect(hubRadius(1)).toBeCloseTo(1)
      expect(hubRadius(0.1)).toBeCloseTo(0.4)
    })

    it('reflects the port rotor of a pair, so the two turn in opposite directions', () => {
      const polygons = planformPolygons({
        rotors: [{ ...ROTOR, bladeCount: 1, lateralOffset: 6, bladeAngleOffsetDeg: 30 }],
      })
      // Blade, hub, blade, hub.
      expect(polygons).toHaveLength(4)
      const starboardBlade = boundsOf(polygons[0]!)
      const portBlade = boundsOf(polygons[2]!)
      expect(portBlade.minX).toBeCloseTo(-starboardBlade.maxX)
      expect(portBlade.maxX).toBeCloseTo(-starboardBlade.minX)
      expect(portBlade.minY).toBeCloseTo(starboardBlade.minY)
    })
  })

  describe('fins and discs', () => {
    it('draws a centreline fin once and an off-centre fin on both sides', () => {
      const fin = { lateralOffset: 0, fromNose: 20, length: 4, thickness: 0.4 }
      expect(planformPolygons({ fins: [fin] }).map(boundsOf)).toEqual([
        { minX: -0.2, maxX: 0.2, minY: 20, maxY: 24 },
      ])
      expect(planformPolygons({ fins: [{ ...fin, lateralOffset: 2 }] })).toHaveLength(2)
    })

    it('draws a disc as a 32-sided circle on the centreline', () => {
      const [disc] = planformPolygons({ discs: [{ diameter: 6, centreFromNose: 10 }] })
      expect(disc).toHaveLength(32)
      const bounds = boundsOf(disc!)
      expect(bounds.minX).toBeCloseTo(-3)
      expect(bounds.maxX).toBeCloseTo(3)
      expect(bounds.minY).toBeCloseTo(7)
      expect(bounds.maxY).toBeCloseTo(13)
    })
  })

  it('draws every part of a full planform, back to front', () => {
    const planform: AircraftPlanform = {
      discs: [{ diameter: 2, centreFromNose: 1 }],
      tailplane: WING,
      fins: [{ lateralOffset: 0, fromNose: 20, length: 4, thickness: 0.4 }],
      wing: WING,
      canard: WING,
      fuselage: FUSELAGE,
      engines: [{ lateralOffset: 0, fromNose: 10, length: 4, diameter: 2 }],
      rotors: [{ ...ROTOR, bladeCount: 2 }],
    }
    // disc, tailplane, fin, wing, canard, fuselage, nacelle, 2 blades + hub.
    const polygons = planformPolygons(planform)
    expect(polygons).toHaveLength(10)
    expect(polygons[0]).toHaveLength(32)
    expect(boundsOf(polygons[5]!)).toEqual({ minX: -2, maxX: 2, minY: 0, maxY: 30 })
  })
})
