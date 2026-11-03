/**
 * Turns an {@link AircraftPlanform} into outline polygons.
 *
 * Each part becomes its own polygon; they are never merged geometrically.
 * Overlaps are resolved when drawing instead: every polygon is wound the same
 * way, so a non-zero fill paints their union with no gaps, and the outline is
 * drawn as a fat stroke *underneath* the fill so the seams between parts never
 * show (see `renderSilhouetteSvg` in `aircraftSilhouette.ts`).
 */
import type {
  AircraftPlanform,
  DiscSpec,
  EngineSpec,
  FinSpec,
  FuselageSpec,
  LiftingSurfaceSpec,
  PlanformPoint,
  PlanformPolygon,
  RotorSpec,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftPlanform'

/** Points used to draw each curved edge — smooth at icon size, cheap to rasterise. */
const CURVE_SEGMENTS = 10

/** Segments in a full circle (rotodomes, balloons, rotor hubs). */
const CIRCLE_SEGMENTS = 32

/** Thickness of a propeller disc seen edge-on, as a fraction of its diameter. */
const PROPELLER_THICKNESS_RATIO = 0.05

/** Convert degrees to radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Reflect a point across the centreline. */
function mirrorPoint(point: PlanformPoint): PlanformPoint {
  return { x: -point.x, y: point.y }
}

/** Twice the signed area of a polygon (shoelace formula); the sign gives its winding. */
function signedDoubleArea(polygon: PlanformPolygon): number {
  let doubleArea = 0
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index]!
    const next = polygon[(index + 1) % polygon.length]!
    doubleArea += current.x * next.y - next.x * current.y
  }
  return doubleArea
}

/**
 * Wind every polygon the same way.
 *
 * Mirroring a part reverses its winding, and under the non-zero fill rule two
 * overlapping parts wound in opposite directions cancel out and leave a hole
 * (an engine punching through its own wing). One consistent direction makes
 * overlaps simply union.
 */
function withConsistentWinding(polygon: PlanformPolygon): PlanformPolygon {
  return signedDoubleArea(polygon) < 0 ? [...polygon].reverse() : polygon
}

/**
 * Fuselage half-width as a fraction of full, at `progress` (0 at the tip, 1 at
 * full width) along the nose.
 */
function noseWidthFraction(shape: FuselageSpec['noseShape'], progress: number): number {
  const elliptical = Math.sqrt(1 - (1 - progress) ** 2)
  if (shape === 'pointed') return 1 - (1 - progress) ** 2
  if (shape === 'blunt') return 0.55 + 0.45 * elliptical
  return elliptical
}

/** The fuselage outline: a curved nose, a parallel cabin, then a tapering tail cone. */
function fuselagePolygon(fuselage: FuselageSpec): PlanformPolygon {
  const halfWidth = fuselage.width / 2
  const starboardSide: PlanformPoint[] = []

  for (let step = 0; step <= CURVE_SEGMENTS; step++) {
    // Step evenly around a quarter arc rather than evenly along the nose: the
    // curve widens fastest at the tip, and even steps there leave a flat facet
    // across the front of every rounded nose.
    const progress = 1 - Math.cos((step / CURVE_SEGMENTS) * (Math.PI / 2))
    starboardSide.push({
      x: halfWidth * noseWidthFraction(fuselage.noseShape, progress),
      y: progress * fuselage.noseLength,
    })
  }

  const tailConeStart = fuselage.length - fuselage.tailConeLength
  const tailTipHalfWidth = fuselage.tailTipWidth / 2
  for (let step = 0; step <= CURVE_SEGMENTS; step++) {
    const progress = step / CURVE_SEGMENTS
    // Cosine easing: the cone leaves the cabin tangentially rather than with a
    // visible corner, which reads as a fuselage rather than a pencil at 24px.
    const easedTaper = (1 - Math.cos(progress * Math.PI)) / 2
    starboardSide.push({
      x: halfWidth - (halfWidth - tailTipHalfWidth) * easedTaper,
      y: tailConeStart + progress * fuselage.tailConeLength,
    })
  }

  const portSide = starboardSide.map(mirrorPoint).reverse()
  return [...starboardSide, ...portSide]
}

