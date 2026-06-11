import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSatelliteIcon, createSatBracket, buildFootprintFeatures } from './satelliteSprites'

// jsdom does not implement canvas 2D rendering, so stub getContext with a
// recording fake context. Drawing calls are captured for geometry/colour
// assertions, and getImageData returns a sentinel so we can prove each factory
// returns exactly what the context produced.
const sentinelImageData = { data: new Uint8ClampedArray(96 * 96 * 4), width: 96, height: 96 }

interface RecordingContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: string
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  closePath: ReturnType<typeof vi.fn>
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

describe('createSatelliteIcon', () => {
  it('returns the ImageData captured from the context over a 96×96 region', () => {
    expect(createSatelliteIcon()).toBe(sentinelImageData)
    expect(lastContext.getImageData).toHaveBeenCalledWith(0, 0, 96, 96)
  })

  it('draws a white diamond body centred on the canvas', () => {
    createSatelliteIcon()
    // Diamond top vertex at (cx, cy-11) = (48, 37); body fill is white.
    expect(lastContext.moveTo).toHaveBeenCalledWith(48, 37)
    expect(lastContext.lineTo).toHaveBeenCalledWith(57, 48) // right (cx+9, cy)
    expect(lastContext.lineTo).toHaveBeenCalledWith(48, 59) // bottom (cx, cy+11)
    expect(lastContext.lineTo).toHaveBeenCalledWith(39, 48) // left (cx-9, cy)
    expect(lastContext.closePath).toHaveBeenCalled()
  })

  it('draws translucent solar-panel rectangles either side of the body', () => {
    createSatelliteIcon()
    // Left panel (cx-28, cy-4, 15, 8) and right panel (cx+13, cy-4, 15, 8).
    expect(lastContext.fillRect).toHaveBeenCalledWith(20, 44, 15, 8)
    expect(lastContext.fillRect).toHaveBeenCalledWith(61, 44, 15, 8)
  })

  it('strokes the antenna stub above the body', () => {
    createSatelliteIcon()
    // Antenna runs from the diamond top (48,37) up to (48,27).
    expect(lastContext.moveTo).toHaveBeenCalledWith(48, 37)
    expect(lastContext.lineTo).toHaveBeenCalledWith(48, 27)
    expect(lastContext.stroke).toHaveBeenCalled()
  })
})

describe('createSatBracket', () => {
  it('returns the ImageData captured from the context over a 96×96 region', () => {
    expect(createSatBracket()).toBe(sentinelImageData)
    expect(lastContext.getImageData).toHaveBeenCalledWith(0, 0, 96, 96)
  })

  it('fills a translucent backing rectangle and strokes the highlight colour', () => {
    createSatBracket()
    expect(lastContext.fillStyle).toBe('rgba(0,0,0,0.10)')
    // Backing rect from (left, top) spanning right-left × bottom-top = 80 × 80.
    expect(lastContext.fillRect).toHaveBeenCalledWith(8, 8, 80, 80)
    expect(lastContext.strokeStyle).toBe('#c8ff00')
  })

  it('strokes one bracket per corner (four total)', () => {
    createSatBracket()
    expect(lastContext.stroke).toHaveBeenCalledTimes(4)
  })

  it('draws the top-left corner arms from the corner outwards', () => {
    createSatBracket()
    // Top-left corner (8,8) with arm 14: horizontal arm end (22,8), corner (8,8),
    // vertical arm end (8,22).
    expect(lastContext.moveTo).toHaveBeenCalledWith(22, 8)
    expect(lastContext.lineTo).toHaveBeenCalledWith(8, 8)
    expect(lastContext.lineTo).toHaveBeenCalledWith(8, 22)
  })
})

describe('buildFootprintFeatures', () => {
  it('builds a fill feature plus one outline per ring for a Polygon', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ],
    }
    const collection = buildFootprintFeatures(polygon)

    // First feature is the fill (the original geometry).
    expect(collection.features[0]!.geometry).toEqual(polygon)
    // One LineString outline for the single ring.
    const outlines = collection.features.slice(1)
    expect(outlines).toHaveLength(1)
    expect(outlines[0]!.geometry.type).toBe('LineString')
    expect((outlines[0]!.geometry as GeoJSON.LineString).coordinates).toEqual(
      polygon.coordinates[0],
    )
  })

  it('builds an outline per polygon for a MultiPolygon', () => {
    const multi: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
      ],
    }
    const collection = buildFootprintFeatures(multi)
    // Fill feature + two outlines (one per polygon's outer ring).
    expect(collection.features).toHaveLength(3)
    expect(collection.features[0]!.geometry).toEqual(multi)
    expect(collection.features[1]!.geometry.type).toBe('LineString')
    expect(collection.features[2]!.geometry.type).toBe('LineString')
  })

  it('splits a ring into two outline segments at an antimeridian seam', () => {
    // Two consecutive points sitting on the antimeridian (lon ±180) mark the
    // seam; the ring is split there into separate drawable segments.
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [170, 0],
          [180, 10],
          [180, 20],
          [170, 30],
          [160, 0],
        ],
      ],
    }
    const collection = buildFootprintFeatures(polygon)
    const outlines = collection.features.slice(1)
    expect(outlines).toHaveLength(2)
    // First segment runs up to the seam start; second begins at the seam end.
    expect((outlines[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([
      [170, 0],
      [180, 10],
    ])
    expect((outlines[1]!.geometry as GeoJSON.LineString).coordinates).toEqual([
      [180, 20],
      [170, 30],
      [160, 0],
    ])
  })

  it('treats a negative antimeridian (−180) as a seam too', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-170, 0],
          [-180, 10],
          [-180, 20],
          [-170, 30],
        ],
      ],
    }
    const collection = buildFootprintFeatures(polygon)
    expect(collection.features.slice(1)).toHaveLength(2)
  })

  it('drops a trailing segment that is a single point after a seam', () => {
    // The ring ends on the seam, so the final "current" segment has length 1 and
    // must not be emitted as an outline.
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [170, 0],
          [160, 10],
          [180, 20],
          [180, 30],
        ],
      ],
    }
    const collection = buildFootprintFeatures(polygon)
    const outlines = collection.features.slice(1)
    // Only the first three-point segment survives; the lone seam point is dropped.
    expect(outlines).toHaveLength(1)
    expect((outlines[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([
      [170, 0],
      [160, 10],
      [180, 20],
    ])
  })

  it('does not emit a one-point segment when the ring opens on the seam', () => {
    // Two seam points up front split immediately, leaving a length-1 segment that
    // must be discarded; only the later multi-point segment is drawn.
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [180, 0],
          [180, 10],
          [170, 20],
          [160, 30],
        ],
      ],
    }
    const collection = buildFootprintFeatures(polygon)
    const outlines = collection.features.slice(1)
    expect(outlines).toHaveLength(1)
    expect((outlines[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([
      [180, 10],
      [170, 20],
      [160, 30],
    ])
  })

  it('emits no outline when a ring collapses to a single point', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0]]],
    }
    const collection = buildFootprintFeatures(polygon)
    // Fill feature only; the one-point ring yields no drawable segment.
    expect(collection.features).toHaveLength(1)
  })
})
