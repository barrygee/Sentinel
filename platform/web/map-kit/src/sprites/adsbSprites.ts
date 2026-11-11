// Canvas sprite factories for AdsbLiveControl. Pure: no `this`, no map state.

export function createRadarBlip(color = '#ffffff', scale = 1): ImageData {
  const canvasSize = 64,
    cx = canvasSize / 2,
    cy = canvasSize / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!
  // Apex at canvas center so the coordinate pin is exactly at the arrow tip.
  // Base extends downward; scale applied around canvas center.
  const h = 23,
    halfW = 9
  const s = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale,
  })
  const apex = s({ x: cx, y: cy })
  const bottomRight = s({ x: cx + halfW, y: cy + h })
  const bottomLeft = s({ x: cx - halfW, y: cy + h })
  ctx.beginPath()
  ctx.moveTo(apex.x, apex.y)
  ctx.lineTo(bottomRight.x, bottomRight.y)
  ctx.lineTo(bottomLeft.x, bottomLeft.y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

// Shared corner-bracket drawer used by both the standard and military bracket sprites.
function drawBracket(ctx: CanvasRenderingContext2D, color: string): void {
  const left = 4,
    top = 4,
    right = 60,
    bottom = 56,
    cornerArmLength = 10
  ctx.fillStyle = 'rgba(0, 0, 0, 0.10)'
  ctx.fillRect(left, top, right - left, bottom - top)
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'square'
  ctx.beginPath()
  ctx.moveTo(left + cornerArmLength, top)
  ctx.lineTo(left, top)
  ctx.lineTo(left, top + cornerArmLength)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(right - cornerArmLength, top)
  ctx.lineTo(right, top)
  ctx.lineTo(right, top + cornerArmLength)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(left + cornerArmLength, bottom)
  ctx.lineTo(left, bottom)
  ctx.lineTo(left, bottom - cornerArmLength)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(right - cornerArmLength, bottom)
  ctx.lineTo(right, bottom)
  ctx.lineTo(right, bottom - cornerArmLength)
  ctx.stroke()
}

export function createBracket(color = '#c8ff00'): ImageData {
  const canvasSize = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!
  drawBracket(ctx, color)
  return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

export function createMilBracket(): ImageData {
  return createBracket('#c8ff00')
}

export function createTowerBlip(scale = 1.1): ImageData {
  const canvasSize = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(canvasSize / 2, canvasSize / 2, 9 * scale, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

/**
 * The airport-tug outline shared by the map sprite and the label glyph, in an
 * 18-unit design grid (side view, facing right): a long low deck with the cab at
 * the front, two wheels and a windscreen. Side-on, so it never needs rotating:
 * a surface vehicle's reported track is not a heading worth showing.
 */
const GROUND_VEHICLE_BODY: ReadonlyArray<readonly [number, number]> = [
  [1.5, 12.5],
  [1.5, 9.5],
  [11.5, 9.5],
  [11.5, 5.5],
  [15, 5.5],
  [16, 7.5],
  [16, 12.5],
]
const GROUND_VEHICLE_WHEELS: ReadonlyArray<readonly [number, number]> = [
  [4.2, 13.4],
  [13.2, 13.4],
]
const GROUND_VEHICLE_WHEEL_RADIUS = 2
const GROUND_VEHICLE_WINDSCREEN: ReadonlyArray<readonly [number, number]> = [
  [12.2, 6.4],
  [14.5, 6.4],
  [15.1, 8],
  [12.2, 8],
]
/** The centre of the drawing (outline included), placed on the vehicle's position. */
const GROUND_VEHICLE_CENTRE = { x: 8.75, y: 10.45 }

/**
 * Size of the ground-vehicle sprite on the map, in CSS pixels across its design
 * grid: a little larger than a light aircraft's silhouette, so a vehicle reads
 * as one beside the planes.
 */
export const GROUND_VEHICLE_SPRITE_PX = 22

/**
 * The ground-vehicle (airport tug) map sprite: the body in `color` with a black
 * outline, dark wheels and a tinted windscreen, like the aircraft silhouettes.
 *
 * Drawn on the 64px canvas every ADS-B sprite uses, which the map shows at
 * pixel ratio 2 and icon size 0.75 (24 CSS pixels across).
 *
 * @param color - Body colour: the service or emergency colour for the basemap.
 */
export function createGroundVehicleBlip(color = '#ffffff'): ImageData {
  const canvasSize = 64
  const canvasPxPerCssPx = canvasSize / ((canvasSize / 2) * 0.75)
  const unit = (GROUND_VEHICLE_SPRITE_PX / 18) * canvasPxPerCssPx
  const toCanvas = ([x, y]: readonly [number, number]): [number, number] => [
    canvasSize / 2 + (x - GROUND_VEHICLE_CENTRE.x) * unit,
    canvasSize / 2 + (y - GROUND_VEHICLE_CENTRE.y) * unit,
  ]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!
  const tracePolygon = (points: ReadonlyArray<readonly [number, number]>) => {
    ctx.beginPath()
    points.forEach((point, index) => {
      const [x, y] = toCanvas(point)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = unit
  ctx.lineJoin = 'round'
  tracePolygon(GROUND_VEHICLE_BODY)
  ctx.fillStyle = color
  ctx.fill()
  ctx.stroke()
  for (const wheel of GROUND_VEHICLE_WHEELS) {
    const [x, y] = toCanvas(wheel)
    ctx.beginPath()
    ctx.arc(x, y, GROUND_VEHICLE_WHEEL_RADIUS * unit, 0, Math.PI * 2)
    ctx.fillStyle = '#222222'
    ctx.fill()
    ctx.stroke()
  }
  tracePolygon(GROUND_VEHICLE_WINDSCREEN)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fill()
  return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

export function createUAVBlip(color = '#ffffff', scale = 1.1): ImageData {
  const canvasSize = 64,
    centerX = canvasSize / 2,
    centerY = canvasSize / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!
  const apexVertex = { x: centerX, y: centerY - 13 }
  const bottomRightVertex = { x: centerX + 9, y: centerY + 10 }
  const bottomLeftVertex = { x: centerX - 9, y: centerY + 10 }
  const triangleCentroidX = (apexVertex.x + bottomRightVertex.x + bottomLeftVertex.x) / 3
  const triangleCentroidY = (apexVertex.y + bottomRightVertex.y + bottomLeftVertex.y) / 3
  const scaleFromCentroid = (v: { x: number; y: number }) => ({
    x: triangleCentroidX + (v.x - triangleCentroidX) * scale,
    y: triangleCentroidY + (v.y - triangleCentroidY) * scale,
  })
  const scaledApex = scaleFromCentroid(apexVertex)
  const scaledBottomRight = scaleFromCentroid(bottomRightVertex)
  const scaledBottomLeft = scaleFromCentroid(bottomLeftVertex)
  ctx.beginPath()
  ctx.moveTo(scaledApex.x, scaledApex.y)
  ctx.lineTo(scaledBottomRight.x, scaledBottomRight.y)
  ctx.lineTo(scaledBottomLeft.x, scaledBottomLeft.y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  const crosshairHalfSize = 4.5 * scale
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(triangleCentroidX - crosshairHalfSize, triangleCentroidY - crosshairHalfSize)
  ctx.lineTo(triangleCentroidX + crosshairHalfSize, triangleCentroidY + crosshairHalfSize)
  ctx.moveTo(triangleCentroidX + crosshairHalfSize, triangleCentroidY - crosshairHalfSize)
  ctx.lineTo(triangleCentroidX - crosshairHalfSize, triangleCentroidY + crosshairHalfSize)
  ctx.stroke()
  return ctx.getImageData(0, 0, canvasSize, canvasSize)
}
