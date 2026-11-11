import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRadarBlip,
  createBracket,
  createMilBracket,
  createTowerBlip,
  createGroundVehicleBlip,
  GROUND_VEHICLE_SPRITE_PX,
  createUAVBlip,
} from './adsbSprites'

// jsdom does not implement canvas 2D rendering, so stub getContext with a
// recording fake context. Drawing calls are captured for geometry/colour
// assertions, and getImageData returns a sentinel so we can prove each factory
// returns exactly what the context produced.
const sentinelImageData = { data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 }

interface RecordingContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: string
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  closePath: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  fillRect: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  getImageData: ReturnType<typeof vi.fn>
  /** `fillStyle` at each `fill()` call, in order. */
  fillsInOrder: string[]
}

let lastContext: RecordingContext

function createRecordingContext(): RecordingContext {
  const context: RecordingContext = {
    fillsInOrder: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => {
      context.fillsInOrder.push(context.fillStyle)
    }),
    fillRect: vi.fn(),
    stroke: vi.fn(),
    getImageData: vi.fn(() => sentinelImageData),
  }
  return context
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    lastContext = createRecordingContext()
    return lastContext as unknown as CanvasRenderingContext2D
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createRadarBlip', () => {
  it('returns the ImageData captured from the context over a 64×64 region', () => {
    expect(createRadarBlip()).toBe(sentinelImageData)
    expect(lastContext.getImageData).toHaveBeenCalledWith(0, 0, 64, 64)
  })

  it('defaults to a white fill', () => {
    createRadarBlip()
    expect(lastContext.fillStyle).toBe('#ffffff')
  })

  it('uses the supplied fill colour', () => {
    createRadarBlip('#ff0000')
    expect(lastContext.fillStyle).toBe('#ff0000')
  })

  it('places the arrow apex at the canvas centre regardless of scale', () => {
    createRadarBlip('#fff', 2)
    // Apex is the canvas centre (32,32); scaling around the centre leaves it fixed.
    expect(lastContext.moveTo).toHaveBeenCalledWith(32, 32)
  })

  it('scales the base vertices outward around the centre', () => {
    createRadarBlip('#fff', 2)
    // bottomRight at scale 1 = (cx+9, cy+23) = (41,55); at scale 2 = (50,78).
    expect(lastContext.lineTo).toHaveBeenCalledWith(50, 78)
    // bottomLeft at scale 2 = (cx-9*2, cy+23*2) = (14,78).
    expect(lastContext.lineTo).toHaveBeenCalledWith(14, 78)
  })
})

describe('createBracket', () => {
  it('defaults to the #c8ff00 highlight colour for the stroke', () => {
    createBracket()
    expect(lastContext.strokeStyle).toBe('#c8ff00')
  })

  it('uses the supplied stroke colour', () => {
    createBracket('#00ffff')
    expect(lastContext.strokeStyle).toBe('#00ffff')
  })

  it('fills a translucent backing rectangle and strokes four corner brackets', () => {
    createBracket()
    expect(lastContext.fillStyle).toBe('rgba(0, 0, 0, 0.10)')
    expect(lastContext.fillRect).toHaveBeenCalledWith(4, 4, 56, 52)
    // One stroke per corner.
    expect(lastContext.stroke).toHaveBeenCalledTimes(4)
  })

  it('returns the captured ImageData', () => {
    expect(createBracket()).toBe(sentinelImageData)
  })
})

describe('createMilBracket', () => {
  it('draws the bracket in the military highlight colour', () => {
    expect(createMilBracket()).toBe(sentinelImageData)
    expect(lastContext.strokeStyle).toBe('#c8ff00')
  })
})

describe('createTowerBlip', () => {
  it('draws a filled white circle scaled from the default 1.1 radius', () => {
    expect(createTowerBlip()).toBe(sentinelImageData)
    expect(lastContext.fillStyle).toBe('#ffffff')
    expect(lastContext.arc).toHaveBeenCalledWith(32, 32, 9 * 1.1, 0, Math.PI * 2)
    expect(lastContext.fill).toHaveBeenCalled()
  })

  it('honours a custom scale', () => {
    createTowerBlip(2)
    expect(lastContext.arc).toHaveBeenCalledWith(32, 32, 18, 0, Math.PI * 2)
  })
})

