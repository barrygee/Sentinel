/**
 * Screen projection and picking: where a scene point lands on the canvas,
 * whether the globe hides it, and which latitude/longitude is under a pixel.
 */
import { Ray, Raycaster, Sphere, Vector2, Vector3, type PerspectiveCamera } from 'three'
import { GLOBE_RADIUS, vectorToLatLon, type LatLon } from './geo'

/** A projected point: canvas CSS pixels, plus normalised depth (> 1 = behind the camera's far plane). */
export interface ScreenPoint {
  x: number
  y: number
  depth: number
}

/** Projects for one camera onto a canvas of the current CSS size. */
export class GlobeProjector {
  width = 1
  height = 1
  private readonly scratch = new Vector3()
  private readonly toPoint = new Vector3()
  private readonly raycaster = new Raycaster()
  private readonly globeSphere = new Sphere(new Vector3(), GLOBE_RADIUS)
  private readonly pointer = new Vector2()
  private readonly hit = new Vector3()

  constructor(private readonly camera: PerspectiveCamera) {}

  /** The canvas position of a scene point. */
  toScreen(position: Vector3): ScreenPoint {
    this.scratch.copy(position).project(this.camera)
    return {
      x: (this.scratch.x * 0.5 + 0.5) * this.width,
      y: (-this.scratch.y * 0.5 + 0.5) * this.height,
      depth: this.scratch.z,
    }
  }

  /** True when nothing of the globe lies between the camera and `position` (it is on the near side). */
  isFacing(position: Vector3): boolean {
    const cameraPosition = this.camera.position
    this.toPoint.copy(position).sub(cameraPosition)
    const distance = this.toPoint.length()
    this.toPoint.divideScalar(distance)
    // Ray–sphere intersection: does the ray to the point enter the globe first?
    const projection = cameraPosition.dot(this.toPoint)
    const offset = cameraPosition.lengthSq() - GLOBE_RADIUS * GLOBE_RADIUS
    const discriminant = projection * projection - offset
    if (discriminant < 0) return true
    const entry = -projection - Math.sqrt(discriminant)
    // A small allowance so points on the surface itself still count as visible.
    return entry < 0 || entry > distance - 0.6
  }

  /**
   * How far inside the visible disc a surface point lies: 0 on the horizon
   * (the globe's outline as the camera sees it), rising to 1 straight below
   * the camera; negative on the far side.
   */
  insideHorizon(position: Vector3): number {
    const cameraDistance = this.camera.position.length()
    const horizonCosine = GLOBE_RADIUS / cameraDistance
    const facing =
      this.scratch.copy(position).normalize().dot(this.camera.position) / cameraDistance
    return (facing - horizonCosine) / (1 - horizonCosine)
  }

  /**
   * The point of the globe under canvas CSS pixel (x, y), or null for space.
   */
  latLonAt(x: number, y: number): LatLon | null {
    this.pointer.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const ray: Ray = this.raycaster.ray
    if (!ray.intersectSphere(this.globeSphere, this.hit)) return null
    return vectorToLatLon(this.hit)
  }
}
