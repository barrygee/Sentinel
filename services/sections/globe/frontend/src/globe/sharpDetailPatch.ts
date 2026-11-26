/**
 * The sharp patch: once the camera settles, the area in view is redrawn from
 * the Natural Earth vectors onto a fixed-size canvas and laid over the base
 * map, so coastlines stay crisp however far in the globe is zoomed. Europe is
 * drawn from the 10 m set (fetched the first time it is needed), everywhere
 * else from the 50 m set.
 */
import { Mesh, SphereGeometry, type Scene, type WebGLRenderer } from 'three'
import { createDayNightMaterial, type SunDirectionUniform } from './dayNightMaterial'
import { createLayerTexture, EARTH_COLOURS, isSmallDevice } from './earthTexture'
import { DEGREES_TO_RADIANS, GLOBE_RADIUS, type LatLon } from './geo'
import { addRingToPath, loadEuropeSet, strokeLine, type NaturalEarthSet } from './naturalEarth'

/** A patch extent: `[west, south, east, north]` in degrees. */
type Bounds = [number, number, number, number]

/** A point of the viewport that hits the globe, and how squarely it faces the camera (1 = dead centre). */
export interface ViewportSample {
  position: LatLon
  facing: number
}

/** What the patch needs to know about the camera each frame. */
export interface SharpPatchView {
  /** True when the camera has (nearly) stopped moving. */
  settled: boolean
  /** Camera distance from the globe's centre. */
  viewDistance: number
  /** Screen pixels per degree of arc at the centre of the view (line width scaling). */
  pixelsPerDegree: number
  /** Samples a grid across the viewport; only called when a redraw may be due. */
  sampleViewport: () => ViewportSample[]
}

/** The Europe 10 m set covers lon -45..60, lat 20..78. */
function insideEurope(bounds: Bounds): boolean {
  return bounds[0] >= -45 && bounds[2] <= 60 && bounds[1] >= 20 && bounds[3] <= 78
}

/** Minimum time between two checks once the first patch is drawn. */
const RECHECK_INTERVAL_MS = 300

/**
 * The visible extent from the samples: the widest facing threshold whose
 * points span at most 120° of longitude (a zoomed-out view keeps only its
 * centre), or null when nothing usable is in view.
 */
function visibleBounds(samples: ViewportSample[]): Bounds | null {
  for (const threshold of [0.35, 0.55, 0.7, 0.82, 0.9]) {
    const kept = samples.filter((sample) => sample.facing >= threshold)
    if (!kept.length) continue
    const lons = kept.map((sample) => sample.position.lon)
    const lats = kept.map((sample) => sample.position.lat)
    const bounds: Bounds = [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ]
    if (bounds[2] - bounds[0] <= 120 || threshold === 0.9) return bounds
  }
  return null
}

/** The sharp, in-view map patch. Add `mesh` handling to the scene through {@link update}. */
export class SharpDetailPatch {
  private readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D | null
  private readonly canvasSize: number
  private readonly material
  private mesh: Mesh | null = null
  private drawnBounds: Bounds | null = null
  private lastCheckMs = 0
  private europeSet: NaturalEarthSet | null = null
  private europeRequested = false
  private disposed = false

  constructor(
    private readonly globalSet: NaturalEarthSet,
    renderer: WebGLRenderer,
    sunDirection: SunDirectionUniform,
    private readonly scene: Scene,
  ) {
    this.canvasSize = Math.min(isSmallDevice() ? 2048 : 4096, renderer.capabilities.maxTextureSize)
    this.canvas.width = this.canvas.height = this.canvasSize
    this.context = this.canvas.getContext('2d')
    const texture = createLayerTexture(this.canvas, renderer)
    texture.generateMipmaps = true
    this.material = createDayNightMaterial(texture, sunDirection)
  }