describe('createGroundVehicleBlip', () => {
  // Design-grid units to canvas pixels: 22 CSS px per 18 units, on a 64px
  // canvas the map shows 24 CSS px across (pixel ratio 2, icon size 0.75).
  const unit = (22 / 18) * (64 / 24)
  const toCanvas = (x: number, y: number) => [32 + (x - 8.75) * unit, 32 + (y - 10.45) * unit]

  it('is drawn at 22 CSS pixels across its design grid', () => {
    expect(GROUND_VEHICLE_SPRITE_PX).toBe(22)
  })

  it('returns the captured ImageData over the shared 64×64 canvas', () => {
    expect(createGroundVehicleBlip()).toBe(sentinelImageData)
    expect(lastContext.getImageData).toHaveBeenCalledWith(0, 0, 64, 64)
  })

  it('fills the body in the given colour, then dark wheels, then the windscreen tint', () => {
    createGroundVehicleBlip('#abcabc')
    expect(lastContext.fillsInOrder).toEqual([
      '#abcabc',
      '#222222',
      '#222222',
      'rgba(0, 0, 0, 0.55)',
    ])
  })

  it('defaults the body to white', () => {
    createGroundVehicleBlip()
    expect(lastContext.fillsInOrder[0]).toBe('#ffffff')
  })

  it('outlines the body and both wheels in black, one design unit thick', () => {
    createGroundVehicleBlip('#abcabc')
    expect(lastContext.strokeStyle).toBe('#000000')
    expect(lastContext.lineWidth).toBeCloseTo(unit)
    expect(lastContext.stroke).toHaveBeenCalledTimes(3)
  })

  it('places the body outline on the design grid, centred on the canvas', () => {
    createGroundVehicleBlip()
    const [startX, startY] = toCanvas(1.5, 12.5)
    expect(lastContext.moveTo.mock.calls[0]![0]).toBeCloseTo(startX!)
    expect(lastContext.moveTo.mock.calls[0]![1]).toBeCloseTo(startY!)
    // Seven body corners: one moveTo, six lineTo, then the windscreen's four.
    expect(lastContext.lineTo).toHaveBeenCalledTimes(6 + 3)
    expect(lastContext.closePath).toHaveBeenCalledTimes(2)
  })

  it('draws the two wheels as full circles at their design positions', () => {
    createGroundVehicleBlip()
    expect(lastContext.arc).toHaveBeenCalledTimes(2)
    const expectedCentres = [toCanvas(4.2, 13.4), toCanvas(13.2, 13.4)]
    lastContext.arc.mock.calls.forEach((call, index) => {
      expect(call[0]).toBeCloseTo(expectedCentres[index]![0]!)
      expect(call[1]).toBeCloseTo(expectedCentres[index]![1]!)
      expect(call[2]).toBeCloseTo(2 * unit)
      expect(call.slice(3)).toEqual([0, Math.PI * 2])
    })
  })

  it('stays inside the canvas, outline included', () => {
    createGroundVehicleBlip()
    const points = [
      ...lastContext.moveTo.mock.calls,
      ...lastContext.lineTo.mock.calls,
    ] as number[][]
    const halfLine = unit / 2
    for (const [x, y] of points) {
      expect(x! - halfLine).toBeGreaterThanOrEqual(0)
      expect(x! + halfLine).toBeLessThanOrEqual(64)
      expect(y! - halfLine).toBeGreaterThanOrEqual(0)
      expect(y! + halfLine).toBeLessThanOrEqual(64)
    }
    for (const [x, y, radius] of lastContext.arc.mock.calls as number[][]) {
      expect(y! + radius! + halfLine).toBeLessThanOrEqual(64)
      expect(x! - radius! - halfLine).toBeGreaterThanOrEqual(0)
      expect(x! + radius! + halfLine).toBeLessThanOrEqual(64)
    }
  })
})

describe('createUAVBlip', () => {
  it('returns the captured ImageData', () => {
    expect(createUAVBlip()).toBe(sentinelImageData)
  })

  it('fills the triangle body in the supplied colour and strokes a black crosshair', () => {
    createUAVBlip('#123456')
    // strokeStyle is left as black (the crosshair) after the body fill.
    expect(lastContext.strokeStyle).toBe('#000000')
    expect(lastContext.fill).toHaveBeenCalled()
    expect(lastContext.stroke).toHaveBeenCalled()
    expect(lastContext.closePath).toHaveBeenCalled()
  })

  it('draws the triangle apex above the centre at the default scale', () => {
    createUAVBlip()
    // Vertices: apex (32,19), bottom-right (41,42), bottom-left (23,42); centroid
    // y = (19+42+42)/3 = 34.333. Scaling the apex around the centroid at 1.1:
    // 34.333 + (19 − 34.333) × 1.1 = 17.467. The apex stays on the centre x-axis.
    const apexCall = lastContext.moveTo.mock.calls[0]!
    expect(apexCall[0]).toBeCloseTo(32)
    expect(apexCall[1]).toBeCloseTo(17.467, 2)
  })
})