/** A wing, tailplane or canard — both halves as one polygon. */
function liftingSurfacePolygon(surface: LiftingSurfaceSpec): PlanformPolygon {
  const halfSpan = surface.span / 2
  const rootLeadingEdge = surface.rootLeadingEdgeFromNose
  const rootTrailingEdge = rootLeadingEdge + surface.rootChord
  const tipLeadingEdge =
    rootLeadingEdge + Math.tan(toRadians(surface.leadingEdgeSweepDeg)) * halfSpan
  const tipTrailingEdge = tipLeadingEdge + surface.tipChord

  const starboardOuter: PlanformPoint[] = [
    { x: halfSpan, y: tipLeadingEdge },
    { x: halfSpan, y: tipTrailingEdge },
  ]
  if (surface.trailingEdgeKinkFraction !== undefined && surface.trailingEdgeKinkFraction > 0) {
    starboardOuter.push({ x: halfSpan * surface.trailingEdgeKinkFraction, y: rootTrailingEdge })
  }

  return [
    { x: 0, y: rootLeadingEdge },
    ...starboardOuter,
    { x: 0, y: rootTrailingEdge },
    ...starboardOuter.map(mirrorPoint).reverse(),
  ]
}

/** An axis-aligned rectangle centred on (`centreX`, `centreY`). */
function rectanglePolygon(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
): PlanformPolygon {
  const halfWidth = width / 2
  const halfHeight = height / 2
  return [
    { x: centreX - halfWidth, y: centreY - halfHeight },
    { x: centreX + halfWidth, y: centreY - halfHeight },
    { x: centreX + halfWidth, y: centreY + halfHeight },
    { x: centreX - halfWidth, y: centreY + halfHeight },
  ]
}

/** A circle approximated by {@link CIRCLE_SEGMENTS} straight edges. */
function circlePolygon(centreX: number, centreY: number, radius: number): PlanformPolygon {
  const points: PlanformPoint[] = []
  for (let step = 0; step < CIRCLE_SEGMENTS; step++) {
    const angle = (step / CIRCLE_SEGMENTS) * Math.PI * 2
    points.push({ x: centreX + Math.cos(angle) * radius, y: centreY + Math.sin(angle) * radius })
  }
  return points
}

/**
 * A nacelle: a cylinder with rounded ends, seen from above. The ends are
 * semicircles of the nacelle's own radius, so it reads as a pod, not a block.
 */
function nacellePolygon(centreX: number, frontY: number, length: number, diameter: number) {
  const radius = Math.min(diameter / 2, length / 2)
  const frontCentreY = frontY + radius
  const rearCentreY = frontY + length - radius
  const points: PlanformPoint[] = []
  for (let step = 0; step <= CURVE_SEGMENTS; step++) {
    const angle = Math.PI + (step / CURVE_SEGMENTS) * Math.PI
    points.push({
      x: centreX + Math.cos(angle) * radius,
      y: frontCentreY + Math.sin(angle) * radius,
    })
  }
  for (let step = 0; step <= CURVE_SEGMENTS; step++) {
    const angle = (step / CURVE_SEGMENTS) * Math.PI
    points.push({
      x: centreX + Math.cos(angle) * radius,
      y: rearCentreY + Math.sin(angle) * radius,
    })
  }
  return points
}

/** Every polygon for one engine on one side: its nacelle and its propeller, if any. */
function enginePolygonsAt(engine: EngineSpec, centreX: number): PlanformPolygon[] {
  const polygons: PlanformPolygon[] = []
  if (engine.length > 0) {
    polygons.push(nacellePolygon(centreX, engine.fromNose, engine.length, engine.diameter))
  }
  if (engine.propellerDiameter !== undefined) {
    const propellerY = engine.pusher ? engine.fromNose + engine.length : engine.fromNose
    const thickness = Math.max(0.1, engine.propellerDiameter * PROPELLER_THICKNESS_RATIO)
    polygons.push(rectanglePolygon(centreX, propellerY, engine.propellerDiameter, thickness))
  }
  return polygons
}

