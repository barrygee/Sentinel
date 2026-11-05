import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSilhouetteImageData,
  parseSilhouetteImageId,
  SILHOUETTE_COLOURS,
  SILHOUETTE_DETAIL_COLOURS,
  SILHOUETTE_DETAIL_INSET_PX,
  SILHOUETTE_FALLBACK_ICON_PX,
  SILHOUETTE_PALETTES,
  silhouetteForShape,
  silhouetteIconSizePx,
  silhouetteImageId,
  silhouetteImageIdForPalette,
  silhouetteRotatesWithTrack,
  silhouetteSideReachPx,
  altitudeColourKey,
  ARROW_COLOURS,
  SILHOUETTE_SELECTED_CIVIL_COLOURS,
  SILHOUETTE_SELECTED_SUFFIX,
} from './silhouetteImage'
import { ALTITUDE_BAND_MAX, altitudeBandColour } from './altitudeColour'
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
        selected: false,
        palette: 'dark',
      })
    },
  )

  it('reads back an altitude colour', () => {
    expect(parseSilhouetteImageId(silhouetteImageId('type:A320', 'alt12'))).toMatchObject({
      colourKey: 'alt12',
      selected: false,
    })
  })

  it('reads back the selected aircraft’s suffix', () => {
    const imageId = silhouetteImageIdForPalette(
      `${silhouetteImageId('type:A320', 'civil')}${SILHOUETTE_SELECTED_SUFFIX}`,
      'light',
    )
    expect(parseSilhouetteImageId(imageId)).toEqual({
      shapeKey: 'type:A320',
      colourKey: 'civil',
      selected: true,
      palette: 'light',
    })
  })

  it.each([`alt${ALTITUDE_BAND_MAX + 1}`, 'altitude', 'alt'])(
    'rejects %s as a colour',
    (colourKey) => {
      expect(parseSilhouetteImageId(`aircraft-silhouette:type:A320:${colourKey}`)).toBeNull()
    },
  )

  it.each(['dark', 'light'] as const)('reads back the %s palette the map layer adds', (palette) => {
    const imageId = silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'military'), palette)
    expect(imageId).toBe(`aircraft-silhouette:type:A320:military:${palette}`)
    expect(parseSilhouetteImageId(imageId)).toEqual({
      shapeKey: 'type:A320',
      colourKey: 'military',
      selected: false,
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

describe('altitudeColourKey', () => {
  it('names the altitude’s band', () => {
    expect(altitudeColourKey(0)).toBe('alt0')
    expect(altitudeColourKey(36_000)).toBe('alt33')
  })
})

describe('colour tables', () => {
  it('keeps arrow mode’s civil blue apart from the silhouettes’ neutral fallback', () => {
    expect(ARROW_COLOURS.civil).toBe('#00aaff')
    expect(SILHOUETTE_COLOURS.civil).not.toBe(ARROW_COLOURS.civil)
  })

  it('uses the app’s lime for military on both maps', () => {
    expect(SILHOUETTE_PALETTES.dark.military).toBe('#c8ff00')
    expect(SILHOUETTE_PALETTES.light.military).toBe('#c8ff00')
  })
})

describe('silhouetteSideReachPx', () => {
  it('is 0 for a shape with no drawing', () => {
    expect(silhouetteSideReachPx('type:NOPE', 90, 'right')).toBe(0)
  })

  it('reaches further across a wingspan than along the nose-to-side of a turned aircraft', () => {
    // A Cessna spans more than it is long, so heading north its wing is the reach.
    const across = silhouetteSideReachPx('type:C172', 0, 'right')
    const along = silhouetteSideReachPx('type:C172', 90, 'right')
    expect(across).toBeGreaterThan(along)
  })

  it('mirrors a symmetrical aircraft heading north', () => {
    expect(silhouetteSideReachPx('type:A320', 0, 'left')).toBeCloseTo(
      silhouetteSideReachPx('type:A320', 0, 'right'),
    )
  })

  it('turns with the aircraft: the nose leads on the side it heads towards', () => {
    expect(silhouetteSideReachPx('type:A320', 90, 'right')).toBeGreaterThan(
      silhouetteSideReachPx('type:A320', 90, 'left') - 1,
    )
    expect(silhouetteSideReachPx('type:A320', 90, 'right')).toBeCloseTo(
      silhouetteSideReachPx('type:A320', 270, 'left'),
    )
  })

  it('stays inside the icon', () => {
    for (let track = 0; track < 360; track += 30) {
      expect(silhouetteSideReachPx('type:A320', track, 'right')).toBeLessThan(
        silhouetteIconSizePx('type:A320') / 2 + 1,
      )
    }
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
    // The body, detail and interior canvases share one context, so a test sees
    // every draw in order.
    let contextReady = false
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasSides.push(this.width, this.height)
      if (contextReady) return context as unknown as CanvasRenderingContext2D
      contextReady = true
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
        drawImage: vi.fn(),
        setTransform: vi.fn(),
        getImageData: vi.fn(() => imageData),
      }
      return context as unknown as CanvasRenderingContext2D
    } as unknown as HTMLCanvasElement['getContext'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('thickens the body in the image’s colour, then traces its parts with the faint line', () => {
    expect(createSilhouetteImageData(silhouetteImageId('type:A320', 'military'))).toBe(imageData)
    const pathData = silhouetteForShape('type:A320')!.pathData
    expect(drawCalls).toEqual([
      { call: 'fill', colour: SILHOUETTE_COLOURS.military, path: pathData },
      { call: 'stroke', colour: SILHOUETTE_COLOURS.military },
      { call: 'stroke', colour: SILHOUETTE_DETAIL_COLOURS.dark },
    ])
    expect(context.lineJoin).toBe('round')
  })

  it('fills the light map’s silhouettes with its deeper colours', () => {
    const lightImage = silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'civil'), 'light')
    createSilhouetteImageData(lightImage)
    expect(drawCalls[0]).toMatchObject({
      call: 'fill',
      colour: SILHOUETTE_PALETTES.light.civil,
    })
    expect(SILHOUETTE_PALETTES.light.civil).not.toBe(SILHOUETTE_COLOURS.civil)
  })

  it.each([
    ['civil', 'dark'],
    ['civil', 'light'],
    ['alt10', 'dark'],
    ['alt10', 'light'],
  ] as const)('draws a selected %s aircraft in the %s selected colour', (colourKey, palette) => {
    const selected = `${silhouetteImageId('type:A320', colourKey)}${SILHOUETTE_SELECTED_SUFFIX}`
    createSilhouetteImageData(silhouetteImageIdForPalette(selected, palette))
    expect(drawCalls[0]!.colour).toBe(SILHOUETTE_SELECTED_CIVIL_COLOURS[palette])
  })

  it.each(['military', 'emergency'] as const)('keeps a selected %s aircraft’s colour', (key) => {
    createSilhouetteImageData(`${silhouetteImageId('type:A320', key)}${SILHOUETTE_SELECTED_SUFFIX}`)
    expect(drawCalls[0]!.colour).toBe(SILHOUETTE_COLOURS[key])
  })

  it('draws an altitude band in its ramp colour', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'alt10'))
    expect(drawCalls[0]!.colour).toBe(altitudeBandColour(10, 'dark'))
  })

  it('draws at three times the icon size by default, so rotating it stays sharp', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))
    const side = Math.round(silhouetteIconSizePx('type:A320') * 3)
    expect(canvasSides.slice(0, 2)).toEqual([side, side])
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, side, side)
    expect(context.translate).toHaveBeenCalledWith(side / 2, side / 2)
  })

  it('fits the bounding circle inside a 1 CSS px margin, with a half-pixel detail line', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'), 1)
    const side = silhouetteIconSizePx('type:A320')
    const silhouette = silhouetteForShape('type:A320')!
    const metresToPx = (side - 2) / (2 * silhouette.boundingRadius)
    expect(context.scale).toHaveBeenCalledWith(metresToPx, metresToPx)
    expect(context.lineWidth).toBeCloseTo(0.5 / metresToPx)
  })

  it.each([
    ['a name that is not a silhouette', 'adsb-blip'],
    ['a shape it has no drawing for', 'aircraft-silhouette:type:NOPE:civil'],
  ])('draws nothing for %s', (_description, imageId) => {
    expect(createSilhouetteImageData(imageId)).toBeNull()
    expect(drawCalls).toEqual([])
  })

  it.each([
    ['dark', '#d9dcdf'],
    ['light', '#4b5057'],
  ] as const)('draws a plain aircraft on the %s map in its plain colour', (palette, colour) => {
    createSilhouetteImageData(
      silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'plain'), palette),
    )
    expect(drawCalls[0]).toMatchObject({ call: 'fill', colour })
  })

  it.each([
    ['dark', SILHOUETTE_SELECTED_CIVIL_COLOURS.dark],
    ['light', SILHOUETTE_SELECTED_CIVIL_COLOURS.light],
  ] as const)('draws a selected plain aircraft in the %s selected colour', (palette, colour) => {
    createSilhouetteImageData(
      silhouetteImageIdForPalette(
        `${silhouetteImageId('type:A320', 'plain')}${SILHOUETTE_SELECTED_SUFFIX}`,
        palette,
      ),
    )
    expect(drawCalls[0]!.colour).toBe(colour)
  })

  it('reads a plain aircraft’s image name back', () => {
    const imageId = silhouetteImageIdForPalette(silhouetteImageId('type:A320', 'plain'), 'dark')
    expect(parseSilhouetteImageId(imageId)?.colourKey).toBe('plain')
  })

  it('finds the body’s interior by shifting it inset in eight directions', () => {
    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'), 2)
    const drawImage = context.drawImage as unknown as ReturnType<typeof vi.fn>
    const shifts = drawImage.mock.calls.map(([, shiftX, shiftY]) => [shiftX, shiftY])
    // The body copied in, eight shifted copies, then the clip and the composite.
    expect(shifts).toHaveLength(11)
    const reach = SILHOUETTE_DETAIL_INSET_PX * 2
    expect(shifts.slice(1, 9).map(([shiftX, shiftY]) => Math.hypot(shiftX, shiftY))).toEqual(
      Array.from({ length: 8 }, () => expect.closeTo(reach)),
    )
    expect(new Set(shifts.slice(1, 9).map(String)).size).toBe(8)
  })

  it('keeps only the part of the detail line inside the interior', () => {
    // A context per canvas here, because this is about which canvas does what.
    const layers: { canvas: HTMLCanvasElement; context: Record<string, unknown> }[] = []
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      const layerContext = {
        translate: vi.fn(),
        scale: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => imageData),
        globalCompositeOperation: 'source-over',
      }
      layers.push({ canvas: this, context: layerContext })
      return layerContext as unknown as CanvasRenderingContext2D
    } as unknown as HTMLCanvasElement['getContext'])

    createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))

    const [body, detail, interior] = layers
    expect(detail!.context.globalCompositeOperation).toBe('destination-in')
    expect(detail!.context.drawImage).toHaveBeenCalledWith(interior!.canvas, 0, 0)
    expect(body!.context.globalCompositeOperation).toBe('source-over')
    expect(body!.context.drawImage).toHaveBeenCalledWith(detail!.canvas, 0, 0)
  })

  it.each([
    ['detail', 2],
    ['interior', 3],
  ])('draws nothing when the %s canvas gets no 2D context', (_name, failingCall) => {
    const realGetContext = vi.mocked(HTMLCanvasElement.prototype.getContext).getMockImplementation()
    let calls = 0
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      calls += 1
      if (calls === failingCall) return null
      return (realGetContext as unknown as (...params: unknown[]) => unknown).apply(this, args)
    } as unknown as HTMLCanvasElement['getContext'])
    expect(createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))).toBeNull()
  })

  it('draws nothing when the browser gives no 2D context', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(createSilhouetteImageData(silhouetteImageId('type:A320', 'civil'))).toBeNull()
  })
})
