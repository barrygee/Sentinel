import { describe, expect, it } from 'vitest'
import { AIRCRAFT_FAMILIES, type AircraftFamilyId } from './aircraftFamilies'
import type { LiftingSurfaceSpec } from './aircraftPlanform'
import { AIRCRAFT_TYPE_DIMENSIONS } from './aircraftTypeDimensions'
import { planformPolygons } from './planformGeometry'
import { resolveAircraftShape } from './resolveAircraftShape'
import { silhouetteForShape } from './silhouetteImage'

/** How far back a surface's trailing edge sits at its tip, in metres from the nose. */
function tipTrailingEdgeFromNose(surface: LiftingSurfaceSpec): number {
  const halfSpan = surface.span / 2
  const tipLeadingEdge =
    surface.rootLeadingEdgeFromNose +
    halfSpan * Math.tan((surface.leadingEdgeSweepDeg * Math.PI) / 180)
  return tipLeadingEdge + surface.tipChord
}

function rootTrailingEdgeFromNose(surface: LiftingSurfaceSpec): number {
  return surface.rootLeadingEdgeFromNose + surface.rootChord
}

function requiredSurface(surface: LiftingSurfaceSpec | undefined): LiftingSurfaceSpec {
  if (surface === undefined) throw new Error('family has no such surface')
  return surface
}

describe.each<[string, AircraftFamilyId]>([
  ['HAWK', 'hawkTrainer'],
  ['F35', 'f35Lightning'],
])('%s has its own drawing', (designator, familyId) => {
  const family = AIRCRAFT_FAMILIES[familyId]

  it('resolves to its own family rather than a generic fighter', () => {
    expect(resolveAircraftShape(designator, 'A6')?.familyId).toBe(familyId)
  })

  it('is drawn at the size in the type table, so it is not stretched', () => {
    const typeEntry = AIRCRAFT_TYPE_DIMENSIONS[designator]
    expect(family.referenceLength).toBe(typeEntry?.length)
    expect(family.referenceSpan).toBe(typeEntry?.span)
  })

  it('keeps every part inside its stated length and span', () => {
    const points = planformPolygons(family.planform).flat()
    expect(Math.max(...points.map((point) => point.y))).toBeLessThanOrEqual(family.referenceLength)
    expect(Math.max(...points.map((point) => Math.abs(point.x)))).toBeLessThanOrEqual(
      family.referenceSpan / 2,
    )
  })

  it('renders differently from the generic fighter it used to borrow', () => {
    const drawing = silhouetteForShape(`type:${designator}`)
    const genericFighter = silhouetteForShape('type:F16')
    expect(drawing).not.toBeNull()
    expect(drawing).not.toEqual(genericFighter)
  })
})

describe('what tells these two apart at icon size', () => {
  const hawk = AIRCRAFT_FAMILIES.hawkTrainer.planform
  const f35 = AIRCRAFT_FAMILIES.f35Lightning.planform
  const f16 = AIRCRAFT_FAMILIES.fighterSingleFin.planform

  it('gives the Hawk a less swept, narrower-chord wing than a fighter', () => {
    const hawkWing = requiredSurface(hawk.wing)
    const fighterWing = requiredSurface(f16.wing)
    expect(hawkWing.leadingEdgeSweepDeg).toBeLessThan(fighterWing.leadingEdgeSweepDeg)
    expect(hawkWing.rootChord).toBeLessThan(fighterWing.rootChord)
  })

  it('sweeps the F-35 wing’s trailing edge forward, towards the tip', () => {
    const wing = requiredSurface(f35.wing)
    expect(tipTrailingEdgeFromNose(wing)).toBeLessThan(rootTrailingEdgeFromNose(wing))
  })

  it('leaves a notch between the F-35’s wing and tailplane at the tip', () => {
    const wing = requiredSurface(f35.wing)
    const tailplane = requiredSurface(f35.tailplane)
    expect(tailplane.rootLeadingEdgeFromNose).toBeGreaterThan(tipTrailingEdgeFromNose(wing))
  })

  it('widens the F-35 past its forebody with the intake shoulders', () => {
    const shoulder = f35.engines?.[0]
    const fuselageWidth = f35.fuselage?.width ?? 0
    expect(shoulder).toBeDefined()
    expect((shoulder?.lateralOffset ?? 0) + (shoulder?.diameter ?? 0) / 2).toBeGreaterThan(
      fuselageWidth / 2,
    )
  })
})
