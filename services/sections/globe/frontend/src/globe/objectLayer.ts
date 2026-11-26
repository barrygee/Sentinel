/**
 * One kind of live object (aircraft, vessels or APRS stations) as a single
 * `THREE.Points` cloud, drawn on the GPU however many there are.
 *
 * Each point carries its colour, its mark (arrow, hull or dot) and a second
 * position a little way along its heading: the vertex shader projects both
 * and turns the mark to the heading as it appears on screen, so marks keep
 * pointing the right way as the globe turns with no per-frame CPU work. The
 * globe's own depth hides points on the far side.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three'
import { DEGREES_TO_RADIANS, latLonToVector } from './geo'
import type { GlobeObject } from './globeObject'
import { SPRITE_CELL_COUNT, SPRITE_SHAPE } from './objectSprites'

/** A mark's on-screen size in CSS pixels, and the selected one's. */
const MARK_SIZE_PX = 14
const SELECTED_SCALE = 1.6

/** How far along the heading the second point sits, in degrees of arc. */
const HEADING_STEP_DEGREES = 0.3

const vertexShader = /* glsl */ `
  attribute vec3 ahead;
  attribute vec3 color;
  attribute float shape;
  attribute float scale;
  attribute float hasHeading;
  uniform float pointSize;
  uniform float aspect;
  varying vec3 vColor;
  varying float vShape;
  varying float vAngle;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 clipAhead = projectionMatrix * modelViewMatrix * vec4(ahead, 1.0);
    vec2 screenDelta = (clipAhead.xy / clipAhead.w - clip.xy / clip.w) * vec2(aspect, 1.0);
    // Clockwise from screen-up, the way a heading is read.
    vAngle = hasHeading > 0.5 ? atan(screenDelta.x, screenDelta.y) : 0.0;
    vColor = color;
    vShape = shape;
    gl_Position = clip;
    gl_PointSize = pointSize * scale;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D atlas;
  uniform float hasAtlas;
  varying vec3 vColor;
  varying float vShape;
  varying float vAngle;
  void main() {
    // gl_PointCoord runs down the screen; work y-up, centred on the point.
    vec2 offset = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    // Turning the mark clockwise = reading the texture turned anticlockwise.
    vec2 cellUv = vec2(cosine * offset.x - sine * offset.y, sine * offset.x + cosine * offset.y) + 0.5;
    if (cellUv.x < 0.0 || cellUv.x > 1.0 || cellUv.y < 0.0 || cellUv.y > 1.0) discard;
    vec4 mark = hasAtlas > 0.5
      ? texture2D(atlas, vec2((vShape + cellUv.x) / ${SPRITE_CELL_COUNT.toFixed(1)}, cellUv.y))
      : vec4(1.0);
    if (mark.a < 0.04) discard;
    // White strokes take the object's colour; the dark edge stays dark.
    gl_FragColor = vec4(vColor * mark.rgb, mark.a);
    #include <colorspace_fragment>
  }
`

/** The mark a kind of object uses when it has a heading. */
const HEADED_SHAPE = { air: SPRITE_SHAPE.arrow, sea: SPRITE_SHAPE.hull, aprs: SPRITE_SHAPE.arrow }

/** One kind of object as a point cloud. */
export class ObjectPointLayer {
  readonly points: Points<BufferGeometry, ShaderMaterial>
  /** The objects drawn, in point order. */
  objects: GlobeObject[] = []
  /** Each object's scene position, in the same order (for labels and picking). */
  positions: Vector3[] = []
  private selectedIndex = -1
  private readonly colour = new Color()
  private readonly aheadScratch = new Vector3()

  constructor(atlas: Texture | null, pixelRatio: number) {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        atlas: { value: atlas },
        hasAtlas: { value: atlas ? 1 : 0 },
        pointSize: { value: MARK_SIZE_PX * pixelRatio },
        aspect: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.points = new Points(new BufferGeometry(), material)
    // The cloud spans the whole globe; never let a stale bounding sphere cull it.
    this.points.frustumCulled = false
  }

  /** The canvas aspect ratio (width / height), for the heading maths. */
  setAspect(aspect: number): void {
    this.points.material.uniforms.aspect!.value = aspect
  }

  /** Shows or hides the whole layer. */
  set visible(visible: boolean) {
    this.points.visible = visible
  }

  get visible(): boolean {
    return this.points.visible
  }

  /** Replaces every point with `objects`, keeping the selection if its object is still there. */
  setObjects(objects: GlobeObject[], selectedKey: string | null): void {
    const count = objects.length
    const position = new Float32Array(count * 3)
    const ahead = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const shape = new Float32Array(count)
    const scale = new Float32Array(count)
    const hasHeading = new Float32Array(count)
    this.objects = objects
    this.positions = objects.map((object, index) => {
      const point = latLonToVector(object.lat, object.lon, object.heightAboveSurface)
      point.toArray(position, index * 3)
      const headed = object.headingDeg !== null
      if (headed) {
        const headingRadians = object.headingDeg! * DEGREES_TO_RADIANS
        // A step along the heading, longitude scaled for latitude (flat-earth enough for 0.3°).
        const latitudeScale = Math.max(0.05, Math.cos(object.lat * DEGREES_TO_RADIANS))
        latLonToVector(
          object.lat + Math.cos(headingRadians) * HEADING_STEP_DEGREES,
          object.lon + (Math.sin(headingRadians) * HEADING_STEP_DEGREES) / latitudeScale,
          object.heightAboveSurface,
          this.aheadScratch,
        ).toArray(ahead, index * 3)
      } else {
        point.toArray(ahead, index * 3)
      }
      this.colour.setStyle(object.colour).toArray(color, index * 3)
      shape[index] = headed ? HEADED_SHAPE[object.kind] : SPRITE_SHAPE.dot
      hasHeading[index] = headed ? 1 : 0
      scale[index] = 1
      return point
    })
    const geometry = this.points.geometry
    geometry.setAttribute('position', new BufferAttribute(position, 3))
    geometry.setAttribute('ahead', new BufferAttribute(ahead, 3))
    geometry.setAttribute('color', new BufferAttribute(color, 3))
    geometry.setAttribute('shape', new BufferAttribute(shape, 1))
    geometry.setAttribute('scale', new BufferAttribute(scale, 1))
    geometry.setAttribute('hasHeading', new BufferAttribute(hasHeading, 1))
    geometry.setDrawRange(0, count)
    this.selectedIndex = -1
    this.setSelected(selectedKey)
  }

  /** Enlarges the selected object's mark (null = none of this layer's). */
  setSelected(key: string | null): void {
    const scale = this.points.geometry.getAttribute('scale') as BufferAttribute | undefined
    if (!scale) return
    const index = key === null ? -1 : this.objects.findIndex((object) => object.key === key)
    if (index === this.selectedIndex) return
    if (this.selectedIndex >= 0) scale.setX(this.selectedIndex, 1)
    if (index >= 0) scale.setX(index, SELECTED_SCALE)
    this.selectedIndex = index
    scale.needsUpdate = true
  }

  /** Frees the geometry and material (the atlas is shared, and freed by its owner). */
  dispose(): void {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}
