// Canvas sprite factories for AisVesselsControl. Pure: no `this`, no map state.
// Mirrors adsbSprites.ts so the Sea map's marks are built the same way as the
// Air map's — a 64px canvas, pinned at its centre, drawn at 2× pixel ratio.

/** Side of the square canvas every sprite is drawn on, in device pixels. */
export const VESSEL_SPRITE_SIZE_PX = 64

/**
 * A vessel's bare mark, drawn when there is no room for its label pill: the
 * same hollow arrowhead the pill's glyph well shows (`createDirectionArrowShape`
 * in mapLabelParts — points `6,1 10,11 6,8.5 2,11` in a 12-unit box), stroked
 * in the family colour, so a vessel looks the same with or without its pill.
 * The shape is centred on the canvas so `icon-rotate` turns it about the
 * reported position.
 */
export function createVesselArrow(color = '#39d5ff', scale = 1): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = VESSEL_SPRITE_SIZE_PX
  const context = canvas.getContext('2d')!
  const centre = VESSEL_SPRITE_SIZE_PX / 2
  // The 12-unit glyph box scaled up to fill roughly two thirds of the canvas.
  const unit = (VESSEL_SPRITE_SIZE_PX / 12) * 0.62 * scale
  const point = (glyphX: number, glyphY: number): [number, number] => [
    centre + (glyphX - 6) * unit,
    centre + (glyphY - 6) * unit,
  ]
  context.beginPath()
  context.moveTo(...point(6, 1))
  context.lineTo(...point(10, 11))
  context.lineTo(...point(6, 8.5))
  context.lineTo(...point(2, 11))
  context.closePath()
  context.lineJoin = 'round'
  context.lineWidth = 1.5 * unit * 0.9
  context.strokeStyle = color
  context.stroke()
  return context.getImageData(0, 0, VESSEL_SPRITE_SIZE_PX, VESSEL_SPRITE_SIZE_PX)
}

/**
 * A vessel with no reported course — the pill's filled dot, in the family
 * colour. Rotation-free, so it never points a direction the vessel did not send.
 */
export function createVesselDot(color = '#39d5ff', scale = 1): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = VESSEL_SPRITE_SIZE_PX
  const context = canvas.getContext('2d')!
  const centre = VESSEL_SPRITE_SIZE_PX / 2
  const unit = (VESSEL_SPRITE_SIZE_PX / 12) * 0.62 * scale
  context.beginPath()
  context.arc(centre, centre, 3.5 * unit, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()
  return context.getImageData(0, 0, VESSEL_SPRITE_SIZE_PX, VESSEL_SPRITE_SIZE_PX)
}
