// Canvas sprite factories for AdsbLiveControl. Pure: no `this`, no map state.

export function createRadarBlip(color = '#ffffff', scale = 1): ImageData {
    const canvasSize = 64, cx = canvasSize / 2, cy = canvasSize / 2
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = canvasSize
    const ctx = canvas.getContext('2d')!
    // Apex at canvas center so the coordinate pin is exactly at the arrow tip.
    // Base extends downward; scale applied around canvas center.
    const h = 23, halfW = 9
    const s = (p: { x: number; y: number }) => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale })
    const apex        = s({ x: cx,         y: cy          })
    const bottomRight = s({ x: cx + halfW, y: cy + h      })
    const bottomLeft  = s({ x: cx - halfW, y: cy + h      })
    ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(bottomRight.x, bottomRight.y); ctx.lineTo(bottomLeft.x, bottomLeft.y)
    ctx.closePath(); ctx.fillStyle = color; ctx.fill()
    return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

// Shared corner-bracket drawer used by both the standard and military bracket sprites.
function drawBracket(ctx: CanvasRenderingContext2D, color: string): void {
    const left = 4, top = 4, right = 60, bottom = 56, cornerArmLength = 10
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)'
    ctx.fillRect(left, top, right - left, bottom - top)
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'square'
    ctx.beginPath(); ctx.moveTo(left + cornerArmLength, top);    ctx.lineTo(left,  top);    ctx.lineTo(left,  top    + cornerArmLength); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(right - cornerArmLength, top);   ctx.lineTo(right, top);    ctx.lineTo(right, top    + cornerArmLength); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(left + cornerArmLength, bottom);  ctx.lineTo(left,  bottom); ctx.lineTo(left,  bottom - cornerArmLength); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(right - cornerArmLength, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - cornerArmLength); ctx.stroke()
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
    ctx.beginPath(); ctx.arc(canvasSize / 2, canvasSize / 2, 9 * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'; ctx.fill()
    return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

export function createGroundVehicleBlip(color = '#ffffff', scale = 1.1): ImageData {
    const canvasSize = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = canvasSize
    const ctx = canvas.getContext('2d')!
    ctx.beginPath(); ctx.arc(canvasSize / 2, canvasSize / 2, 9 * scale, 0, Math.PI * 2)
    ctx.strokeStyle = color; ctx.lineWidth = 3 * scale; ctx.stroke()
    return ctx.getImageData(0, 0, canvasSize, canvasSize)
}

export function createUAVBlip(color = '#ffffff', scale = 1.1): ImageData {
    const canvasSize = 64, centerX = canvasSize / 2, centerY = canvasSize / 2
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = canvasSize
    const ctx = canvas.getContext('2d')!
    const apexVertex        = { x: centerX,     y: centerY - 13 }
    const bottomRightVertex = { x: centerX + 9, y: centerY + 10 }
    const bottomLeftVertex  = { x: centerX - 9, y: centerY + 10 }
    const triangleCentroidX = (apexVertex.x + bottomRightVertex.x + bottomLeftVertex.x) / 3
    const triangleCentroidY = (apexVertex.y + bottomRightVertex.y + bottomLeftVertex.y) / 3
    const scaleFromCentroid = (v: { x: number; y: number }) => ({
        x: triangleCentroidX + (v.x - triangleCentroidX) * scale,
        y: triangleCentroidY + (v.y - triangleCentroidY) * scale,
    })
    const scaledApex        = scaleFromCentroid(apexVertex)
    const scaledBottomRight = scaleFromCentroid(bottomRightVertex)
    const scaledBottomLeft  = scaleFromCentroid(bottomLeftVertex)
    ctx.beginPath(); ctx.moveTo(scaledApex.x, scaledApex.y); ctx.lineTo(scaledBottomRight.x, scaledBottomRight.y); ctx.lineTo(scaledBottomLeft.x, scaledBottomLeft.y)
    ctx.closePath(); ctx.fillStyle = color; ctx.fill()
    const crosshairHalfSize = 4.5 * scale
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(triangleCentroidX - crosshairHalfSize, triangleCentroidY - crosshairHalfSize); ctx.lineTo(triangleCentroidX + crosshairHalfSize, triangleCentroidY + crosshairHalfSize)
    ctx.moveTo(triangleCentroidX + crosshairHalfSize, triangleCentroidY - crosshairHalfSize); ctx.lineTo(triangleCentroidX - crosshairHalfSize, triangleCentroidY + crosshairHalfSize)
    ctx.stroke()
    return ctx.getImageData(0, 0, canvasSize, canvasSize)
}
