/**
 * The marks live objects are drawn with: the flat maps' label glyphs (Air's
 * arrow, Sea's hull outline, a plain dot), painted white into one small atlas
 * texture so a single point material can draw them all, tinted per object.
 */
import { CanvasTexture, LinearFilter, type Texture } from 'three'

/** Which cell of the atlas a point uses. */
export const SPRITE_SHAPE = { arrow: 0, hull: 1, dot: 2 } as const

/** How many cells the atlas has, side by side. */
export const SPRITE_CELL_COUNT = 3

/** Pixel size of one atlas cell (drawn crisp at twice the largest on-screen size). */
const CELL_PX = 64

/**
 * The shapes in the label glyphs' 12-unit box (`mapLabelParts.ts`): each points
 * up, and the shader turns it to the object's heading on screen.
 */
const ARROW_POINTS: ReadonlyArray<readonly [number, number]> = [
  [6, 1],
  [10, 11],
  [6, 8.5],
  [2, 11],
]
const HULL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [6, 1],
  [8.8, 4.2],
  [8.8, 11],
  [6, 9.6],
  [3.2, 11],
  [3.2, 4.2],
]

function outline(
  context: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
): void {
  context.beginPath()
  points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)))
  context.closePath()
  // A dark edge under the white stroke keeps a mark legible over bright land.
  context.lineWidth = 3
  context.strokeStyle = 'rgba(0, 0, 0, 0.55)'
  context.stroke()
  context.lineWidth = 1.6
  context.strokeStyle = '#fff'
  context.stroke()
}

/**
 * Builds the atlas: arrow, hull, dot. Returns null where a 2D canvas isn't
 * available (the points then draw as plain squares).
 */
export function createSpriteAtlas(): Texture | null {
  const canvas = document.createElement('canvas')
  canvas.width = CELL_PX * SPRITE_CELL_COUNT
  canvas.height = CELL_PX
  const context = canvas.getContext('2d')
  if (!context) return null
  context.lineJoin = 'round'
  // Each cell maps the glyphs' 12-unit box onto its middle, with a margin so
  // the stroke and its shadow are never cut by the cell edge.
  const unit = CELL_PX / 16
  const drawCell = (cell: number, draw: () => void): void => {
    context.save()
    context.translate(cell * CELL_PX + 2 * unit, 2 * unit)
    context.scale(unit, unit)
    draw()
    context.restore()
  }
  drawCell(SPRITE_SHAPE.arrow, () => outline(context, ARROW_POINTS))
  drawCell(SPRITE_SHAPE.hull, () => outline(context, HULL_POINTS))
  drawCell(SPRITE_SHAPE.dot, () => {
    context.beginPath()
    context.arc(6, 6, 3.2, 0, Math.PI * 2)
    context.fillStyle = '#fff'
    context.fill()
    context.lineWidth = 1.2
    context.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    context.stroke()
  })
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}
