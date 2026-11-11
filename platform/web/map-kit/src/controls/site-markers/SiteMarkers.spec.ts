import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import {
  CIVIL_SITE_COLOURS,
  SITE_LABEL_FILLS,
  SiteMarkers,
  type SiteMarker,
  type SiteMarkersOptions,
} from './SiteMarkers'

/**
 * The dot-and-label layer behind AIR's airports and SEA's ports. Labels are
 * canvas images on a symbol layer (so they sit beneath the traffic), opened by
 * hover and pinned by click, and the traffic above them keeps the pointer.
 */

/** A recording 2D context: jsdom has no canvas rendering. */
function recordingContext() {
  const drawn: string[] = []
  const context = {
    font: '',
    letterSpacing: '',
    fillStyle: '',
    textBaseline: '',
    scale: vi.fn(),
    beginPath: vi.fn(),
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
    addLayer: vi.fn((layer: { id: string }, _beneathLayerId?: string) => layers.add(layer.id)),
    setLayoutProperty: vi.fn(),
    getCanvas: vi.fn(() => canvas),
    queryRenderedFeatures: vi.fn((): unknown[] => []),
    on: vi.fn(
      (
        event: string,
        target: string[] | ((event: unknown) => void),
        handler?: (event: unknown) => void,
      ) =>
        typeof target === 'function'
          ? handlers.set(event, target)
          : handlers.set(`${event}:${target[0]}`, handler!),
    ),
    setFilter: vi.fn(),
    off: vi.fn(),
  }
  return { map, handlers, layers, canvas, images, asMap: map as unknown as maplibregl.Map }
}

const onClick = vi.fn()
const SITES: SiteMarker[] = [
  { name: 'Newcastle', coordinates: [-1.69, 55.04], onClick },
  { name: 'Mystery Field', coordinates: [-2, 54], onClick: vi.fn() },
]
const CIVIL_LAYER = 'test-sites'
const CIVIL_LABEL_LAYER = 'test-sites-open'
const BENEATH_LAYER = 'traffic-line'
const PRIORITY_LAYER = 'traffic-hit'
const COLOURS = { closedDot: '#111111', accent: '#22aaee', block: '#333333' }
const OPTIONS: SiteMarkersOptions = {
  dotLayerId: CIVIL_LAYER,
  labelLayerId: CIVIL_LABEL_LAYER,
  colours: COLOURS,
  beneathLayerId: BENEATH_LAYER,
  priorityLayerId: PRIORITY_LAYER,
}