/** Lateral positions a part occupies: just the centreline, or both sides of it. */
function mirroredOffsets(lateralOffset: number): number[] {
  return lateralOffset === 0 ? [0] : [lateralOffset, -lateralOffset]
}

/** One rotor's blades plus its hub, at one lateral position. */
function rotorPolygonsAt(rotor: RotorSpec, centreX: number, angleOffsetDeg: number) {
  const polygons: PlanformPolygon[] = []
  const radius = rotor.diameter / 2
  const halfChord = rotor.bladeChord / 2
  for (let bladeIndex = 0; bladeIndex < rotor.bladeCount; bladeIndex++) {
    // 0° points at the nose (negative y); angles grow clockwise as seen from above.
    const angle = toRadians(angleOffsetDeg + (bladeIndex * 360) / rotor.bladeCount)
    const alongX = Math.sin(angle)
    const alongY = -Math.cos(angle)
    const acrossX = -alongY
    const acrossY = alongX
    const hubY = rotor.hubFromNose
    polygons.push([
      { x: centreX + acrossX * halfChord, y: hubY + acrossY * halfChord },
      {
        x: centreX + alongX * radius + acrossX * halfChord,
        y: hubY + alongY * radius + acrossY * halfChord,
      },
      {
        x: centreX + alongX * radius - acrossX * halfChord,
        y: hubY + alongY * radius - acrossY * halfChord,
      },
      { x: centreX - acrossX * halfChord, y: hubY - acrossY * halfChord },
    ])
  }
  polygons.push(
    circlePolygon(centreX, rotor.hubFromNose, Math.max(rotor.bladeChord, radius * 0.08)),
  )
  return polygons
}

/**
 * The rotors' polygons. A mirrored pair turns in opposite directions, so the
 * port rotor's blades are reflected rather than copied — it looks right on a
 * tilt-rotor and stops the pair reading as one shape slid sideways.
 */
function rotorPolygons(rotor: RotorSpec): PlanformPolygon[] {
  if (rotor.lateralOffset === 0) return rotorPolygonsAt(rotor, 0, rotor.bladeAngleOffsetDeg)
  return [
    ...rotorPolygonsAt(rotor, rotor.lateralOffset, rotor.bladeAngleOffsetDeg),
    ...rotorPolygonsAt(rotor, -rotor.lateralOffset, -rotor.bladeAngleOffsetDeg),
  ]
}

/** A fin seen from above: a thin strip on each side it appears. */
function finPolygons(fin: FinSpec): PlanformPolygon[] {
  return mirroredOffsets(fin.lateralOffset).map((centreX) =>
    rectanglePolygon(centreX, fin.fromNose + fin.length / 2, fin.thickness, fin.length),
  )
}

/** A disc on the centreline. */
function discPolygon(disc: DiscSpec): PlanformPolygon {
  return circlePolygon(0, disc.centreFromNose, disc.diameter / 2)
}

/**
 * Build every outline polygon for a planform, wound consistently.
 *
 * Draw order matters only for the outline stroke, and that is drawn under the
 * fill, so the order here is just back-to-front for readability.
 *
 * @param planform - The aircraft's measured parts, in metres.
 * @returns One polygon per part, in metres, nose at `y = 0`.
 */
export function planformPolygons(planform: AircraftPlanform): PlanformPolygon[] {
  const polygons: PlanformPolygon[] = []
  if (planform.discs) polygons.push(...planform.discs.map(discPolygon))
  if (planform.tailplane) polygons.push(liftingSurfacePolygon(planform.tailplane))
  if (planform.fins) polygons.push(...planform.fins.flatMap(finPolygons))
  if (planform.wing) polygons.push(liftingSurfacePolygon(planform.wing))
  if (planform.canard) polygons.push(liftingSurfacePolygon(planform.canard))
  if (planform.fuselage) polygons.push(fuselagePolygon(planform.fuselage))
  if (planform.engines) {
    for (const engine of planform.engines) {
      for (const centreX of mirroredOffsets(engine.lateralOffset)) {
        polygons.push(...enginePolygonsAt(engine, centreX))
      }
    }
  }
  if (planform.rotors) polygons.push(...planform.rotors.flatMap(rotorPolygons))
  return polygons.map(withConsistentWinding)
}
