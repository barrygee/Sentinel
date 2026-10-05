import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createVesselArrow, createVesselDot, VESSEL_SPRITE_SIZE_PX } from './vesselSprites'

// jsdom has no canvas: stand in a recording 2D context so the sprites' shape
// and colour decisions can be asserted.
interface RecordingContext {
  calls: string[]
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineJoin: string
  globalAlpha: number
}

function installCanvasRecorder(): RecordingContext {
  const context: RecordingContext & Record<string, unknown> = {
    calls: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    globalAlpha: 1,
  }
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc']) {
    context[method] = vi.fn((...args: unknown[]) => {
      context.calls.push(
        `${method}(${args.map((arg) => (typeof arg === 'number' ? arg.toFixed(1) : String(arg))).join(',')})`,
      )
    })
  }
  context.getImageData = vi.fn((x: number, y: number, w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  return context
}

describe('vesselSprites', () => {
  let context: RecordingContext
  beforeEach(() => {
    context = installCanvasRecorder()
  })

  it('draws the hollow arrowhead of the label glyph, stroked in the family colour', () => {
    const image = createVesselArrow('#ff6a13')
    expect(image.width).toBe(VESSEL_SPRITE_SIZE_PX)
    expect(context.strokeStyle).toBe('#ff6a13')
    expect(context.lineJoin).toBe('round')
    // Four corners of the glyph's polygon, closed, stroked and never filled.
    expect(context.calls.filter((call) => call.startsWith('lineTo'))).toHaveLength(3)
    expect(context.calls).toContain('closePath()')
    expect(context.calls).toContain('stroke()')
    expect(context.calls).not.toContain('fill()')
    // The tip sits above the canvas centre so rotation turns it about the position.
    const [tipX, tipY] = context.calls[1]!.match(/[\d.]+/g)!.map(Number)
    expect(tipX).toBeCloseTo(VESSEL_SPRITE_SIZE_PX / 2, 0)
    expect(tipY).toBeLessThan(VESSEL_SPRITE_SIZE_PX / 2)
  })

  it('scales the arrow with the scale argument', () => {
    createVesselArrow('#fff', 1)
    const baseWidth = context.lineWidth
    createVesselArrow('#fff', 2)
    expect(context.lineWidth).toBeCloseTo(baseWidth * 2)
  })

  it('draws a filled dot for a vessel without a course', () => {
    createVesselDot('#39d5ff')
    expect(context.fillStyle).toBe('#39d5ff')
    expect(context.calls.some((call) => call.startsWith('arc('))).toBe(true)
    expect(context.calls).toContain('fill()')
    expect(context.calls).not.toContain('stroke()')
  })
})
