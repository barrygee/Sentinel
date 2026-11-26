/**
 * The GLOBE section's 3D globe: renderer, scene, camera and frame loop,
 * composed from the layer modules beside it. A port of the sentinel-site
 * header globe, so the two look the same: the dark basemap from Natural Earth
 * vectors, the UK detail patch, polar caps, a sharp patch for the area in view,
 * day/night shading, atmosphere, stars and country names.
 *
 * Framework-free: `useGlobeScene` owns its lifecycle from Vue.
 */
import {
  Material,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { createAtmosphere } from './atmosphere'
import { CameraController, fitDistance, ZOOM_STEP } from './cameraController'
import { CountryLabelLayer, type ScreenBox } from './countryLabels'
import { createDayNightMaterial, createSunDirectionUniform } from './dayNightMaterial'
import { baseMapWidth, createLayerTexture, paintWorldCanvas, SPACE_COLOUR } from './earthTexture'
import { GLOBE_RADIUS, latLonToVector, subsolarPoint, type LatLon } from './geo'
import { GlobeProjector } from './globeProjector'
import { HomeMarker } from './homeMarker'
import { handleGlobeKey } from './keyboardControls'
import { loadGlobalSet } from './naturalEarth'
import { createPolarCaps } from './polarCaps'
import { SharpDetailPatch, type ViewportSample } from './sharpDetailPatch'
import { createStarField } from './starField'
import { createUkDetailPatch } from './ukDetailPatch'

/** Vertical field of view in degrees (the site globe's). */
const FIELD_OF_VIEW = 30
/** Below this width the camera eases faster and canvases stay small. */
const NARROW_WIDTH = 900
/** A frame never advances the camera by more than this (after a hidden tab, say). */
const MAX_FRAME_SECONDS = 1

/** What the globe needs from its host. */
export interface GlobeSceneOptions {
  canvas: HTMLCanvasElement
  /** An element laid exactly over the canvas, for the HTML labels. */
  overlay: HTMLElement
  /** The operator's location: the start view and the home marker (null = none known). */
  home: LatLon | null
  reducedMotion: boolean
}

/** The start view when no location is known: the North Atlantic, Europe in sight. */
const FALLBACK_CENTRE: LatLon = { lat: 40, lon: -10 }

/** Tries WebGL with antialiasing, then without, then on the low-power GPU. */
function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  const attempts: Array<ConstructorParameters<typeof WebGLRenderer>[0]> = [
    { canvas, antialias: true },
    { canvas, antialias: false },
    { canvas, antialias: false, powerPreference: 'low-power' },
  ]
  for (const attempt of attempts) {
    try {
      return new WebGLRenderer(attempt)
    } catch {
      // No context with these settings; try the next.
    }
  }
  return null
}

/** Frees every geometry, material and texture under `root`. */
function disposeObjectTree(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Points)) return
    object.geometry.dispose()
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
      const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> })
        .uniforms
      for (const uniform of Object.values(uniforms ?? {})) {
        if (uniform.value instanceof Texture) uniform.value.dispose()
      }
      material.dispose()
    }
  })
}

