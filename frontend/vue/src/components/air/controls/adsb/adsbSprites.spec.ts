import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createRadarBlip,
  createBracket,
  createMilBracket,
  createTowerBlip,
  createGroundVehicleBlip,
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
}

let lastContext: RecordingContext

function createRecordingContext(): RecordingContext {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    stroke: vi.fn(),
    getImageData: vi.fn(() => sentinelImageData),
  }
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
  it('strokes a ring in the default colour and scale', () => {
    expect(createGroundVehicleBlip()).toBe(sentinelImageData)
    expect(lastContext.strokeStyle).toBe('#ffffff')
    expect(lastContext.lineWidth).toBeCloseTo(3 * 1.1)
    expect(lastContext.arc).toHaveBeenCalledWith(32, 32, 9 * 1.1, 0, Math.PI * 2)
    expect(lastContext.stroke).toHaveBeenCalled()
  })

  it('uses the supplied colour', () => {
    createGroundVehicleBlip('#abcabc')
    expect(lastContext.strokeStyle).toBe('#abcabc')
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
