/**
 * The globe's camera: a hand-written orbit (as on the sentinel-site globe, not
 * three's OrbitControls). The camera always looks at the globe's centre from
 * `view = {lat, lon, distance}`, which eases toward `goal` every frame; input
 * only ever moves `goal`. The globe turns slowly on its own until the viewer
 * takes control, and not at all with reduced motion.
 */
import type { PerspectiveCamera } from 'three'
import { DEGREES_TO_RADIANS, GLOBE_RADIUS, latLonToVector, type LatLon } from './geo'

/** Where the camera sits: over `lat`/`lon`, `distance` from the globe's centre. */
export interface CameraView extends LatLon {
  distance: number
}

/** Closest the camera may come (scene units from the centre; the globe's radius is 100). */
export const MIN_DISTANCE = 122
/**
 * Furthest the camera may go. Further than the site globe's 620, so a phone's
 * fitted start view (about 800 at 390 px wide) shows the whole globe.
 */
export const MAX_DISTANCE = 1000
/** Latitude limits, so the camera never flips over a pole. */
const MIN_LAT = -70
const MAX_LAT = 80
/** One zoom-button step (each press moves 25% closer, or back). */
export const ZOOM_STEP = 0.75
/** The auto-spin's speed in degrees of longitude per second, at full zoom-out. */
const SPIN_DEGREES_PER_SECOND = 0.8
/** The spin only runs further out than this. */
const SPIN_MIN_DISTANCE = 200

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** `target` moved by whole turns to within 180° of `current` (the short way round). */
function nearestLongitude(target: number, current: number): number {
  return current + ((((target - current) % 360) + 540) % 360) - 180
}

/**
 * The camera distance at which the whole globe fills `fillFraction` of the
 * smaller side of the view.
 */
export function fitDistance(
  width: number,
  height: number,
  verticalFovDegrees: number,
  fillFraction = 0.9,
): number {
  const halfFovTangent = Math.tan((verticalFovDegrees * DEGREES_TO_RADIANS) / 2)
  const tangent = fillFraction * Math.min(1, width / Math.max(1, height)) * halfFovTangent
  return clamp(GLOBE_RADIUS / Math.sin(Math.atan(tangent)), MIN_DISTANCE, MAX_DISTANCE)
}

/** Drives one PerspectiveCamera round the globe. */
export class CameraController {
  readonly view: CameraView
  readonly goal: CameraView
  private home: CameraView
  /** Eases 1 → 0 while the pointer rests on the globe, so the spin slows gently instead of stopping dead. */
  private spinStrength = 1
  private spinning: boolean
  /** Set by the first pan, zoom or drag. */
  private viewerMoved = false
  /** True while a drag or pinch is under way (no spin, and touch drags follow the finger closely). */
  dragging = false
  /** True while the pointer is over the globe. */
  hovering = false

  constructor(
    private readonly camera: PerspectiveCamera,
    home: CameraView,
    private readonly reducedMotion: boolean,
  ) {
    this.home = { ...home }
    this.view = { ...home }
    this.goal = { ...home }
    this.spinning = !reducedMotion
  }

  /**
   * Moves the home view (the start view and what {@link goHome} returns to).
   * The camera follows unless the viewer has already moved it.
   */
  setHome(home: CameraView): void {
    const locationMoved = home.lat !== this.home.lat || home.lon !== this.home.lon
    this.home = { ...home }
    if (this.viewerMoved) return
    this.goal.lat = home.lat
    this.goal.distance = home.distance
    // Only a new location re-centres; a resize leaves the spin's longitude alone.
    if (locationMoved) this.goal.lon = nearestLongitude(home.lon, this.view.lon)
  }

  /** Snaps the view to its goal with no glide (the first layout, so the globe doesn't zoom in on open). */
  jumpToGoal(): void {
    Object.assign(this.view, this.goal)
  }

  /** Back to the home view. */
  goHome(): void {
    Object.assign(this.goal, this.home, { lon: nearestLongitude(this.home.lon, this.view.lon) })
  }

  /** The viewer has taken control: the auto-spin stops for good, and the home view no longer moves the camera. */
  stopSpin(): void {
    this.spinning = false
    this.viewerMoved = true
  }

