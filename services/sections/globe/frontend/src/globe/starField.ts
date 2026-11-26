/**
 * The star field: three layers of fixed-size points on a far shell (faint and
 * many, brighter, a few bright), fixed in space so they turn with the view.
 */
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three'

/** Distance of the star shell from the centre; well inside the camera's far plane. */
const STAR_SHELL_RADIUS = 2600

/** [count, size in pixels, opacity] per layer, as the site globe draws them. */
const STAR_LAYERS: ReadonlyArray<[number, number, number]> = [
  [2400, 1, 0.6],
  [600, 1.6, 0.75],
  [110, 2.2, 0.95],
]

function createStarLayer(count: number, size: number, opacity: number): Points {
  const positions = new Float32Array(count * 3)
  let placed = 0
  while (placed < count) {
    // A random direction: pick points in the unit cube and keep those inside
    // the ball (rejecting the centre, whose direction is unstable).
    const x = Math.random() * 2 - 1
    const y = Math.random() * 2 - 1
    const z = Math.random() * 2 - 1
    const length = Math.hypot(x, y, z)
    if (length > 1 || length < 0.1) continue
    const scale = STAR_SHELL_RADIUS / length
    positions[placed * 3] = x * scale
    positions[placed * 3 + 1] = y * scale
    positions[placed * 3 + 2] = z * scale
    placed++
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return new Points(
    geometry,
    new PointsMaterial({
      color: 0xffffff,
      size,
      sizeAttenuation: false,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  )
}

/** All three star layers. */
export function createStarField(): Points[] {
  return STAR_LAYERS.map(([count, size, opacity]) => createStarLayer(count, size, opacity))
}