describe('SiteMarkers', () => {
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
    const attached = new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addImage).not.toHaveBeenCalled()
    releaseFonts()
    await attached
    expect(map.addImage).toHaveBeenCalledTimes(2)
  })

  it('adds one image per site, a source, and dot and label layers', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addImage).toHaveBeenCalledWith(`${CIVIL_LABEL_LAYER}:dark:0`, expect.anything(), {
      pixelRatio: 2,
    })
    const [sourceId, source] = map.addSource.mock.calls[0] as unknown as [
      string,
      { data: { features: Array<{ geometry: { coordinates: number[] } }> } },
    ]
    expect(sourceId).toBe(CIVIL_LAYER)
    expect(source.data.features[0]!.geometry.coordinates).toEqual(SITES[0]!.coordinates)
    expect(map.addLayer.mock.calls[0]![0]).toMatchObject({ id: CIVIL_LAYER, type: 'circle' })
    expect(map.addLayer.mock.calls[1]![0]).toMatchObject({
      id: CIVIL_LABEL_LAYER,
      type: 'symbol',
    })
  })

  it('shows every site, whatever overlaps, with its dot on the site', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    const { layout } = map.addLayer.mock.calls[1]![0] as unknown as {
      layout: Record<string, unknown>
    }
    expect(layout['icon-allow-overlap']).toBe(true)
    expect(layout['icon-ignore-placement']).toBe(true)
    expect(layout['icon-anchor']).toBe('left')
    expect(layout['icon-offset']).toEqual([-13, 0])
  })

  it('goes beneath the traffic when it is already on the map', async () => {
    const { map, asMap } = fakeMap(new Set([BENEATH_LAYER]))
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addLayer).toHaveBeenCalledWith(expect.anything(), BENEATH_LAYER)
  })

  it('adds nothing twice when attached again', async () => {
    const { map, asMap } = fakeMap()
    const markers = new SiteMarkers(asMap, SITES, OPTIONS)
    await markers.attach()
    await markers.attach()
    expect(map.addLayer).toHaveBeenCalledTimes(2)
  })

  it('reuses an image the map still holds', async () => {
    const { map, images, asMap } = fakeMap()
    images.add(`${CIVIL_LABEL_LAYER}:dark:0`)
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addImage).toHaveBeenCalledTimes(1)
  })

  it('skips an image the canvas cannot draw', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addImage).not.toHaveBeenCalled()
    expect(map.addLayer).toHaveBeenCalled()
  })

  it.each([
    ['dark', '#000000'],
    ['light', '#000000'],
  ] as const)('fills a label for the %s map in black', async (theme, fill) => {
    document.documentElement.dataset.mapTheme = theme
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES.slice(0, 1), OPTIONS).attach()
    delete document.documentElement.dataset.mapTheme
    expect(recorder.drawn).toContain(`rect ${fill}`)
    expect(map.addImage).toHaveBeenCalledWith(
      `${CIVIL_LABEL_LAYER}:${theme}:0`,
      expect.anything(),
      expect.anything(),
    )
  })

  it('draws only the name, in capitals', async () => {
    await new SiteMarkers(fakeMap().asMap, SITES.slice(0, 1), OPTIONS).attach()
    const texts = recorder.drawn.filter((entry) => entry.startsWith('text'))
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('NEWCASTLE')
  })

  describe('site code (ICAO, UN/LOCODE)', () => {
    const WITH_CODE = [{ ...SITES[0]!, code: 'EGNT' }]

    it('draws the code in its block, then the name after it', async () => {
      await new SiteMarkers(fakeMap().asMap, WITH_CODE, OPTIONS).attach()
      expect(recorder.drawn).toContain('rect #333333')
      // Well 26 + padding 7 + the ink's 1px bearing.
      expect(recorder.drawn).toContain('text EGNT @34')
      // Well 26 + the block (21px of ink + 14 padding) + padding 10 + bearing 1.
      expect(recorder.drawn).toContain('text NEWCASTLE @72')
    })

    it('draws no block for a site without a code', async () => {
      await new SiteMarkers(fakeMap().asMap, SITES, OPTIONS).attach()
      expect(recorder.drawn).not.toContain('rect #333333')
    })
  })

  it('loads both label fonts before drawing', async () => {
    await new SiteMarkers(fakeMap().asMap, SITES, OPTIONS).attach()
    const fonts = vi.mocked(document.fonts.load).mock.calls.map(([font]) => font)
    expect(fonts.some((font) => font.startsWith('400'))).toBe(true)
    expect(fonts.some((font) => font.startsWith('700'))).toBe(true)
  })

  it('opens no label until a site is hovered or clicked', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    const labels = map.addLayer.mock.calls[1]![0] as unknown as { filter: unknown }
    expect(labels.filter).toEqual(['in', ['get', 'siteIndex'], ['literal', []]])
  })

  it('draws the closed dot, the open dot and the code in the colours given', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, [{ ...SITES[0]!, code: 'EGNT' }], OPTIONS).attach()
    const [dots] = map.addLayer.mock.calls.map(([layer]) => layer) as unknown as [
      { paint: Record<string, unknown> },
    ]
    expect(dots.paint['circle-color']).toBe('#111111')
    expect(recorder.drawn).toContain('fill #22aaee')
    expect(recorder.drawn).toContain('rect #333333')
  })

  it('gives the shared civil look a black dot that opens blue, on a black label', () => {
    expect(CIVIL_SITE_COLOURS).toEqual({
      closedDot: '#000000',
      accent: '#00aaff',
      block: '#002244',
    })
    expect(SITE_LABEL_FILLS).toEqual({ dark: '#000000', light: '#000000' })
  })

  it('goes on top when the traffic is not on the map yet', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, OPTIONS).attach()
    expect(map.addLayer.mock.calls[0]![1]).toBeUndefined()
  })

  it('goes on top when no traffic layer is named', async () => {
    const { map, asMap } = fakeMap(new Set([BENEATH_LAYER]))
    const { beneathLayerId: _beneath, ...withoutBeneath } = OPTIONS
    await new SiteMarkers(asMap, SITES, withoutBeneath).attach()
    expect(map.addLayer.mock.calls[0]![1]).toBeUndefined()
  })

  it('keeps a closed civil dot black, and turns it blue when its label opens', async () => {
    const { map, asMap } = fakeMap()
    await new SiteMarkers(asMap, SITES, { ...OPTIONS, colours: CIVIL_SITE_COLOURS }).attach()
    const [dots] = map.addLayer.mock.calls.map(([layer]) => layer) as unknown as [
      { paint: Record<string, unknown> },
    ]
    expect(dots.paint['circle-color']).toBe('#000000')
    // The open label draws its own dot over the closed one.
    expect(recorder.drawn).toContain('fill #00aaff')
  })

  it('pads the drawn ink evenly, not the text’s advance width', async () => {
    await new SiteMarkers(fakeMap().asMap, SITES.slice(1), OPTIONS).attach()
    // Dot well 26 + the ink's 1px left bearing: the well is the left padding.
    expect(recorder.drawn.find((entry) => entry.startsWith('text'))).toContain('@27')
  })

  it('starts hidden, and shows when set visible', async () => {
    const { map, asMap } = fakeMap()
    const markers = new SiteMarkers(asMap, SITES, OPTIONS)
    await markers.attach()
    const { layout } = map.addLayer.mock.calls[0]![0] as unknown as {
      layout: { visibility: string }
    }
    expect(layout.visibility).toBe('none')
    markers.setVisible(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(CIVIL_LAYER, 'visibility', 'visible')
    markers.setVisible(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(CIVIL_LAYER, 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(CIVIL_LABEL_LAYER, 'visibility', 'none')
  })

  it('remembers visibility set before the layer exists', async () => {
    const { map, asMap } = fakeMap()
    const markers = new SiteMarkers(asMap, SITES, OPTIONS)
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
      await new SiteMarkers(fake.asMap, SITES, OPTIONS).attach()
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

    it('leaves the click to a traffic feature drawn over the label', async () => {
      const { handlers, map } = await attached(new Set([PRIORITY_LAYER]))
      map.queryRenderedFeatures.mockReturnValue([{}])
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('takes every click when no priority layer is named', async () => {
      const fake = fakeMap(new Set([PRIORITY_LAYER]))
      const { priorityLayerId: _priority, ...withoutPriority } = OPTIONS
      await new SiteMarkers(fake.asMap, SITES, withoutPriority).attach()
      fake.map.queryRenderedFeatures.mockReturnValue([{}])
      fake.handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('takes the click when the priority layer is not on the map', async () => {
      const { handlers, map } = await attached()
      map.queryRenderedFeatures.mockReturnValue([{}])
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('still clicks through when no traffic feature is under the pointer', async () => {
      const { handlers } = await attached(new Set([PRIORITY_LAYER]))
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      expect(onClick).toHaveBeenCalledOnce()
    })

    const openSites = (filter: unknown) => (filter as [string, unknown, [string, number[]]])[2][1]
    const lastFilter = (map: ReturnType<typeof fakeMap>['map']) =>
      openSites(map.setFilter.mock.calls.at(-1)![1])

    it('opens a label on hover and closes it when the pointer leaves', async () => {
      const { handlers, map } = await attached()
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      expect(map.setFilter.mock.calls[0]![0]).toBe(CIVIL_LABEL_LAYER)
      expect(lastFilter(map)).toEqual([1])
      handlers.get(`mouseleave:${CIVIL_LAYER}`)!(undefined)
      expect(lastFilter(map)).toEqual([])
    })

    it('leaves the filter alone while the pointer stays on one site', async () => {
      const { handlers, map } = await attached()
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      expect(map.setFilter).toHaveBeenCalledOnce()
    })

    it('follows the pointer from one site to the next', async () => {
      const { handlers, map } = await attached()
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(0))
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      expect(lastFilter(map)).toEqual([1])
    })

    it('opens nothing for a move with no site under it', async () => {
      const { handlers, map, canvas } = await attached()
      handlers.get(`mousemove:${CIVIL_LAYER}`)!({ point: { x: 1, y: 1 }, features: [] })
      expect(map.setFilter).not.toHaveBeenCalled()
      expect(canvas.style.cursor).toBe('')
    })

    it('closes a hovered label when a traffic feature comes under the pointer', async () => {
      const { handlers, map, canvas } = await attached(new Set([PRIORITY_LAYER]))
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      map.queryRenderedFeatures.mockReturnValue([{}])
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      expect(lastFilter(map)).toEqual([])
      expect(canvas.style.cursor).toBe('')
    })

    it('keeps a clicked label open after the pointer leaves', async () => {
      const { handlers, map } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(1))
      handlers.get(`mouseleave:${CIVIL_LAYER}`)!(undefined)
      expect(lastFilter(map)).toEqual([1])
    })

    it('shows the pinned and the hovered label together', async () => {
      const { handlers, map } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(1))
      expect(lastFilter(map)).toEqual([1, 0])
    })

    it('moves the pin to the site clicked next', async () => {
      const { handlers, map } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(1))
      expect(lastFilter(map)).toEqual([1])
    })

    it('closes the pinned label on a click away from any site', async () => {
      const { handlers, map } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      map.queryRenderedFeatures.mockReturnValue([])
      handlers.get('click')!({ point: { x: 1, y: 1 } })
      expect(lastFilter(map)).toEqual([])
    })

    it('keeps the pinned label on a map click that lands on a site', async () => {
      const { handlers, map } = await attached()
      handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(0))
      map.setFilter.mockClear()
      map.queryRenderedFeatures.mockReturnValue([{}])
      handlers.get('click')!({ point: { x: 1, y: 1 } })
      expect(map.setFilter).not.toHaveBeenCalled()
    })

    it('ignores a map click with nothing pinned', async () => {
      const { handlers, map } = await attached()
      handlers.get('click')!({ point: { x: 1, y: 1 } })
      expect(map.queryRenderedFeatures).not.toHaveBeenCalled()
      expect(map.setFilter).not.toHaveBeenCalled()
    })

    it('skips the filter when the label layer has gone', async () => {
      const { handlers, map, layers } = await attached()
      layers.delete(CIVIL_LABEL_LAYER)
      handlers.get(`mouseleave:${CIVIL_LAYER}`)!(undefined)
      expect(map.setFilter).not.toHaveBeenCalled()
    })

    it('keeps open labels through a style reload', async () => {
      const fake = fakeMap()
      const markers = new SiteMarkers(fake.asMap, SITES, OPTIONS)
      await markers.attach()
      fake.handlers.get(`click:${CIVIL_LAYER}`)!(clickOn(1))
      fake.layers.clear()
      fake.map.addLayer.mockClear()
      await markers.attach()
      const labels = fake.map.addLayer.mock.calls[1]![0] as unknown as { filter: unknown }
      expect(openSites(labels.filter)).toEqual([1])
    })

    it('shows a pointer cursor over a label', async () => {
      const { handlers, canvas } = await attached()
      handlers.get(`mousemove:${CIVIL_LAYER}`)!(clickOn(0))
      expect(canvas.style.cursor).toBe('pointer')
      handlers.get(`mouseleave:${CIVIL_LAYER}`)!(undefined)
      expect(canvas.style.cursor).toBe('')
    })
  })
})
