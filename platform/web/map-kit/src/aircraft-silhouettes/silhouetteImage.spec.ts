import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSilhouetteImageData,
  parseSilhouetteImageId,
  SILHOUETTE_COLOURS,
  SILHOUETTE_FALLBACK_ICON_PX,
  SILHOUETTE_PALETTES,
  silhouetteForShape,
  silhouetteIconSizePx,
  silhouetteImageId,
  silhouetteImageIdForPalette,
  silhouetteRotatesWithTrack,
} from './silhouetteImage'
import { buildAircraftSilhouette, silhouetteImageSidePx } from './aircraftSilhouette'

describe('silhouette image names', () => {
  it('names an image by shape and colour', () => {
    expect(silhouetteImageId('type:A320', 'military')).toBe(
      'aircraft-silhouette:type:A320:military',
    )
  })

  it.each(['civil', 'military', 'emergency'] as const)(
    'reads back a %s name with no palette as the dark map’s',
    (colourKey) => {
      expect(parseSilhouetteImageId(silhouetteImageId('family:glider', colourKey))).toEqual({
        shapeKey: 'family:glider',
        colourKey,
        palette: 'dark',
      })
    },
  )

  it.each(['dark', 'light'] as const)('reads back the %s palette the map layer adds', (palette) => {
    const imageId = silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'military'), palette)
    expect(imageId).toBe(`aircraft-silhouette:type:A320:military:${palette}`)
    expect(parseSilhouetteImageId(imageId)).toEqual({
      shapeKey: 'type:A320',
      colourKey: 'military',
      palette,
    })
  })

  it.each([
    ['another image', 'adsb-blip'],
    ['a name with no colour', 'aircraft-silhouette:'],
    ['a name with no shape', 'aircraft-silhouette::civil'],
    ['an unknown colour', 'aircraft-silhouette:type:A320:purple'],
    ['an unknown colour before a palette', 'aircraft-silhouette:type:A320:purple:light'],
    ['a palette with no colour', 'aircraft-silhouette:light'],
    ['a palette and colour with no shape', 'aircraft-silhouette::civil:light'],
  ])('rejects %s', (_description, imageId) => {
    expect(parseSilhouetteImageId(imageId)).toBeNull()
  })
})

describe('shape lookups', () => {
  it('sizes a type’s icon from its own dimensions', () => {
    const expected = silhouetteImageSidePx(
      buildAircraftSilhouette('narrowbodyTwin', { length: 37.6, span: 35.8 }),
      1,
    )
    expect(silhouetteIconSizePx('type:A320')).toBe(expected)
  })

  it('sizes a family’s icon from its reference drawing', () => {
    expect(silhouetteIconSizePx('family:helicopter')).toBe(
      silhouetteImageSidePx(buildAircraftSilhouette('helicopter'), 1),
    )
  })

  it('draws a bigger aircraft bigger', () => {
    expect(silhouetteIconSizePx('type:B744')).toBeGreaterThan(silhouetteIconSizePx('type:C172'))
  })

  it.each(['type:NOPE', 'family:nope', 'nonsense'])(
    'gives the unknown key %s the fallback size and no drawing',
    (shapeKey) => {
      expect(silhouetteIconSizePx(shapeKey)).toBe(SILHOUETTE_FALLBACK_ICON_PX)
      expect(silhouetteForShape(shapeKey)).toBeNull()
      expect(silhouetteRotatesWithTrack(shapeKey)).toBe(false)
    },
  )

  it('builds each drawing once and reuses it', () => {
    const first = silhouetteForShape('type:B738')
    expect(first?.familyId).toBe('narrowbodyTwin')
    expect(silhouetteForShape('type:B738')).toBe(first)
  })

  it('turns aircraft with their track, but not a balloon drawn side-on', () => {
    expect(silhouetteRotatesWithTrack('type:A320')).toBe(true)
    expect(silhouetteRotatesWithTrack('family:helicopter')).toBe(true)
    expect(silhouetteRotatesWithTrack('family:balloon')).toBe(false)
  })
})

describe('createSilhouetteImageData', () => {
  // jsdom has no canvas rendering or Path2D: a recording context and a Path2D
  // stand-in capture what would be drawn.
  const imageData = { width: 1, height: 1 } as ImageData
  let drawCalls: Array<{ call: string; colour?: string; path?: string }>
  let context: Record<string, unknown>
  let canvasSides: number[]

  class RecordedPath {
    constructor(readonly pathData: string) {}
  }

  beforeEach(() => {
    drawCalls = []
    canvasSides = []
    vi.stubGlobal('Path2D', RecordedPath)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasSides.push(this.width, this.height)
      context = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineJoin: '',
        translate: vi.fn(),
        scale: vi.fn(),
        fill: vi.fn((path: RecordedPath) =>
          drawCalls.push({
            call: 'fill',
            colour: context.fillStyle as string,
            path: path.pathData,
          }),
        ),
        stroke: vi.fn(() =>
          drawCalls.push({ call: 'stroke', colour: context.strokeStyle as string }),
        ),
        getImageData: vi.fn(() => imageData),
      }
      return context as unknown as CanvasRenderingContext2D
    } as unknown as HTMLCanvasElement['getContext'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('draws the black outline first, then the body in the image’s colour', () => {
    expect(createSilhouetteImageData(silhouetteImageId('type:A320', 'military'))).toBe(imageData)
    const pathData = silhouetteForShape('type:A320')!.pathData
    expect(drawCalls).toEqual([
      { call: 'fill', colour: '#000000', path: pathData },
      { call: 'stroke', colour: '#000000' },
      { call: 'fill', colour: SILHOUETTE_COLOURS.military, path: pathData },
    ])
    expect(context.lineJoin).toBe('round')
  })

  it('fills the light map’s silhouettes with its deeper colours', () => {
    const lightImage = silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'civil'), 'light')
    createSilhouetteImageData(lightImage)
    expect(drawCalls.at(-1)).toMatchObject({
      call: 'fill',
      colour: SILHOUETTE_PALETTES.light.civil,
    })
    expect(SILHOUETTE_PALETTES.light.civil).not.toBe(SILHOUETTE_COLOURS.civil)
  })

  it('draws at twice the icon size by default, for high-density screens', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))
    const side = Math.round(silhouetteIconSizePx('type:A320') * 2)
    expect(canvasSides).toEqual([side, side])
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, side, side)
    expect(context.translate).toHaveBeenCalledWith(side / 2, side / 2)
  })

  it('fits the bounding circle inside the outline, with a 1 CSS px outline', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'), 1)
    const side = silhouetteIconSizePx('type:A320')
    const silhouette = silhouetteForShape('type:A320')!
    const metresToPx = (side - 2) / (2 * silhouette.boundingRadius)
    expect(context.scale).toHaveBeenCalledWith(metresToPx, metresToPx)
    // A 2px stroke centred on the edge leaves 1px outside the body.
    expect(context.lineWidth).toBeCloseTo(2 / metresToPx)
  })

  it.each([
    ['a name that is not a silhouette', 'adsb-blip'],
    ['a shape it has no drawing for', 'aircraft-silhouette:type:NOPE:civil'],
  ])('draws nothing for %s', (_description, imageId) => {
    expect(createSilhouetteImageData(imageId)).toBeNull()
    expect(drawCalls).toEqual([])
  })

  it('draws nothing when the browser gives no 2D context', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))).toBeNull()
  })
})
