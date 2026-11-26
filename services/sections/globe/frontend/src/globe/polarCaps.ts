/**
 * Polar caps: the equirectangular base map smears near the poles, so each pole
 * gets its own cap, painted from the same vectors in a polar projection and
 * laid just above the globe.
 */
import { Mesh, SphereGeometry, Vector3, type WebGLRenderer } from 'three'
import { createDayNightMaterial, type SunDirectionUniform } from './dayNightMaterial'
import { canvasHasPixels, createLayerTexture, EARTH_COLOURS, isSmallDevice } from './earthTexture'
import { DEGREES_TO_RADIANS, GLOBE_RADIUS, vectorToLatLon } from './geo'
import type { NaturalEarthSet, Ring } from './naturalEarth'

/** Degrees of latitude each cap covers from its pole. */
const CAP_SPAN_DEGREES = 18

/**
 * Builds the cap for one pole.
 *
 * @param hemisphere 1 for the north pole, -1 for the south.
 * @returns the mesh, or null when the browser could not back its canvas.
 */
function createCap(
  set: NaturalEarthSet,
  hemisphere: 1 | -1,
  canvasSize: number,
  renderer: WebGLRenderer,
  sunDirection: SunDirectionUniform,
): Mesh | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const context = canvas.getContext('2d')
  if (!context) return null

  const project = (lon: number, lat: number): [number, number] => {
    const radius = ((90 - hemisphere * lat) / CAP_SPAN_DEGREES) * 0.5
    const angle = lon * DEGREES_TO_RADIANS * hemisphere
    return [
      (0.5 + radius * Math.cos(angle)) * canvasSize,
      (0.5 + radius * Math.sin(angle)) * canvasSize,
    ]
  }
  const nearPole = (bounds: [number, number, number, number]): boolean =>
    hemisphere > 0
      ? bounds[3] >= 90 - CAP_SPAN_DEGREES - 2
      : bounds[1] <= -(90 - CAP_SPAN_DEGREES - 2)
  const tracePolar = (ring: Ring): void => {
    let [x, y] = project(ring[0]!, ring[1]!)
    context.moveTo(x, y)
    for (let index = 2; index < ring.length; index += 2) {
      ;[x, y] = project(ring[index]!, ring[index + 1]!)
      context.lineTo(x, y)
    }
  }

  context.fillStyle = EARTH_COLOURS.ocean
  context.fillRect(0, 0, canvasSize, canvasSize)
  context.fillStyle = EARTH_COLOURS.land
  for (const polygon of set.land) {
    if (!nearPole(polygon.bounds)) continue
    context.beginPath()
    for (const ring of polygon.rings) {
      tracePolar(ring)
      context.closePath()
    }
    context.fill('evenodd')
  }
  context.strokeStyle = EARTH_COLOURS.border
  context.lineWidth = Math.max(1, canvasSize / 1400)
  context.lineJoin = 'round'
  for (const line of set.borders) {
    if (!nearPole(line.bounds)) continue
    context.beginPath()
    tracePolar(line.rings[0]!)
    context.stroke()
  }
  if (!canvasHasPixels(context, canvasSize)) return null

  const geometry = new SphereGeometry(
    GLOBE_RADIUS + 0.024,
    384,
    24,
    0,
    Math.PI * 2,
    hemisphere > 0 ? 0 : (180 - CAP_SPAN_DEGREES) * DEGREES_TO_RADIANS,
    CAP_SPAN_DEGREES * DEGREES_TO_RADIANS,
  )
  // Re-map each vertex's texture coordinate into the polar canvas.
  const positions = geometry.attributes.position!
  const textureCoordinates = geometry.attributes.uv!
  const vertex = new Vector3()
  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index)
    const { lat, lon } = vectorToLatLon(vertex)
    const [x, y] = project(lon, lat)
    textureCoordinates.setXY(index, x / canvasSize, 1 - y / canvasSize)
  }
  textureCoordinates.needsUpdate = true
  return new Mesh(
    geometry,
    createDayNightMaterial(createLayerTexture(canvas, renderer), sunDirection),
  )
}

/** Both polar caps (either may be missing on a device short of canvas memory). */
export function createPolarCaps(
  set: NaturalEarthSet,
  renderer: WebGLRenderer,
  sunDirection: SunDirectionUniform,
): Mesh[] {
  const small = isSmallDevice()
  const northSize = small ? 2048 : Math.min(4096, renderer.capabilities.maxTextureSize)
  const southSize = small ? 1024 : 2048
  return [
    createCap(set, 1, northSize, renderer, sunDirection),
    createCap(set, -1, southSize, renderer, sunDirection),
  ].filter((cap): cap is Mesh => cap !== null)
}
