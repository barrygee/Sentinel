import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import { AIRFIELD_LAYER_IDS, AirfieldMarkers, type AirfieldSite } from './AirfieldMarkers'

/** A recording 2D context: jsdom has no canvas rendering. */
function recordingContext() {
  const drawn: string[] = []
  const context = {
    font: '',
    letterSpacing: '',
    fillStyle: '',
    textBaseline: '',
    scale: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    stroke: vi.fn(() => drawn.push(`stroke ${context.strokeStyle}`)),
    arc: vi.fn(),
    fill: vi.fn(() => drawn.push(`fill ${context.fillStyle}`)),
    fillRect: vi.fn(() => drawn.push(`rect ${context.fillStyle}`)),
    fillText: vi.fn((text: string, x: number) => drawn.push(`text ${text} @${x}`)),
    // Ink starts 1px left of the origin and runs the text's length at 5px a glyph.
    measureText: vi.fn((text: string) => ({
      actualBoundingBoxLeft: 1,
      actualBoundingBoxRight: text.length * 5,
    })),
    getImageData: vi.fn(() => ({ width: 1, height: 1 }) as ImageData),
  }
  return { context, drawn }
}

function fakeMap(layers = new Set<string>()) {
  const handlers = new Map<string, (event: unknown) => void>()
  const canvas = { style: { cursor: '' } }
  const images = new Set<string>()
  const map = {
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    hasImage: vi.fn((id: string) => images.has(id)),
    addImage: vi.fn((id: string) => images.add(id)),
    addSource: vi.fn(),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    setLayoutProperty: vi.fn(),
    getCanvas: vi.fn(() => canvas),
    queryRenderedFeatures: vi.fn((): unknown[] => []),
    on: vi.fn((event: string, layerId: string, handler: (event: unknown) => void) =>
      handlers.set(`${event}:${layerId}`, handler),
    ),
    off: vi.fn(),
  }
  return { map, handlers, layers, canvas, images, asMap: map as unknown as maplibregl.Map }
}

const onClick = vi.fn()
const SITES: AirfieldSite[] = [
  { name: 'Newcastle', code: 'EGNT', coordinates: [-1.69, 55.04], onClick },
  { name: 'Mystery Field', coordinates: [-2, 54], onClick: vi.fn() },
]
const CIVIL_LAYER = AIRFIELD_LAYER_IDS.civil

