import { describe, expect, it } from 'vitest'
import {
  buildAircraftSilhouette,
  renderSilhouetteSvg,
  silhouetteImageSidePx,
  silhouetteLengthPx,
  silhouetteSvgFrame,
  type AircraftSilhouette,
} from './aircraftSilhouette'
import { AIRCRAFT_FAMILIES, AIRCRAFT_FAMILY_IDS } from './aircraftFamilies'

/** Every (x, y) point in a path's data. */
function pathPoints(pathData: string): Array<{ x: number; y: number }> {
  const numbers = pathData.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const points: Array<{ x: number; y: number }> = []
  for (let index = 0; index < numbers.length; index += 2) {
    points.push({ x: numbers[index]!, y: numbers[index + 1]! })
  }
  return points
}

/** Width and height of a path's points. */
function pathSize(pathData: string) {
  const points = pathPoints(pathData)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

/** A hand-made silhouette, for the sizing functions that take one. */
function fakeSilhouette(boundingRadius: number, extentMetres: number): AircraftSilhouette {
  return { familyId: 'narrowbodyTwin', pathData: 'M0 0L1 0 1 1Z', boundingRadius, extentMetres }
}

describe('buildAircraftSilhouette', () => {
  it('draws every family as one closed subpath per part', () => {
    for (const familyId of AIRCRAFT_FAMILY_IDS) {
      const silhouette = buildAircraftSilhouette(familyId)
      expect(silhouette.familyId).toBe(familyId)
      expect(silhouette.pathData, familyId).toMatch(/^(M[^MZ]+Z)+$/)
    }
  })

  it('centres the drawing on its bounding box, so it turns about its middle', () => {
    const bounds = pathSize(buildAircraftSilhouette('narrowbodyTwin').pathData)
    expect(bounds.minX).toBeCloseTo(-bounds.maxX, 1)
    expect(bounds.minY).toBeCloseTo(-bounds.maxY, 1)
  })

  it('reports its larger dimension as its extent', () => {
    const silhouette = buildAircraftSilhouette('narrowbodyTwin')
    const bounds = pathSize(silhouette.pathData)
    expect(silhouette.extentMetres).toBeCloseTo(Math.max(bounds.width, bounds.height), 1)
  })

  it('reports the farthest point from the centre as its bounding radius', () => {
    const silhouette = buildAircraftSilhouette('helicopter')
    const farthest = Math.max(
      ...pathPoints(silhouette.pathData).map((point) => Math.hypot(point.x, point.y)),
    )
    expect(silhouette.boundingRadius).toBeCloseTo(farthest, 1)
    expect(silhouette.boundingRadius).toBeGreaterThanOrEqual(silhouette.extentMetres / 2)
  })

  it('stretches length and span independently to a type’s dimensions', () => {
    const family = AIRCRAFT_FAMILIES.narrowbodyTwin
    const reference = pathSize(buildAircraftSilhouette('narrowbodyTwin').pathData)
    const stretched = pathSize(
      buildAircraftSilhouette('narrowbodyTwin', {
        length: family.referenceLength * 2,
        span: family.referenceSpan,
      }).pathData,
    )
    expect(stretched.height).toBeCloseTo(reference.height * 2, 0)
    expect(stretched.width).toBeCloseTo(reference.width, 1)
  })

  it('writes coordinates to the centimetre, never as -0', () => {
    const { pathData } = buildAircraftSilhouette('balloon')
    expect(pathData).not.toMatch(/\d\.\d{3}/)
    expect(pathData).not.toMatch(/(^|[ ML])-0([ LZ]|$)/)
  })
})

describe('silhouetteLengthPx', () => {
  it('draws an 11 m aircraft at 21px and an 80 m one at 32px', () => {
    expect(silhouetteLengthPx(11)).toBeCloseTo(21)
    expect(silhouetteLengthPx(80)).toBeCloseTo(32)
  })

  it('scales logarithmically between the two', () => {
    // The geometric mean of 11 and 80 sits halfway along a log scale.
    expect(silhouetteLengthPx(Math.sqrt(11 * 80))).toBeCloseTo(26.5)
    expect(silhouetteLengthPx(37.6)).toBeGreaterThan(silhouetteLengthPx(11.0))
    expect(silhouetteLengthPx(37.6)).toBeLessThan(silhouetteLengthPx(70.7))
  })

  it('clamps sizes outside the range to its ends', () => {
    expect(silhouetteLengthPx(2)).toBe(21)
    expect(silhouetteLengthPx(400)).toBe(32)
  })

  it.each([0, -5, Number.NaN])('gives %f m the small end', (extentMetres) => {
    expect(silhouetteLengthPx(extentMetres)).toBe(21)
  })
})

describe('silhouetteImageSidePx', () => {
  it('fits the bounding circle at the drawn length, plus the outline on each side', () => {
    // 80 m long → 32px; a 50 m radius is 100 m across → 40px, plus 2 × 1px outline.
    expect(silhouetteImageSidePx(fakeSilhouette(50, 80), 1)).toBe(42)
  })

  it('rounds to whole pixels', () => {
    expect(Number.isInteger(silhouetteImageSidePx(fakeSilhouette(23.3, 37.6), 1))).toBe(true)
  })

  it('gives a drawing with no extent the plain small length', () => {
    expect(silhouetteImageSidePx(fakeSilhouette(0, 0), 1)).toBe(23)
  })
})

describe('silhouetteSvgFrame', () => {
  it('grows the view box so the body plus its outline fills the square', () => {
    // A 10 m radius in a 22px square with a 1px outline: the body gets 20px,
    // so the view side is 20 m × 22 / 20 = 22 m and 1px is 1 m.
    expect(silhouetteSvgFrame(fakeSilhouette(10, 20), 1, 22)).toEqual({
      viewBox: '-11 -11 22 22',
      outlineStrokeWidth: '2',
    })
  })

  it('never divides by a body of zero pixels', () => {
    const frame = silhouetteSvgFrame(fakeSilhouette(10, 20), 5, 4)
    expect(frame.viewBox).toBe('-40 -40 80 80')
  })
})

describe('renderSilhouetteSvg', () => {
  const silhouette = fakeSilhouette(10, 20)
  const options = {
    fillColour: '#00aaff',
    outlineColour: '#000000',
    outlineWidthPx: 1,
    sizePx: 22,
  }

  it('draws the outline path under the coloured body, in a square of the given size', () => {
    const svg = renderSilhouetteSvg(silhouette, options)
    expect(svg).toContain('width="22" height="22" viewBox="-11 -11 22 22"')
    expect(svg).toMatch(
      /<path d="M0 0L1 0 1 1Z" fill="#000000" stroke="#000000" stroke-width="2"[^>]*\/><path d="M0 0L1 0 1 1Z" fill="#00aaff"\/>/,
    )
  })

  it('leaves an unrotated drawing without a transform', () => {
    expect(renderSilhouetteSvg(silhouette, options)).toContain('<g>')
  })

  it('turns the drawing to the given rotation', () => {
    expect(renderSilhouetteSvg(silhouette, { ...options, rotationDeg: 135 })).toContain(
      '<g transform="rotate(135)">',
    )
  })
})
