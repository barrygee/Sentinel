// Canvas sprite factories for AisVesselsControl. Pure: no `this`, no map state.
// Mirrors adsbSprites.ts so the Sea map's marks are built the same way as the
// Air map's — a 64px canvas, pinned at its centre, drawn at 2× pixel ratio.

/** Side of the square canvas every sprite is drawn on, in device pixels. */
export const VESSEL_SPRITE_SIZE_PX = 64

/**
 * A vessel chevron: a pointed bow, straight sides and a notched stern, so it
 * reads as a hull rather than an aircraft's arrowhead at a glance. The bow sits
 * at the canvas centre so `icon-rotate` turns it about the reported position.
 */
export function createVesselChevron(color = '#39d5ff', scale = 1): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = VESSEL_SPRITE_SIZE_PX
  const context = canvas.getContext('2d')!
  const centreX = VESSEL_SPRITE_SIZE_PX / 2
  const centreY = VESSEL_SPRITE_SIZE_PX / 2
  const length = 22 * scale
  const halfWidth = 7 * scale
  const notchDepth = 5 * scale
  context.beginPath()
  context.moveTo(centreX, centreY)
  context.lineTo(centreX + halfWidth, centreY + length)
  context.lineTo(centreX, centreY + length - notchDepth)
  context.lineTo(centreX - halfWidth, centreY + length)
  context.closePath()
  context.fillStyle = color
  context.fill()
  // A thin dark outline keeps a light chevron legible over a pale sea fill and
  // separates two hulls that overlap in a busy anchorage.
  context.lineWidth = 1.5
  context.strokeStyle = 'rgba(0, 0, 0, 0.55)'
  context.stroke()
  return context.getImageData(0, 0, VESSEL_SPRITE_SIZE_PX, VESSEL_SPRITE_SIZE_PX)
}

/**
 * A moored / anchored vessel: a filled dot with a ring, drawn when the vessel
 * reports no useful course. Rotation-free, so it never points a direction the
 * vessel did not send.
 */
export function createVesselDot(color = '#39d5ff', scale = 1): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = VESSEL_SPRITE_SIZE_PX
  const context = canvas.getContext('2d')!
  const centre = VESSEL_SPRITE_SIZE_PX / 2
  context.beginPath()
  context.arc(centre, centre, 5 * scale, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()
  context.beginPath()
  context.arc(centre, centre, 9 * scale, 0, Math.PI * 2)
  context.lineWidth = 1.5
  context.strokeStyle = color
  context.globalAlpha = 0.55
  context.stroke()
  return context.getImageData(0, 0, VESSEL_SPRITE_SIZE_PX, VESSEL_SPRITE_SIZE_PX)
}