  /** Checks the view and redraws the patch when it no longer covers it. Call once per frame. */
  update(view: SharpPatchView, nowMs: number): void {
    if (!this.context || this.disposed) return
    if (this.drawnBounds && nowMs - this.lastCheckMs < RECHECK_INTERVAL_MS) return
    this.lastCheckMs = nowMs
    if (view.viewDistance > 700 || !view.settled) return

    const seen = visibleBounds(view.sampleViewport())
    // Too wide, or only polar ice in view (the polar caps cover that).
    if (!seen || seen[2] - seen[0] > 170 || seen[1] > 68 || seen[3] < -68) {
      this.hide()
      return
    }
    const south = Math.max(-74, seen[1])
    const north = Math.min(74, seen[3])
    const [west, , east] = seen
    const drawn = this.drawnBounds
    const stale =
      !drawn ||
      west < drawn[0] ||
      east > drawn[2] ||
      south < drawn[1] ||
      north > drawn[3] ||
      // Zoomed well in since the last draw: redraw tighter, for more detail.
      drawn[2] - drawn[0] > (east - west) * 2.6
    if (stale) {
      // A margin round the view, so small pans don't trigger a redraw.
      const lonMargin = (east - west) * 0.35 + 0.5
      const latMargin = (north - south) * 0.35 + 0.5
      const next: Bounds = [
        west - lonMargin,
        Math.max(-74, south - latMargin),
        east + lonMargin,
        Math.min(74, north + latMargin),
      ]
      if (next[3] - next[1] < 4 || next[0] < -180 || next[2] > 180) {
        this.hide()
        return
      }
      this.draw(next, view.pixelsPerDegree)
    }
    if (this.mesh) this.mesh.visible = true
  }

  private hide(): void {
    if (this.mesh) this.mesh.visible = false
  }

  /** The vector set for an extent; starts the Europe download the first time Europe is framed. */
  private setFor(bounds: Bounds): NaturalEarthSet {
    if (!insideEurope(bounds)) return this.globalSet
    if (this.europeSet) return this.europeSet
    if (!this.europeRequested) {
      this.europeRequested = true
      loadEuropeSet()
        .then((set) => {
          this.europeSet = set
          // Redraw at the next check with the detailed coastlines.
          this.drawnBounds = null
        })
        .catch(() => {
          // Stay on the 50 m set; allow another try on a later framing.
          this.europeRequested = false
        })
    }
    return this.globalSet
  }

  private draw(bounds: Bounds, pixelsPerDegree: number): void {
    const context = this.context!
    const size = this.canvasSize
    const [west, south, east, north] = bounds
    const scaleX = size / (east - west)
    const scaleY = size / (north - south)
    const projectX = (lon: number): number => (lon - west) * scaleX
    const projectY = (lat: number): number => (north - lat) * scaleY
    const overlaps = (other: Bounds): boolean =>
      !(other[2] < west || other[0] > east || other[3] < south || other[1] > north)
    const set = this.setFor(bounds)

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.fillStyle = EARTH_COLOURS.ocean
    context.fillRect(0, 0, size, size)
    context.fillStyle = EARTH_COLOURS.land
    for (const polygon of set.land) {
      if (!overlaps(polygon.bounds)) continue
      context.beginPath()
      for (const ring of polygon.rings) addRingToPath(context, ring, projectX, projectY)
      context.fill('evenodd')
    }
    context.strokeStyle = EARTH_COLOURS.border
    // About 1.2 screen pixels wide whatever the zoom.
    context.lineWidth = Math.max(1, (1.2 * scaleY) / pixelsPerDegree)
    context.lineJoin = 'round'
    for (const line of set.borders) {
      if (overlaps(line.bounds)) strokeLine(context, line.rings[0]!, projectX, projectY)
    }
    this.material.uniforms.map!.value.needsUpdate = true

    const geometry = new SphereGeometry(
      GLOBE_RADIUS + 0.02,
      128,
      128,
      (west + 180) * DEGREES_TO_RADIANS,
      (east - west) * DEGREES_TO_RADIANS,
      (90 - north) * DEGREES_TO_RADIANS,
      (north - south) * DEGREES_TO_RADIANS,
    )
    if (this.mesh) {
      this.mesh.geometry.dispose()
      this.mesh.geometry = geometry
    } else {
      this.mesh = new Mesh(geometry, this.material)
      this.scene.add(this.mesh)
    }
    this.drawnBounds = bounds
  }

  /** Frees the patch's GPU resources. */
  dispose(): void {
    this.disposed = true
    this.mesh?.geometry.dispose()
    this.material.uniforms.map!.value.dispose()
    this.material.dispose()
  }
}
