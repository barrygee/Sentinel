/**
 * The UK detail patch: a pre-rendered image of the app's own basemap around
 * the British Isles (lon -16..12, lat 42..64), laid over the base map so the
 * home region reads like the flat maps even before the sharp patch draws.
 */
import { Mesh, SphereGeometry, SRGBColorSpace, TextureLoader, type WebGLRenderer } from 'three'
import ukDetailPatchUrl from './data/ukDetailPatch.webp?url'
import { createDayNightMaterial, type SunDirectionUniform } from './dayNightMaterial'
import { DEGREES_TO_RADIANS, GLOBE_RADIUS } from './geo'

const WEST = -16
const EAST = 12
const SOUTH = 42
const NORTH = 64

/**
 * The patch mesh. Its texture loads in the background; until then the mesh
 * draws nothing useful, so it starts hidden and shows once the image is in.
 */
export function createUkDetailPatch(
  renderer: WebGLRenderer,
  sunDirection: SunDirectionUniform,
): Mesh {
  const material = createDayNightMaterial(null, sunDirection)
  const mesh = new Mesh(
    new SphereGeometry(
      GLOBE_RADIUS + 0.01,
      160,
      128,
      (WEST + 180) * DEGREES_TO_RADIANS,
      (EAST - WEST) * DEGREES_TO_RADIANS,
      (90 - NORTH) * DEGREES_TO_RADIANS,
      (NORTH - SOUTH) * DEGREES_TO_RADIANS,
    ),
    material,
  )
  mesh.visible = false
  new TextureLoader().load(ukDetailPatchUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    material.uniforms.map!.value = texture
    mesh.visible = true
  })
  return mesh
}
