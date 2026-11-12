import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import {
  AIRFIELD_LABEL_FILLS,
  AIRFIELD_LAYER_IDS,
  AIRFIELD_LAYER_ORDER,
  AIRFIELD_OPEN_LABEL_LAYER_IDS,
  AirfieldMarkers,
  type AirfieldSite,
} from './AirfieldMarkers'

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
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
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

/**
 * AIR's airports and bases on the shared map-kit `SiteMarkers` (whose own spec
 * covers drawing, hover and pinning): what is AIR's here is the layer ids, the
 * colours of each kind and staying beneath the aircraft.
 */

const onClick = vi.fn()
const SITES: AirfieldSite[] = [
  { name: 'Newcastle', coordinates: [-1.69, 55.04], onClick },
  { name: 'Mystery Field', coordinates: [-2, 54], onClick: vi.fn() },
]

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

  it.each([
    ['civil', 'airfield-labels-civil', 'airfield-labels-civil-open'],
    ['military', 'airfield-labels-military', 'airfield-labels-military-open'],
  ] as const)('draws %s sites on their own dot and label layers', async (kind, dots, labels) => {
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, SITES, kind).attach()
    expect(AIRFIELD_LAYER_IDS[kind]).toBe(dots)
    expect(AIRFIELD_OPEN_LABEL_LAYER_IDS[kind]).toBe(labels)
    expect(map.addLayer.mock.calls.map(([layer]) => (layer as { id: string }).id)).toEqual([
      dots,
      labels,
    ])
  })

  it('stacks every dot beneath every open label', () => {
    expect(AIRFIELD_LAYER_ORDER).toEqual([
      AIRFIELD_LAYER_IDS.civil,
      AIRFIELD_LAYER_IDS.military,
      AIRFIELD_OPEN_LABEL_LAYER_IDS.civil,
      AIRFIELD_OPEN_LABEL_LAYER_IDS.military,
    ])
  })

  it('draws a civil site as a black dot that opens blue, with a navy code block', async () => {
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, [{ ...SITES[0]!, code: 'EGNT' }], 'civil').attach()
    const [dots] = map.addLayer.mock.calls.map(([layer]) => layer) as unknown as [
      { paint: Record<string, unknown> },
    ]
    expect(dots.paint['circle-color']).toBe('#000000')
    expect(recorder.drawn).toContain('fill #00aaff')
    expect(recorder.drawn).toContain('rect #002244')
  })

  it('draws a military site green, with a dark green code block', async () => {
    const { map, asMap } = fakeMap()
    await new AirfieldMarkers(asMap, [{ ...SITES[0]!, code: 'EGXC' }], 'military').attach()
    const [dots] = map.addLayer.mock.calls.map(([layer]) => layer) as unknown as [
      { paint: Record<string, unknown> },
    ]
    expect(dots.paint['circle-color']).toBe('#c8ff00')
    expect(recorder.drawn).toContain('fill #c8ff00')
    expect(recorder.drawn).toContain('rect #4d6600')
  })

  it('fills its labels black on either basemap', () => {
    expect(AIRFIELD_LABEL_FILLS).toEqual({ dark: '#000000', light: '#000000' })
  })

  it('goes beneath the aircraft when they are already on the map', async () => {
    const { map, asMap } = fakeMap(new Set(['adsb-trail-line']))
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    expect(map.addLayer).toHaveBeenCalledWith(expect.anything(), 'adsb-trail-line')
  })

  it('leaves the click to an aircraft drawn over the label', async () => {
    const { map, handlers, asMap } = fakeMap(new Set(['adsb-hit']))
    await new AirfieldMarkers(asMap, SITES, 'civil').attach()
    const click = { point: { x: 1, y: 1 }, features: [{ properties: { siteIndex: 0 } }] }
    handlers.get(`click:${AIRFIELD_LAYER_IDS.civil}`)!(click)
    expect(onClick).toHaveBeenCalledOnce()

    map.queryRenderedFeatures.mockReturnValue([{}])
    handlers.get(`click:${AIRFIELD_LAYER_IDS.civil}`)!(click)
    expect(onClick).toHaveBeenCalledOnce()
    expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith(click.point, {
      layers: ['adsb-hit'],
    })
  })
})
