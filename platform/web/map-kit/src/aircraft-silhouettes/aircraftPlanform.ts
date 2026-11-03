/**
 * The vocabulary for describing an aircraft as seen from directly above.
 *
 * A planform is a handful of measured parts — fuselage, wing, tailplane,
 * engines, rotors — each given in metres from the nose and the centreline.
 * `planformGeometry.ts` turns one into outline polygons; `aircraftFamilies.ts`
 * holds the measured planform of one reference aircraft per family.
 *
 * Coordinates: `x` runs to starboard (right when viewed from above with the
 * nose up), `y` runs from the nose (`y = 0`) towards the tail. Anything with a
 * non-zero lateral offset is mirrored to the other side, so specs describe the
 * starboard half only.
 *
 * Every outline Sentinel draws is generated from these published dimensions.
 * None is traced or derived from another tracker's artwork, which is what keeps
 * the set free of third-party licence terms.
 */

/** A point in planform space, in metres. */
export interface PlanformPoint {
  x: number
  y: number
}

/** A closed outline, in metres. The last point joins back to the first. */
export type PlanformPolygon = readonly PlanformPoint[]

/**
 * How the nose widens from its tip to full fuselage width.
 *
 * - `pointed` — parabolic taper to a sharp tip (fighters, business jets).
 * - `rounded` — elliptical, a blunt but curved tip (airliners, helicopters).
 * - `blunt` — starts already broad (piston singles, cargo noses).
 */
export type NoseShape = 'pointed' | 'rounded' | 'blunt'

/** The fuselage, or the hull of an airship. */
export interface FuselageSpec {
  /** Nose to tail, in metres. */
  length: number
  /** Widest point, in metres. */
  width: number
  /** Distance from the tip over which the nose reaches full width. */
  noseLength: number
  /** Distance before the tail over which the fuselage tapers. */
  tailConeLength: number
  /** Width left at the very tail — wide for twin nozzles or cargo ramps. */
  tailTipWidth: number
  noseShape: NoseShape
}

/**
 * Any flat lifting surface seen from above: wing, tailplane or canard.
 *
 * Described as a trapezoid per side, from the centreline root to the tip.
 */
export interface LiftingSurfaceSpec {
  /** Tip to tip, in metres. */
  span: number
  /** Chord at the centreline, in metres. */
  rootChord: number
  /** Chord at the tip, in metres. */
  tipChord: number
  /** Leading-edge sweep in degrees; negative sweeps forward. */
  leadingEdgeSweepDeg: number
  /** Distance from the nose to the root leading edge. */
  rootLeadingEdgeFromNose: number
  /**
   * Fraction of each half-span over which the trailing edge runs straight out
   * from the fuselage before sweeping to the tip — the inboard "kink" that
   * gives airliner wings their shape. Omit for a plain trapezoid.
   */
  trailingEdgeKinkFraction?: number
}

/** An engine nacelle, optionally with a propeller disc seen edge-on. */
export interface EngineSpec {
  /** Distance from the centreline; 0 places a single engine on it. */
  lateralOffset: number
  /** Distance from the nose to the front of the nacelle. */
  fromNose: number
  /** Nacelle length; 0 for an engine buried in the fuselage nose. */
  length: number
  /** Nacelle diameter. */
  diameter: number
  /** Propeller diameter, drawn as a bar across the nacelle. Omit for jets. */
  propellerDiameter?: number
  /** Whether the propeller is at the back of the nacelle (a pusher). */
  pusher?: boolean
}

/** A rotor, drawn as its blades frozen at a fixed angle. */
export interface RotorSpec {
  diameter: number
  bladeCount: number
  /**
   * Blade width, in metres. Deliberately wider than the real blade: a true
   * 0.5 m chord on a 14 m rotor is a hairline at icon size and vanishes.
   */
  bladeChord: number
  /** Distance from the nose to the rotor hub. */
  hubFromNose: number
  /** Distance from the centreline; non-zero rotors are mirrored. */
  lateralOffset: number
  /** Rotation of the first blade from straight ahead, in degrees. */
  bladeAngleOffsetDeg: number
}

/**
 * A slim vertical surface that shows from above as a thin strip — twin fins,
 * or a tail rotor seen edge-on.
 */
export interface FinSpec {
  lateralOffset: number
  fromNose: number
  length: number
  thickness: number
}

/** A circular disc seen from above — an AWACS rotodome or a balloon envelope. */
export interface DiscSpec {
  diameter: number
  centreFromNose: number
}

/** Everything that makes up one aircraft's top-down outline. */
export interface AircraftPlanform {
  fuselage?: FuselageSpec
  wing?: LiftingSurfaceSpec
  tailplane?: LiftingSurfaceSpec
  canard?: LiftingSurfaceSpec
  engines?: readonly EngineSpec[]
  rotors?: readonly RotorSpec[]
  fins?: readonly FinSpec[]
  discs?: readonly DiscSpec[]
}