/** One running globe. Create it with {@link GlobeScene.create}. */
export class GlobeScene {
  readonly controller: CameraController
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 5000)
  private readonly projector: GlobeProjector
  private readonly sunDirection = createSunDirectionUniform()
  private readonly baseMesh: Mesh
  private readonly countryLabels: CountryLabelLayer
  private readonly homeMarker: HomeMarker
  private sharpPatch: SharpDetailPatch | null = null
  private home: LatLon | null
  private frameRequest = 0
  private lastFrameMs = 0
  private running = false
  /** False until the first resize, which snaps the camera to the fitted start view. */
  private sized = false
  private disposed = false
  /** Resolves once the base map has painted (the globe is worth showing). */
  readonly ready: Promise<void>

  /**
   * Builds the globe on `options.canvas`.
   *
   * @returns null when the browser can't give it a WebGL context.
   */
  static create(options: GlobeSceneOptions): GlobeScene | null {
    const renderer = createRenderer(options.canvas)
    return renderer ? new GlobeScene(renderer, options) : null
  }

  private constructor(
    private readonly renderer: WebGLRenderer,
    private readonly options: GlobeSceneOptions,
  ) {
    // Keep the context restorable after a GPU reset instead of losing the page's globe.
    options.canvas.addEventListener('webglcontextlost', this.onContextLost)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(SPACE_COLOUR, 1)

    this.home = options.home
    this.projector = new GlobeProjector(this.camera)
    const centre = options.home ?? FALLBACK_CENTRE
    this.controller = new CameraController(
      this.camera,
      { ...centre, distance: 225 },
      options.reducedMotion,
    )

    for (const stars of createStarField()) this.scene.add(stars)
    // Hidden until its texture is painted, so the first frames show space, not a black ball.
    this.baseMesh = new Mesh(
      new SphereGeometry(GLOBE_RADIUS, 192, 96),
      createDayNightMaterial(null, this.sunDirection),
    )
    this.baseMesh.visible = false
    this.scene.add(this.baseMesh)
    this.scene.add(createUkDetailPatch(renderer, this.sunDirection))
    this.scene.add(createAtmosphere())

    this.homeMarker = new HomeMarker(options.overlay)
    this.homeMarker.setLocation(options.home)
    this.countryLabels = new CountryLabelLayer(options.overlay)
    void this.countryLabels.load()
    this.ready = this.paintMap()
  }

  /** Paints the base map, then the polar caps and the sharp patch, from the 50 m vectors. */
  private async paintMap(): Promise<void> {
    const set = await loadGlobalSet()
    if (this.disposed) return
    const canvas = paintWorldCanvas(set, baseMapWidth(this.renderer))
    if (canvas) {
      const material = this.baseMesh.material as ReturnType<typeof createDayNightMaterial>
      material.uniforms.map!.value = createLayerTexture(canvas, this.renderer)
      this.baseMesh.visible = true
    }
    // The caps are a second big paint: give the browser a frame in between.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    if (this.disposed) return
    for (const cap of createPolarCaps(set, this.renderer, this.sunDirection)) this.scene.add(cap)
    this.sharpPatch = new SharpDetailPatch(set, this.renderer, this.sunDirection, this.scene)
  }

  /** Sizes the drawing buffer and camera to the canvas's CSS size. */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.renderer.setSize(width, height, false)
    this.projector.width = width
    this.projector.height = height
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.applyHome(this.home)
    if (!this.sized) {
      this.sized = true
      this.controller.jumpToGoal()
    }
  }

  /** Moves the home view and marker (the start view follows until the viewer moves it). */
  setHome(home: LatLon | null): void {
    this.home = home
    this.homeMarker.setLocation(home)
    this.applyHome(home)
  }

  private applyHome(home: LatLon | null): void {
    const centre = home ?? FALLBACK_CENTRE
    this.controller.setHome({
      ...centre,
      distance: fitDistance(this.projector.width, this.projector.height, FIELD_OF_VIEW),
    })
  }

  /** One zoom-button step in. */
  zoomIn(): void {
    this.controller.zoomBy(ZOOM_STEP)
  }

  /** One zoom-button step out. */
  zoomOut(): void {
    this.controller.zoomBy(1 / ZOOM_STEP)
  }

  /** Keyboard control; returns true when the key was used. */
  handleKey(key: string): boolean {
    return handleGlobeKey(key, this.controller)
  }

  /** Starts (or resumes) the frame loop. */
  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.lastFrameMs = performance.now()
    this.frameRequest = requestAnimationFrame(this.frame)
  }

  /** Stops the frame loop (hidden tab); {@link start} resumes it. */
  pause(): void {
    this.running = false
    cancelAnimationFrame(this.frameRequest)
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return
    const deltaSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (nowMs - this.lastFrameMs) / 1000))
    this.lastFrameMs = nowMs
    this.controller.update(deltaSeconds, this.projector.width < NARROW_WIDTH)

    const sun = subsolarPoint(new Date())
    latLonToVector(sun.lat, sun.lon, 0, this.sunDirection.value).normalize()
    this.sharpPatch?.update(
      {
        settled: this.controller.isSettled(),
        viewDistance: this.controller.view.distance,
        pixelsPerDegree: this.pixelsPerDegree(),
        sampleViewport: () => this.sampleViewport(),
      },
      nowMs,
    )
    this.renderer.render(this.scene, this.camera)

    const reserved: ScreenBox[] = []
    const homeBox = this.homeMarker.update(this.projector)
    if (homeBox) reserved.push(homeBox)
    this.countryLabels.update(this.projector, this.controller.view.distance, reserved)

    this.frameRequest = requestAnimationFrame(this.frame)
  }

  /** Screen pixels per degree of arc at the centre of the view. */
  private pixelsPerDegree(): number {
    const halfFovTangent = Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180)
    const arcPerDegree = (GLOBE_RADIUS * Math.PI) / 180
    return (
      (arcPerDegree * this.projector.height) /
      (2 * halfFovTangent * (this.controller.view.distance - GLOBE_RADIUS))
    )
  }

  /** A 13 × 11 grid of viewport points that hit the globe, with how squarely each faces the camera. */
  private sampleViewport(): ViewportSample[] {
    const cameraDirection = this.camera.position.clone().normalize()
    const samples: ViewportSample[] = []
    for (let column = 0; column <= 12; column++) {
      for (let row = 0; row <= 10; row++) {
        const position = this.projector.latLonAt(
          (this.projector.width * column) / 12,
          (this.projector.height * row) / 10,
        )
        if (!position) continue
        const facing = latLonToVector(position.lat, position.lon).normalize().dot(cameraDirection)
        samples.push({ position, facing })
      }
    }
    return samples
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
  }

  /** Stops the loop and frees every GPU resource, the context and the overlays. */
  dispose(): void {
    this.disposed = true
    this.pause()
    this.options.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.sharpPatch?.dispose()
    disposeObjectTree(this.scene)
    this.countryLabels.dispose()
    this.homeMarker.dispose()
    this.renderer.dispose()
    // Browsers cap live WebGL contexts; release this one now rather than at GC.
    this.renderer.forceContextLoss()
  }
}