  /**
   * Zooms by a factor of the distance (< 1 moves in).
   *
   * @param towards the point under the cursor: zooming in drifts the view
   *   toward it, so the spot under the pointer stays (roughly) put.
   */
  zoomBy(factor: number, towards?: LatLon | null): void {
    const previous = this.goal.distance
    this.goal.distance = clamp(previous * factor, MIN_DISTANCE, MAX_DISTANCE)
    this.stopSpin()
    if (towards && factor < 1) {
      const share = 1 - this.goal.distance / previous
      this.goal.lat = clamp(this.goal.lat + (towards.lat - this.goal.lat) * share, MIN_LAT, MAX_LAT)
      this.goal.lon += (nearestLongitude(towards.lon, this.goal.lon) - this.goal.lon) * share
    }
  }

  /** Turns the globe by whole degrees (keyboard panning). Scaled so a step feels the same at any zoom. */
  panBy(latDegrees: number, lonDegrees: number): void {
    const scale = (this.goal.distance - GLOBE_RADIUS) / 125
    this.goal.lat = clamp(this.goal.lat + latDegrees * scale, MIN_LAT, MAX_LAT)
    this.goal.lon += lonDegrees * scale
    this.stopSpin()
  }

  /** Sets the goal straight from a drag that started at `start`. */
  dragTo(start: LatLon, deltaX: number, deltaY: number, isTouch: boolean): void {
    // Degrees per pixel, scaled with the zoom; touch drags move further per pixel.
    const degreesPerPixel = ((0.18 * this.view.distance) / 390) * (isTouch ? 2.2 : 1)
    this.goal.lon = start.lon - deltaX * degreesPerPixel
    this.goal.lat = clamp(start.lat + deltaY * degreesPerPixel, MIN_LAT, MAX_LAT)
    if (isTouch) {
      // Follow the finger closely: half the remaining way at once.
      this.view.lon += (this.goal.lon - this.view.lon) * 0.5
      this.view.lat += (this.goal.lat - this.view.lat) * 0.5
    }
  }

  /** Glides the camera to look straight down on a point. */
  flyTo(target: LatLon, distance?: number): void {
    this.goal.lat = clamp(target.lat, MIN_LAT, MAX_LAT)
    this.goal.lon = nearestLongitude(target.lon, this.view.lon)
    if (distance !== undefined) this.goal.distance = clamp(distance, MIN_DISTANCE, MAX_DISTANCE)
    this.stopSpin()
  }

  /** True once the view has (nearly) reached its goal, so expensive redraws can run. */
  isSettled(): boolean {
    return (
      Math.abs(this.view.distance - this.goal.distance) <= this.view.distance * 0.03 &&
      Math.abs(this.view.lat - this.goal.lat) <= 3 &&
      Math.abs(this.view.lon - this.goal.lon) <= 3
    )
  }

  /**
   * Advances the view one frame toward the goal and places the camera.
   *
   * @param deltaSeconds time since the last frame (capped by the caller).
   * @param narrow true on narrow screens, where the camera eases a little faster.
   */
  update(deltaSeconds: number, narrow: boolean): void {
    const frames = deltaSeconds * 60
    this.spinStrength +=
      ((this.hovering ? 0 : 1) - this.spinStrength) * (1 - Math.pow(0.985, frames))
    if (this.spinning && !this.dragging && this.view.distance > SPIN_MIN_DISTANCE) {
      // Slower when closer in, so the ground never races past.
      const closeness = Math.min(1, (this.view.distance - GLOBE_RADIUS) / 125)
      this.goal.lon += deltaSeconds * SPIN_DEGREES_PER_SECOND * this.spinStrength * closeness
    }

    // Keep longitudes bounded without a visible jump: shift view and goal together.
    if (this.view.lon > 180 || this.view.lon < -180) {
      const shift = this.view.lon > 180 ? -360 : 360
      this.view.lon += shift
      this.goal.lon += shift
    }

    if (this.reducedMotion) {
      Object.assign(this.view, this.goal)
    } else {
      const easing = 1 - Math.pow(1 - (narrow ? 0.14 : 0.08), frames)
      this.view.lat += (this.goal.lat - this.view.lat) * easing
      this.view.lon += (this.goal.lon - this.view.lon) * easing
      this.view.distance += (this.goal.distance - this.view.distance) * easing
    }

    latLonToVector(
      this.view.lat,
      this.view.lon,
      this.view.distance - GLOBE_RADIUS,
      this.camera.position,
    )
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld()
  }
}