describe('AirfieldMarkers', () => {
  let recorder: ReturnType<typeof recordingContext>

  beforeEach(() => {
    recorder = recordingContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recorder.context as unknown as RenderingContext,
    )
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(() => Promise.resolve([])) },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    onClick.mockClear()
  })

  it('waits for the label fonts before drawing', async () => {
    let releaseFonts = (): void => {}
    const fontsReady = new Promise<never[]>((resolve) => {
      releaseFonts = () => resolve([])
    })
    vi.mocked(document.fonts.load).mockReturnValue(fontsReady as never)
    const { map, asMap } = fakeMap()
    const attached = new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addImage).not.toHaveBeenCalled()
    releaseFonts()
    await attached
    expect(map.addImage).toHaveBeenCalledTimes(2)
  })

  it('adds one image per site, a source and a symbol layer', async () => {
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addImage).toHaveBeenCalledWith(`${CIVIL_LAYER}:0`, expect.anything(), {
      pixelRatio: 2,
    })
    const [sourceId, source] = map.addSource.mock.calls[0] as unknown as [
      string,
      { data: { features: Array<{ geometry: { coordinates: number[] } }> } },
    ]
    expect(sourceId).toBe(CIVIL_LAYER)
    expect(source.data.features[0]!.geometry.coordinates).toEqual(SITES[0]!.coordinates)
    expect(map.addLayer.mock.calls[0]![0]).toMatchObject({ id: CIVIL_LAYER, type: 'symbol' })
  })

  it('shows every site, whatever overlaps, with its dot on the site', async () => {
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    const { layout } = map.addLayer.mock.calls[0]![0] as unknown as {
      layout: Record<string, unknown>
    }
    expect(layout['icon-allow-overlap']).toBe(true)
    expect(layout['icon-ignore-placement']).toBe(true)
    expect(layout['icon-anchor']).toBe('left')
    expect(layout['icon-offset']).toEqual([-13, 0])
  })

  it('goes beneath the aircraft when they are already on the map', async () => {
    const { map, asMap } = fakeMap(new Set(['adsb-trail-line']))
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addLayer).toHaveBeenCalledWith(expect.anything(), 'adsb-trail-line')
  })

  it('adds nothing twice when attached again', async () => {
    const { map, asMap } = fakeMap()
    const markers = new AirfieldMarkers(asMap, SITES, 'civil')
    await markers.attach()
    await markers.attach()
    expect(map.addLayer).toHaveBeenCalledTimes(1)
  })

  it('reuses an image the map still holds', async () => {
    const { map, images, asMap } = fakeMap()
    images.add(`${CIVIL_LAYER}:0`)
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addImage).toHaveBeenCalledTimes(1)
  })

  it('skips an image the canvas cannot draw', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addImage).not.toHaveBeenCalled()
    expect(map.addLayer).toHaveBeenCalled()
  })

  it.each([
    ['civil', '#00aaff', '#002244'],
    ['military', '#c8ff00', '#4d6600'],
  ] as const)('draws a %s label in its colours', async (kind, accent, block) => {
    await new AirfieldMarkers(fakeMap().asMap, SITES.slice(0, 1), kind).attach()
    expect(recorder.drawn).toContain(`fill ${accent}`)
    expect(recorder.drawn).toContain(`rect ${block}`)
  })

  it.each([
    ['civil', '#00aaff'],
    ['military', '#c8ff00'],
  ] as const)('sets a %s label apart from aircraft: rounded and outlined', async (kind, accent) => {
    await new AirfieldMarkers(fakeMap().asMap, SITES.slice(0, 1), kind).attach()
    expect(recorder.context.roundRect).toHaveBeenCalled()
    expect(recorder.context.clip).toHaveBeenCalled()
    expect(recorder.drawn.at(-1)).toBe(`stroke ${accent}`)
    expect(recorder.drawn).not.toContain('rect #000000')
  })

  it('draws the code before the name, in capitals', async () => {
    await new AirfieldMarkers(fakeMap().asMap, SITES.slice(0, 1), 'civil').attach()
    const texts = recorder.drawn.filter((entry) => entry.startsWith('text'))
    expect(texts[0]).toContain('EGNT')
    expect(texts[1]).toContain('NEWCASTLE')
  })

  it('leaves the code block out for a site with no code', async () => {
    await new AirfieldMarkers(fakeMap().asMap, SITES.slice(1), 'civil').attach()
    expect(recorder.drawn).not.toContain('rect #002244')
    expect(recorder.drawn.filter((entry) => entry.startsWith('text'))).toHaveLength(1)
  })

  it('pads the drawn ink evenly, not the text’s advance width', async () => {
    await new AirfieldMarkers(fakeMap().asMap, SITES.slice(1), 'civil').attach()
    // Dot well 26 + padding 10 + the ink's 1px left bearing.
    expect(recorder.drawn.find((entry) => entry.startsWith('text'))).toContain('@37')
  })

  it('starts hidden, and shows when set visible', async () => {
    const { map, asMap } = fakeMap()
    const markers = new AirfieldMarkers(asMap, SITES, 'civil')
    await markers.attach()
    const { layout } = map.addLayer.mock.calls[0]![0] as unknown as {
      layout: { visibility: string }
    }
    expect(layout.visibility).toBe('none')
    markers.setVisible(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(CIVIL_LAYER, 'visibility', 'visible')
    markers.setVisible(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(CIVIL_LAYER, 'visibility', 'none')
  })

  it('remembers visibility set before the layer exists', async () => {
    const { map, asMap } = fakeMap()
    const markers = new AirfieldMarkers(asMap, SITES, 'civil')
    markers.setVisible(true)
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    await markers.attach()
    const { layout } = map.addLayer.mock.calls[0]![0] as unknown as {
      layout: { visibility: string }
    }
    expect(layout.visibility).toBe('visible')
  })

  describe('pointer', () => {
    async function attached(layers?: Set<string>) {
      const fake = fakeMap(layers)
      await new AirfieldMarkers(fake.asMap, SITES, 'civil').attach()
      return fake
    }
    const clickOn = (siteIndex: number) => ({
      point: { x: 1, y: 1 },
      features: [{ properties: { siteIndex } }],
    })

    it('runs the clicked site’s action', async () => {
      const { handlers } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('ignores a click with no site under it', async () => {
      const { handlers } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!({ point: { x: 1, y: 1 }, features: [] })
      expect(onClick).not.toHaveBeenCalled()
    })

    it('leaves the click to an aircraft drawn over the label', async () => {
      const { handlers, map } = await attached(new Set(['adsb-hit']))
      map.queryRenderedFeatures.mockReturnValue([{}])
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('still clicks through when no aircraft is under the pointer', async () => {
      const { handlers } = await attached(new Set(['adsb-hit']))
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('shows a pointer cursor over a label', async () => {
      const { handlers, canvas } = await attached()
      handlers.get(`mouseenter:${CIVIL_LAYER}`)!(undefined)
      expect(canvas.style.cursor).toBe('pointer')
      handlers.get(`mouseleave:${CIVIL_LAYER}`)!(undefined)
      expect(canvas.style.cursor).toBe('')
    })
  })
})
