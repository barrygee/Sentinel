import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

// ── maplibre-gl mock — same shape as AprsStationsControl.spec.ts's, plus a
//    Popup stub since this control (unlike AprsStationsControl) opens one. ──
interface RecordedMarker {
  element: HTMLElement
  anchor: string | undefined
  offset: [number, number] | undefined
  lngLat: [number, number] | null
  removed: boolean
}
interface RecordedPopup {
  content: HTMLElement | null
  lngLat: [number, number] | null
  removed: boolean
  closeHandlers: (() => void)[]
}
const mocks = vi.hoisted(() => {
  const created = { markers: [] as RecordedMarker[], popups: [] as RecordedPopup[] }
  class MockMarker {
    element: HTMLElement
    anchor: string | undefined
    offset: [number, number] | undefined
    lngLat: [number, number] | null = null
    removed = false
    constructor(options: { element: HTMLElement; anchor?: string; offset?: [number, number] }) {
      this.element = options.element
      this.anchor = options.anchor
      this.offset = options.offset
      created.markers.push(this)
    }
    setLngLat(coords: [number, number]): this {
      this.lngLat = coords
      return this
    }
    getElement(): HTMLElement {
      return this.element
    }
    addTo(): this {
      // Attached for real so the popup's ESC-return-focus test can observe
      // `document.activeElement` landing back on this element.
      document.body.appendChild(this.element)
      return this
    }
    remove(): this {
      this.removed = true
      this.element.remove()
      return this
    }
  }
  class MockPopup {
    record: RecordedPopup = { content: null, lngLat: null, removed: false, closeHandlers: [] }
    constructor() {
      created.popups.push(this.record)
    }
    setLngLat(coords: [number, number]): this {
      this.record.lngLat = coords
      return this
    }
    setDOMContent(content: HTMLElement): this {
      this.record.content = content
      return this
    }
    addTo(): this {
      // MapLibre attaches the popup's DOM into the page; attaching it for real
      // here (rather than leaving it detached) lets focus-management tests use
      // `document.activeElement` instead of spying on every marker's element.
      if (this.record.content) document.body.appendChild(this.record.content)
      return this
    }
    on(event: string, handler: () => void): this {
      if (event === 'close') this.record.closeHandlers.push(handler)
      return this
    }
    /** MapLibre's popup wrapper element. The control reads it to centre the
     *  card in the visible map, so the stand-in hands back the content node. */
    getElement(): HTMLElement | undefined {
      return this.record.content ?? undefined
    }
    remove(): this {
      this.record.removed = true
      this.record.content?.remove()
      this.record.closeHandlers.forEach((handler) => handler())
      return this
    }
  }
  return { created, MockMarker, MockPopup }
})
const created = mocks.created

vi.mock('maplibre-gl', () => ({ default: { Marker: mocks.MockMarker, Popup: mocks.MockPopup } }))

import {
  CAMERA_OPEN_EVENT,
  CAMERA_PREVIEW_EVENT,
  TrafficCamerasControl,
} from './TrafficCamerasControl'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, CameraFeatureState, FeedWithStatus } from '@/types/landFeeds'

const LABEL_REVEAL_ZOOM = 11

function camera(
  overrides: Partial<CameraFeature['properties']> = {},
  lon = 0,
  lat = 0,
): CameraFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      kind: 'camera',
      id: 'durham-cc:cam1',
      name: 'Framwellgate Peth',
      description: '',
      view: 'West',
      updatedAt: null,
      state: 'live',
      imageUrl: '/api/land/feeds/durham-cc/image/cam1',
      clipUrl: null,
      externalUrl: 'https://www.durham.gov.uk/article/6134',
      sourceId: 'durham-cc',
      sourceName: 'Durham County Council',
      attribution: 'Contains public sector information licensed under the OGL v3.0',
      ...overrides,
    },
  }
}

/** A feed record as `landFeedsStore.feeds` holds it — the control reads only
 *  `id` and `refreshSeconds` from it, to size the image-refresh timer. */
function durhamFeed(overrides: Partial<FeedWithStatus> = {}): FeedWithStatus {
  return {
    id: 'durham-cc',
    name: 'Durham County Council',
    category: 'traffic-cameras',
    provider: 'durham',
    url: 'https://spatial.durham.gov.uk/example',
    enabled: true,
    refreshSeconds: 60,
    datasets: ['cameras'],
    bbox: null,
    location: null,
    auth: { type: 'none' },
    status: {
      lastFetchAt: null,
      lastError: null,
      featureCount: 1,
      credentialConfigured: false,
      running: true,
    },
    ...overrides,
  }
}

/** Wait for the `requestAnimationFrame` the control defers its centring to. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function makeFakeMap(overrides: Partial<ReturnType<typeof baseFakeMap>> = {}) {
  return { ...baseFakeMap(), ...overrides }
}

function baseFakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers: Record<string, (() => void)[]> = {}
  let zoom = 6
  return {
    getContainer: () => container,
    _container: container,
    // A pixel-identity projection, so test fixtures can place cameras at
    // "pixel" coordinates directly (real geography is irrelevant to a fake map).
    project: ([lon, lat]: [number, number]) => ({ x: lon, y: lat }),
    unproject: ([x, y]: [number, number]) => ({ toArray: () => [x, y] as [number, number] }),
    getZoom: () => zoom,
    setZoom: (value: number) => {
      zoom = value
    },
    getBounds: () => ({
      getWest: () => -1000,
      getSouth: () => -1000,
      getEast: () => 1000,
      getNorth: () => 1000,
      getSouthWest: () => [-1000, -1000] as [number, number],
      getNorthEast: () => [1000, 1000] as [number, number],
    }),
    easeTo: vi.fn(),
    flyTo: vi.fn(),
    // An open popup is panned into the middle of the visible map; jsdom reports
    // every rect as zero, so by default the card is already "centred" and no pan
    // is asked for. The centring tests stub the rects they need.
    panBy: vi.fn(),
    once: vi.fn((event: string, handler: () => void) => {
      ;(handlers[`once:${event}`] ??= []).push(handler)
    }),
    on: (event: string, handler: () => void) => {
      ;(handlers[event] ??= []).push(handler)
    },
    off: (event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter((each) => each !== handler)
    },
    _emit: (event: string) => (handlers[event] ?? []).forEach((handler) => handler()),
    _emitOnce: (event: string) => {
      const list = handlers[`once:${event}`] ?? []
      handlers[`once:${event}`] = []
      list.forEach((handler) => handler())
    },
    _handlerCount: (event: string) => (handlers[event] ?? []).length,
    _zoomGetter: () => zoom,
  }
}

describe('TrafficCamerasControl', () => {
  let landStore: ReturnType<typeof useLandStore>
  let landFeedsStore: ReturnType<typeof useLandFeedsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    created.markers.length = 0
    created.popups.length = 0
    landStore = useLandStore()
    landFeedsStore = useLandFeedsStore()
    // Land layers now start OFF and are lit by `hydrateDefaultLayers` or the
    // sidebar's layer tabs, so a spec that wants markers has to say so. Tests
    // about the hidden state set the flag false for themselves.
    landStore.setTrafficCamerasLayerVisible(true)
    vi.spyOn(landFeedsStore, 'startPolling').mockResolvedValue(undefined)
    vi.spyOn(landFeedsStore, 'stopPolling').mockImplementation(() => {})
    // jsdom has no matchMedia implementation at all; the popup's media block
    // calls it unconditionally whenever an image or clip is present, so every
    // popup test needs a default (non-reduced-motion) stub unless it overrides
    // it itself.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, media: '', addEventListener: vi.fn() }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function addControl(map: ReturnType<typeof makeFakeMap> = makeFakeMap()) {
    const control = new TrafficCamerasControl(landStore, landFeedsStore)
    control.onAdd(map as never)
    return { control, map }
  }

  function setFeatures(features: CameraFeature[]): void {
    landFeedsStore.featuresByFeed = { 'durham-cc': { type: 'FeatureCollection', features } }
  }

  // ── identity / lifecycle ──────────────────────────────────────────────────

  it('describes itself with a camera icon and an accessible title', () => {
    const { control } = addControl()
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect(control.buttonTitle).toBe('Toggle traffic cameras')
    expect(control.button.getAttribute('aria-label')).toBe('Toggle traffic cameras')
  })

  it('starts polling on init when the layer starts visible', () => {
    landStore.setTrafficCamerasLayerVisible(true)
    addControl()
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()
  })

  it('does not start polling when the layer starts hidden', () => {
    landStore.setTrafficCamerasLayerVisible(false)
    addControl()
    expect(landFeedsStore.startPolling).not.toHaveBeenCalled()
  })

  // Polling now follows the STORE flag through the control's watcher rather
  // than being started inline by `setVisible`, so whoever flips the flag — this
  // control, the sidebar's layer tabs, Settings, a config upload — gets exactly
  // one poll. Hence the `await nextTick()` between flip and assertion.
  it('setVisible starts and stops polling, and is a no-op when unchanged', async () => {
    landStore.setTrafficCamerasLayerVisible(false)
    const { control } = addControl()
    vi.mocked(landFeedsStore.startPolling).mockClear()

    control.setVisible(true)
    await nextTick()
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()
    expect(landStore.trafficCamerasLayerVisible).toBe(true)

    control.setVisible(true) // unchanged — no-op
    await nextTick()
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()

    control.setVisible(false)
    await nextTick()
    expect(landFeedsStore.stopPolling).toHaveBeenCalledOnce()
    expect(landStore.trafficCamerasLayerVisible).toBe(false)
  })

  it('starts polling exactly once when the flag is flipped from outside this control', async () => {
    landStore.setTrafficCamerasLayerVisible(false)
    addControl()
    vi.mocked(landFeedsStore.startPolling).mockClear()

    // What the sidebar's layer tabs and the Settings picker call — the control
    // never sees a click, so only the store watcher can start the poll.
    landStore.selectLayer('trafficCameras')
    await nextTick()
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()

    // A second flag change that leaves it visible must not re-subscribe.
    landStore.setTrafficCamerasLayerVisible(true)
    await nextTick()
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()
  })

  it('lights the rail button when the layer is selected elsewhere, and dims it when deselected', async () => {
    landStore.setTrafficCamerasLayerVisible(false)
    const { control } = addControl()
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
    expect(control.button.style.opacity).toBe('0.3')

    landStore.selectLayer('trafficCameras')
    await nextTick()
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
    expect(control.button.style.opacity).toBe('1')

    // Land draws one layer at a time, so choosing APRS turns cameras off.
    landStore.selectLayer('aprs')
    await nextTick()
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('handleClick (button press) flips visibility via setVisible', () => {
    landStore.setTrafficCamerasLayerVisible(true)
    const { control } = addControl()
    control.handleClickPublic()
    expect(landStore.trafficCamerasLayerVisible).toBe(false)
  })

  it('stops polling, tears down markers and the a11y region, and stops watching on remove', () => {
    setFeatures([camera()])
    landStore.setTrafficCamerasLayerVisible(true)
    const { control, map } = addControl()
    expect(created.markers.some((marker) => !marker.removed)).toBe(true)
    control.onRemove()
    expect(landFeedsStore.stopPolling).toHaveBeenCalledOnce()
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
    expect(map._container.querySelector('[role="region"]')).toBeNull()
    expect(map._handlerCount('moveend')).toBe(0)
  })

  it('tears down individual camera pins (not just counts) on remove when zoomed in', () => {
    setFeatures([camera()])
    landStore.setTrafficCamerasLayerVisible(true)
    const { control } = addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
    const pin = created.markers.find((marker) => !marker.removed)!
    expect(pin.element.querySelector('svg')).not.toBeNull() // a pin, not a count
    control.onRemove()
    expect(pin.removed).toBe(true)
  })

  it('does not stop polling on remove when the layer was already hidden', () => {
    landStore.setTrafficCamerasLayerVisible(false)
    const { control } = addControl()
    vi.mocked(landFeedsStore.stopPolling).mockClear()
    control.onRemove()
    expect(landFeedsStore.stopPolling).not.toHaveBeenCalled()
  })

  // ── marker rendering per state (§5a) ──────────────────────────────────────

  describe('marker states', () => {
    function markerFor(state: CameraFeatureState) {
      setFeatures([camera({ id: `durham-cc:${state}`, state })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      return created.markers[created.markers.length - 1]!.element
    }

    /** The pill's leading glyph well — a `span.adsb-arrow-wrap` from the
     *  shared `mapLabelParts`, which every domain's label is now built from. */
    function glyphWell(element: HTMLElement): HTMLElement {
      return element.querySelector('.adsb-arrow-wrap')! as HTMLElement
    }

    it('draws a live camera at full opacity on the shared label pill', () => {
      const element = markerFor('live')
      // A live camera leaves the pill's own opacity untouched — only stale and
      // offline set it — so the inline value is empty, i.e. fully opaque.
      expect(element.style.opacity).toBe('')
      expect(element.style.display).toBe('flex')
      expect(glyphWell(element).querySelector('svg')).not.toBeNull()
      expect(glyphWell(element).style.background).toBe('rgb(21, 23, 29)')
    })

    it('dims a stale camera to .45 overall, without recolouring the pill', () => {
      const element = markerFor('stale')
      expect(element.style.opacity).toBe('0.45')
      // Monochrome per the Land rule: dimming is the whole of the state cue.
      expect(glyphWell(element).style.background).toBe('rgb(21, 23, 29)')
    })

    it('dims an offline camera further, to .35, and still does not recolour it', () => {
      const element = markerFor('offline')
      expect(element.style.opacity).toBe('0.35')
      expect(glyphWell(element).style.background).toBe('rgb(21, 23, 29)')
    })

    it('draws no borders anywhere on the marker pill', () => {
      const element = markerFor('live')
      expect(element.style.border).toBe('')
      expect(glyphWell(element).style.border).toBe('')
      expect((element.querySelector('.adsb-label-name') as HTMLElement).style.border).toBe('')
    })

    it('carries an accessible name naming the camera, its view and its state', () => {
      const element = markerFor('live')
      expect(element.getAttribute('aria-label')).toBe(
        'Traffic camera, Framwellgate Peth, West, LIVE',
      )
    })

    it('omits the view from the accessible name when the camera has none', () => {
      setFeatures([camera({ view: null })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const element = created.markers[created.markers.length - 1]!.element
      expect(element.getAttribute('aria-label')).toBe('Traffic camera, Framwellgate Peth, LIVE')
    })

    // Replaces the old "second label line" test: the view is no longer a
    // second line of the label's own <div>, it is the shared pill's trailing
    // accent badge — a sibling segment beside the name — and the casing comes
    // from the pill's `text-transform:uppercase` rather than from JS.
    it('shows the view as a trailing accent badge beside the name, only when present', () => {
      setFeatures([camera({ view: 'West' })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const element = created.markers[created.markers.length - 1]!.element
      expect(element.style.textTransform).toBe('uppercase')
      const segments = Array.from(element.children).map((child) => child.textContent)
      expect(segments).toEqual(['', 'Framwellgate Peth', 'West'])
      const badge = element.children[2] as HTMLElement
      expect(badge.style.background).toBe('rgb(21, 23, 29)')

      created.markers.length = 0
      setFeatures([camera({ id: 'durham-cc:noview', view: null })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const withoutView = created.markers[created.markers.length - 1]!.element
      // Well + name only — no empty badge left behind.
      expect(Array.from(withoutView.children).map((child) => child.textContent)).toEqual([
        '',
        'Framwellgate Peth',
      ])
    })

    it('anchors the pill by its leading edge so the glyph well sits over the camera', () => {
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const marker = created.markers[created.markers.length - 1]!
      expect(marker.anchor).toBe('left')
      // Half the 26px well, pulled back so the well straddles the fix.
      expect(marker.offset).toEqual([-13, 0])
    })
  })

  describe('individual marker updates', () => {
    it('moves an existing marker in place rather than rebuilding it when only its position changes', async () => {
      setFeatures([camera({}, 0, 0)])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const marker = created.markers[created.markers.length - 1]!
      setFeatures([camera({}, 5, 5)])
      await nextTick()
      expect(marker.removed).toBe(false)
      expect(marker.lngLat).toEqual([5, 5])
      expect(created.markers.filter((each) => !each.removed)).toHaveLength(1)
    })

    it('rebuilds the marker when the properties that drive its appearance change', async () => {
      setFeatures([camera({ state: 'live' })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const before = created.markers[created.markers.length - 1]!
      setFeatures([camera({ state: 'offline' })])
      await nextTick()
      expect(before.removed).toBe(true)
      const after = created.markers.filter((each) => !each.removed)
      expect(after).toHaveLength(1)
      expect(after[0]).not.toBe(before)
    })

    it('keeps the same marker instance across a re-render with an identical snapshot', async () => {
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const marker = created.markers[created.markers.length - 1]!
      setFeatures([camera()]) // identical snapshot — same properties, same position
      await nextTick()
      expect(created.markers.filter((each) => !each.removed)).toHaveLength(1)
      expect(created.markers[created.markers.length - 1]).toBe(marker)
    })
  })

  // ── always-open preview cards (street zoom, desktop) ──────────────────────

  describe('preview cards', () => {
    const PREVIEW_CARD_ZOOM = 15

    function desktop(matches = true) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query.includes('min-width') ? matches : false,
          media: query,
          addEventListener: vi.fn(),
        })),
      )
    }

    function liveCard() {
      return created.markers.find(
        (marker) => !marker.removed && marker.element.querySelector('img'),
      )!
    }

    it('renders every visible camera as a card with its live still at street zoom on a wide viewport', () => {
      desktop()
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const card = liveCard()
      expect(card.element.getAttribute('role')).toBe('group')
      expect(card.element.getAttribute('aria-label')).toBe(
        'Traffic camera, Framwellgate Peth, West, LIVE',
      )
      const image = card.element.querySelector('img')!
      expect(image.getAttribute('src')).toMatch(
        /^\/api\/land\/feeds\/durham-cc\/image\/cam1\?t=\d+$/,
      )
      expect(image.alt).toBe('Framwellgate Peth — latest camera image')
      // Card, not pill: sits above pills and other markers, resizable, no border.
      expect(card.element.style.zIndex).toBe('10')
      expect(card.element.style.resize).toBe('horizontal')
      expect(card.element.style.width).toBe('480px')
      expect(card.element.style.border).toBe('')
      // The embedded header is decorative inside the card.
      expect(card.element.querySelector('div[aria-label]')).toBeNull()
    })

    it('keeps pills + popup on a narrow viewport even at street zoom', () => {
      desktop(false)
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      expect(created.markers.some((marker) => marker.element.querySelector('img'))).toBe(false)
    })

    it('keeps pills below the preview zoom even on a wide viewport', () => {
      desktop()
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM - 1 }))
      expect(created.markers.some((marker) => marker.element.querySelector('img'))).toBe(false)
    })

    it('shows the state in place of a still for a card whose camera has no image', () => {
      desktop()
      setFeatures([camera({ imageUrl: null, state: 'offline' })])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const card = created.markers.find(
        (marker) => !marker.removed && marker.element.getAttribute('role') === 'group',
      )!
      expect(card.element.querySelector('img')).toBeNull()
      expect(card.element.textContent).toContain('OFFLINE')
    })

    it('names a card after the camera alone when it reports no view direction', () => {
      desktop()
      setFeatures([camera({ view: null })])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      expect(liveCard().element.getAttribute('aria-label')).toBe(
        'Traffic camera, Framwellgate Peth, LIVE',
      )
    })

    it('dims a stale card like a stale pill', () => {
      desktop()
      setFeatures([camera({ state: 'stale' })])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      expect(liveCard().element.style.opacity).toBe('0.45')
    })

    it('rebuilds a pill as a card when the zoom crosses the preview threshold', async () => {
      desktop()
      setFeatures([camera()])
      let zoom = PREVIEW_CARD_ZOOM - 1
      const map = makeFakeMap({ getZoom: () => zoom })
      addControl(map)
      const pill = created.markers[created.markers.length - 1]!
      expect(pill.element.querySelector('img')).toBeNull()
      zoom = PREVIEW_CARD_ZOOM
      map._emit('moveend')
      expect(pill.removed).toBe(true)
      expect(liveCard()).toBeDefined()
    })

    it('clicking a card raises it above every other marker without opening a popup', () => {
      desktop()
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 300, 300)])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const cards = created.markers.filter(
        (marker) => !marker.removed && marker.element.querySelector('img'),
      )
      expect(cards).toHaveLength(2)
      cards[1]!.element.dispatchEvent(new Event('click'))
      expect(Number(cards[1]!.element.style.zIndex)).toBeGreaterThan(
        Number(cards[0]!.element.style.zIndex),
      )
      cards[0]!.element.dispatchEvent(new Event('click'))
      expect(Number(cards[0]!.element.style.zIndex)).toBeGreaterThan(
        Number(cards[1]!.element.style.zIndex),
      )
      expect(created.popups).toHaveLength(0)
    })

    it('clicking a pill also raises it, so an overlapped label can be brought forward', () => {
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const pill = created.markers[created.markers.length - 1]!
      pill.element.dispatchEvent(new Event('click'))
      expect(Number(pill.element.style.zIndex)).toBeGreaterThan(10)
    })

    it('stops a mousedown on the card reaching the map so a resize drag does not pan', () => {
      desktop()
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const event = new Event('mousedown', { bubbles: true, cancelable: true })
      const stop = vi.spyOn(event, 'stopPropagation')
      liveCard().element.dispatchEvent(event)
      expect(stop).toHaveBeenCalledOnce()
    })

    it('re-points a card image at a fresh cache-busted URL on a later poll, at most once per 15 s', async () => {
      desktop()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const image = liveCard().element.querySelector('img')!
      const firstSrc = image.getAttribute('src')
      // A poll a second later re-renders with the same snapshot: too soon.
      vi.setSystemTime(new Date('2026-09-15T12:00:01Z'))
      setFeatures([camera()])
      await nextTick()
      expect(image.getAttribute('src')).toBe(firstSrc)
      // A poll past the floor refreshes the still.
      vi.setSystemTime(new Date('2026-09-15T12:00:20Z'))
      setFeatures([camera()])
      await nextTick()
      expect(image.getAttribute('src')).not.toBe(firstSrc)
      vi.useRealTimers()
    })

    it('does not touch a card whose camera has lost its image on refresh', async () => {
      desktop()
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      // Same properties except imageUrl — that changes the signature, so the
      // card is rebuilt rather than refreshed; the refresh guard's early return
      // is what keeps `_refreshCardImage` from touching a card with no image.
      setFeatures([camera({ imageUrl: null })])
      await nextTick()
      const noImageCard = created.markers.find(
        (marker) => !marker.removed && marker.element.getAttribute('role') === 'group',
      )!
      expect(noImageCard.element.querySelector('img')).toBeNull()
      setFeatures([camera({ imageUrl: null })])
      await nextTick()
      expect(noImageCard.removed).toBe(false)
    })

    it('remembers the width the operator drags a card to for the cards built after it', () => {
      desktop()
      const observers: Array<{ callback: ResizeObserverCallback; observed: Element[] }> = []
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observed: Element[] = []
          constructor(public callback: ResizeObserverCallback) {
            observers.push(this)
          }
          observe(element: Element) {
            this.observed.push(element)
          }
          disconnect() {}
        },
      )
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0)])
      const { control } = addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      const firstCard = liveCard()
      const observer = observers[0]!
      expect(observer.observed).toContain(firstCard.element)
      observer.callback(
        [{ contentRect: { width: 640 } } as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      )
      // A width under the minimum is ignored (the observer also fires while a
      // card is being torn down).
      observer.callback(
        [{ contentRect: { width: 12 } } as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      )
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 300, 300)])
      return nextTick().then(() => {
        const cards = created.markers.filter(
          (marker) => !marker.removed && marker.element.querySelector('img'),
        )
        expect(cards[1]!.element.style.width).toBe('640px')
        control.onRemove()
      })
    })

    it('builds cards without a ResizeObserver (older engines) and still resizes via CSS', () => {
      desktop()
      vi.stubGlobal('ResizeObserver', undefined)
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => PREVIEW_CARD_ZOOM }))
      expect(liveCard().element.style.resize).toBe('horizontal')
    })
  })

  // ── clustering ─────────────────────────────────────────────────────────────

  describe('clustering (groupByGridCell at every zoom)', () => {
    function countMarkers() {
      return created.markers.filter(
        (marker) =>
          marker.element.classList.contains('traffic-camera-cluster-marker') && !marker.removed,
      )
    }
    function labelMarkers() {
      return created.markers.filter(
        (marker) =>
          !marker.element.classList.contains('traffic-camera-cluster-marker') && !marker.removed,
      )
    }

    it('groups nearby cameras into one count below the label-reveal zoom (COUNT cell size)', () => {
      setFeatures([
        camera({ id: 'durham-cc:a' }, 0, 0),
        camera({ id: 'durham-cc:b' }, 10, 0), // within the 48px COUNT cell
      ])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      expect(countMarkers()).toHaveLength(1)
      expect(countMarkers()[0]!.element.textContent).toBe('2')
      expect(labelMarkers()).toHaveLength(0)
    })

    it('keeps cameras far enough apart as separate counts even below the reveal zoom', () => {
      setFeatures([
        camera({ id: 'durham-cc:a' }, 0, 0),
        camera({ id: 'durham-cc:b' }, 500, 0), // well beyond the 48px COUNT cell
      ])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      // Each ends up alone in its own grid cell; a lone cell is still drawn as
      // a count below the reveal zoom (labels never show at this zoom).
      expect(countMarkers()).toHaveLength(2)
    })

    it('shows individual labelled markers above the reveal zoom when cameras are spread apart (LABEL cell size)', () => {
      setFeatures([
        camera({ id: 'durham-cc:a' }, 0, 0),
        camera({ id: 'durham-cc:b' }, 500, 0), // well beyond the 120px LABEL cell
      ])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      expect(labelMarkers()).toHaveLength(2)
      expect(countMarkers()).toHaveLength(0)
    })

    it('still groups cameras that remain close together at the reveal zoom (LABEL cell size)', () => {
      setFeatures([
        camera({ id: 'durham-cc:a' }, 0, 0),
        camera({ id: 'durham-cc:b' }, 10, 0), // within the wider 120px LABEL cell too
      ])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      expect(countMarkers()).toHaveLength(1)
      expect(countMarkers()[0]!.element.textContent).toBe('2')
    })

    it('names the count for assistive tech with the true figure', () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      expect(countMarkers()[0]!.element.getAttribute('aria-label')).toBe(
        '2 traffic cameras here — zoom in to see them',
      )
    })

    it('zooms in on click by +2, from wherever the map currently sits', () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      const map = makeFakeMap({ getZoom: () => 12 })
      addControl(map)
      countMarkers()[0]!.element.dispatchEvent(new Event('click'))
      expect(map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: 14 }), // 12 + 2, never less than current
      )
    })

    it('never zooms in past the reveal zoom by less than +2, even starting well below it', () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      const map = makeFakeMap({ getZoom: () => 2 })
      addControl(map)
      countMarkers()[0]!.element.dispatchEvent(new Event('click'))
      // max(2+2, LABEL_REVEAL_ZOOM) — the floor, not a small +2 hop that would
      // leave the group still collapsed.
      expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: LABEL_REVEAL_ZOOM }))
    })

    it('clicking the count stops the click reaching the map underneath', () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      const map = makeFakeMap({ getZoom: () => 6 })
      addControl(map)
      const click = new Event('click')
      const stop = vi.spyOn(click, 'stopPropagation')
      countMarkers()[0]!.element.dispatchEvent(click)
      expect(stop).toHaveBeenCalled()
    })

    it('regroups when a moveend crosses the label-reveal zoom, without any feature change', () => {
      // Same features throughout — only the map's zoom (read live via
      // getZoom()) changes, so this proves the moveend listener itself drives
      // a re-render rather than relying on the featuresByFeed watcher.
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 500, 0)])
      const map = makeFakeMap()
      map.setZoom(6) // below reveal — each camera is a lone cell, drawn as a count of 1
      addControl(map)
      expect(countMarkers()).toHaveLength(2)
      expect(labelMarkers()).toHaveLength(0)

      map.setZoom(LABEL_REVEAL_ZOOM) // above reveal — the same two cameras now get labels
      map._emit('moveend')
      expect(countMarkers()).toHaveLength(0)
      expect(labelMarkers()).toHaveLength(2)
    })

    it('keeps a count marker in place across a re-render rather than rebuilding it, unless the count changes', async () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      const first = countMarkers()[0]!
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      await nextTick()
      expect(countMarkers()).toHaveLength(1)
      expect(countMarkers()[0]).toBe(first)
    })

    it('rebuilds the count marker (with the new figure) when a camera joins its group', async () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      const before = countMarkers()[0]!
      expect(before.element.textContent).toBe('2')
      setFeatures([
        camera({ id: 'durham-cc:a' }, 0, 0),
        camera({ id: 'durham-cc:b' }, 10, 0),
        camera({ id: 'durham-cc:c' }, 15, 0),
      ])
      await nextTick()
      expect(before.removed).toBe(true)
      const after = countMarkers()
      expect(after).toHaveLength(1)
      expect(after[0]!.element.textContent).toBe('3')
    })

    it('removes stale cluster and camera markers once nothing occupies them any more', async () => {
      setFeatures([camera({ id: 'durham-cc:a' }, 0, 0), camera({ id: 'durham-cc:b' }, 10, 0)])
      addControl(makeFakeMap({ getZoom: () => 6 }))
      expect(countMarkers()).toHaveLength(1)
      setFeatures([])
      await nextTick()
      expect(created.markers.every((marker) => marker.removed)).toBe(true)
    })
  })

  // ── viewport filtering ────────────────────────────────────────────────────

  describe('viewport', () => {
    it('publishes the current bounds to the store on every render', () => {
      const map = makeFakeMap()
      addControl(map)
      expect(landFeedsStore.viewportBounds).toEqual({
        west: -1000,
        south: -1000,
        east: 1000,
        north: 1000,
      })
    })

    it('only plots cameras within the viewport (plus padding)', () => {
      setFeatures([
        camera({ id: 'durham-cc:inside' }, 0, 0),
        camera({ id: 'durham-cc:outside' }, 5000, 5000),
      ])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const ids = created.markers
        .filter(
          (marker) =>
            !marker.removed && !marker.element.classList.contains('traffic-camera-cluster-marker'),
        )
        .map((marker) => marker.element.getAttribute('aria-label'))
      expect(ids).toEqual(['Traffic camera, Framwellgate Peth, West, LIVE'])
    })

    it('draws nothing when every camera falls outside the viewport', () => {
      setFeatures([camera({ id: 'durham-cc:outside' }, 5000, 5000)])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      expect(created.markers.filter((marker) => !marker.removed)).toHaveLength(0)
    })

    it('draws nothing at all while the layer is hidden, regardless of viewport content', () => {
      landStore.setTrafficCamerasLayerVisible(false)
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      expect(created.markers.filter((marker) => !marker.removed)).toHaveLength(0)
    })
  })

  // ── accessible table ──────────────────────────────────────────────────────

  describe('accessible table', () => {
    it('shows an empty message with no cameras in view', () => {
      const { map } = addControl()
      const region = map._container.querySelector('[role="region"]')
      expect(region?.getAttribute('aria-label')).toBe('Traffic cameras')
      expect(region?.textContent).toContain('No traffic cameras in view.')
    })

    it('lists every visible camera with its name, view, status and source', () => {
      setFeatures([camera()])
      const { map } = addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const region = map._container.querySelector('[role="region"]')!
      expect(region.querySelector('caption')?.textContent).toBe('Traffic cameras in view')
      const headers = Array.from(region.querySelectorAll('th')).map((th) => th.textContent)
      expect(headers).toEqual(['Name', 'View', 'Status', 'Updated', 'Source'])
      expect(region.textContent).toContain('Framwellgate Peth')
      expect(region.textContent).toContain('Durham County Council')
    })

    it('escapes HTML in a camera name so the table cannot be used to inject markup', () => {
      setFeatures([camera({ name: '<img src=x onerror=alert(1)>' })])
      const { map } = addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const region = map._container.querySelector('[role="region"]')!
      expect(region.querySelector('img')).toBeNull()
      expect(region.textContent).toContain('<img src=x onerror=alert(1)>')
    })

    it('has no accessibility violations', async () => {
      setFeatures([camera()])
      const { map } = addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const region = map._container.querySelector('[role="region"]') as HTMLElement
      expect(await axe(region)).toHaveNoViolations()
    })
  })

  // ── list ↔ map parity ─────────────────────────────────────────────────────

  // The single `land-camera-selected` event has been split in two, so each
  // direction has its own contract: the pane's preview still asks the map to
  // fly + open (CAMERA_PREVIEW_EVENT), and a marker click asks the pane to
  // expand the row (CAMERA_OPEN_EVENT).
  describe(`${CAMERA_PREVIEW_EVENT} (pane → map)`, () => {
    it('flies to the requested camera and opens its popup once the flight lands', () => {
      setFeatures([camera({ id: 'durham-cc:cam1' }, 3, 4)])
      const map = makeFakeMap({ getZoom: () => 2 })
      addControl(map)
      document.dispatchEvent(
        new CustomEvent(CAMERA_PREVIEW_EVENT, { detail: { featureId: 'durham-cc:cam1' } }),
      )
      expect(map.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [3, 4], zoom: LABEL_REVEAL_ZOOM }),
      )
      // Opened on arrival, not on request — a popup placed mid-flight lands off
      // the camera it belongs to.
      expect(created.popups).toHaveLength(0)
      map._emitOnce('moveend')
      expect(created.popups).toHaveLength(1)
    })

    it('keeps the current zoom when it is already past the label-reveal level', () => {
      setFeatures([camera({ id: 'durham-cc:cam1' }, 3, 4)])
      const map = makeFakeMap({ getZoom: () => 17 })
      addControl(map)
      document.dispatchEvent(
        new CustomEvent(CAMERA_PREVIEW_EVENT, { detail: { featureId: 'durham-cc:cam1' } }),
      )
      // Zooming back out to the reveal level would throw away the operator's
      // street-level view, so the reveal zoom is a floor, not a target.
      expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 17 }))
    })

    it('does nothing for an id that matches no currently-loaded feature', () => {
      setFeatures([camera({ id: 'durham-cc:cam1' })])
      const map = makeFakeMap()
      addControl(map)
      expect(() =>
        document.dispatchEvent(
          new CustomEvent(CAMERA_PREVIEW_EVENT, { detail: { featureId: 'unknown' } }),
        ),
      ).not.toThrow()
      expect(map.flyTo).not.toHaveBeenCalled()
    })

    // Asserted through add/removeEventListener rather than by dispatching after
    // removal: a leaked listener would only throw on the torn-down map, and
    // jsdom swallows a listener's exception, so a dispatch-based test would pass
    // either way. What actually has to hold is that the SAME bound reference is
    // handed to both calls — otherwise the listener is never detached.
    it('detaches its listener on remove, using the same bound handler it registered', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      setFeatures([camera({ id: 'durham-cc:cam1' }, 3, 4)])
      const { control } = addControl()
      const registered = addSpy.mock.calls.find(([type]) => type === CAMERA_PREVIEW_EVENT)
      expect(registered).toBeDefined()

      control.onRemove()
      expect(removeSpy).toHaveBeenCalledWith(CAMERA_PREVIEW_EVENT, registered![1])
    })
  })

  describe(`${CAMERA_OPEN_EVENT} (map → pane)`, () => {
    it('expands the clicked camera in the FILTER pane and announces it', () => {
      const listener = vi.fn()
      document.addEventListener(CAMERA_OPEN_EVENT, listener)
      setFeatures([camera({ id: 'durham-cc:cam1' })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
      document.removeEventListener(CAMERA_OPEN_EVENT, listener)

      // The store carries the expansion (it survives the pane's teleport
      // remount); the event is what brings the pane forward.
      expect(landStore.searchExpandedCallsign).toBe('durham-cc:cam1')
      expect(listener).toHaveBeenCalledOnce()
      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        featureId: 'durham-cc:cam1',
      })
    })
  })

  // ── popup ──────────────────────────────────────────────────────────────────

  describe('popup', () => {
    function openPopup(overrides: Partial<CameraFeature['properties']> = {}) {
      setFeatures([camera(overrides)])
      const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
      addControl(map)
      const marker = created.markers[created.markers.length - 1]!
      marker.element.dispatchEvent(new Event('click'))
      return { map, marker, popup: created.popups[created.popups.length - 1]! }
    }

    it('moves focus into the popup content on open, made focusable via tabIndex -1', () => {
      const { popup } = openPopup()
      expect(popup.content!.tabIndex).toBe(-1)
      // The popup content is genuinely attached and focusable (tabIndex -1), so
      // this is real jsdom focus, not just a call-was-made spy assertion.
      expect(document.activeElement).toBe(popup.content)
    })

    it('closes on Escape and returns focus to the trigger element', () => {
      const { marker, popup } = openPopup()
      const focusSpy = vi.spyOn(marker.element, 'focus')
      popup.content!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(popup.removed).toBe(true)
      expect(focusSpy).toHaveBeenCalledOnce()
    })

    it('ignores keys other than Escape so typing near the popup does not close it', () => {
      const { popup } = openPopup()
      popup.content!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      expect(popup.removed).toBe(false)
    })

    it('replaces an already-open popup rather than stacking two', () => {
      setFeatures([
        camera({ id: 'durham-cc:cam1' }, 0, 0),
        camera({ id: 'durham-cc:cam2' }, 500, 0),
      ])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const [first, second] = created.markers
      first!.element.dispatchEvent(new Event('click'))
      second!.element.dispatchEvent(new Event('click'))
      expect(created.popups[0]!.removed).toBe(true)
      expect(created.popups[1]!.removed).toBe(false)
    })

    it('carries no state chip — the picture is the popup, state lives on the marker and in the sidebar', () => {
      const { popup } = openPopup({ state: 'offline' })
      expect(popup.content!.textContent).not.toContain('OFFLINE')
      expect(popup.content!.textContent).not.toContain('LIVE')
    })

    // Replaces the old "view line" / "omits the view paragraph" pair: the view
    // line, state chip, cadence and source have all moved to the pane's row,
    // which opens alongside the popup. The popup is now the name, the frame's
    // timestamp, and the picture — nothing else.
    it('is the camera name as a heading and the picture, with no prose body', () => {
      const { popup } = openPopup({ view: 'View towards the City Centre' })
      const heading = popup.content!.querySelector('h2')!
      expect(heading.textContent).toBe('Framwellgate Peth')
      // The view line lived in a <p>; it belongs to the pane's row now.
      expect(popup.content!.querySelectorAll('p')).toHaveLength(0)
      expect(popup.content!.textContent).not.toContain('View towards the City Centre')
      expect(popup.content!.querySelector('img')).not.toBeNull()
    })

    it("shows the frame's timestamp beside the name when the feed reports one", () => {
      const { popup } = openPopup({ updatedAt: '2026-09-14T19:29:11Z' })
      const heading = popup.content!.querySelector('h2')!
      const stamp = heading.nextElementSibling as HTMLElement
      // 24-hour local wall time, as the APRS labels format heard times.
      expect(stamp.textContent).toBe(
        new Date('2026-09-14T19:29:11Z').toLocaleTimeString([], { hour12: false }),
      )
    })

    it('leaves the timestamp out entirely when the feed reports none', () => {
      const { popup } = openPopup({ updatedAt: null })
      const heading = popup.content!.querySelector('h2')!
      expect(heading.nextElementSibling).toBeNull()
    })

    it('never prints the refresh cadence, source name or state — those live in the pane row', () => {
      landFeedsStore.feeds = [durhamFeed({ refreshSeconds: 60 })]
      const { popup } = openPopup({ updatedAt: '2026-09-14T19:29:11Z', state: 'stale' })
      expect(popup.content!.textContent).not.toContain('refreshes every')
      expect(popup.content!.textContent).not.toContain('Durham County Council')
      expect(popup.content!.textContent).not.toContain('STALE')
    })

    it('never links out or prints attribution — both moved to the sidebar source heading', () => {
      const { popup } = openPopup({
        externalUrl: 'https://example.com/cam',
        attribution: 'Crown copyright',
      })
      expect(popup.content!.querySelector('a')).toBeNull()
      expect(popup.content!.textContent).not.toContain('OPEN SOURCE')
      expect(popup.content!.textContent).not.toContain('Crown copyright')
    })

    /**
     * TfL JamCams serve CIF (352×288) frames shot for 4:3 with PAL's
     * non-square pixels: rendered at their stored ratio the picture is
     * stretched tall, so the control corrects it once the media reports its
     * intrinsic size. Feeds that already serve square pixels are left alone.
     */
    describe('CIF aspect correction', () => {
      /** jsdom never populates intrinsic dimensions, so stand them in. */
      function stubIntrinsicSize(element: HTMLElement, dimensions: Record<string, number>): void {
        for (const [property, value] of Object.entries(dimensions)) {
          Object.defineProperty(element, property, { value, configurable: true })
        }
      }

      it('shows a CIF-sized still at the 4:3 it was shot for', () => {
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        stubIntrinsicSize(image, { naturalWidth: 352, naturalHeight: 288 })
        image.dispatchEvent(new Event('load'))
        expect(image.style.aspectRatio).toBe('4 / 3')
        expect(image.style.objectFit).toBe('fill')
        expect(image.style.height).toBe('auto')
      })

      it('leaves a still that already has square pixels at its own ratio', () => {
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        stubIntrinsicSize(image, { naturalWidth: 1280, naturalHeight: 720 })
        image.dispatchEvent(new Event('load'))
        expect(image.style.aspectRatio).toBe('')
        expect(image.style.objectFit).toBe('')
      })

      it('does nothing while the still has reported no size yet', () => {
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        // A failed load fires with 0×0; dividing by it would be meaningless.
        stubIntrinsicSize(image, { naturalWidth: 0, naturalHeight: 0 })
        image.dispatchEvent(new Event('load'))
        expect(image.style.aspectRatio).toBe('')
      })

      it('corrects a CIF-sized clip the same way once its metadata arrives', () => {
        const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
        const video = popup.content!.querySelector('video')!
        stubIntrinsicSize(video, { videoWidth: 352, videoHeight: 288 })
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.style.aspectRatio).toBe('4 / 3')
        expect(video.style.objectFit).toBe('fill')
      })
    })

    it('renders the image with an accessible alt text', () => {
      const { popup } = openPopup({ imageUrl: '/api/land/feeds/durham-cc/image/cam1' })
      const image = popup.content!.querySelector('img')!
      expect(image.alt).toBe('Framwellgate Peth, West — latest camera image')
    })

    it('omits the media block entirely when the feed has no image and no clip', () => {
      const { popup } = openPopup({ imageUrl: null, clipUrl: null })
      expect(popup.content!.querySelector('img')).toBeNull()
      expect(popup.content!.querySelector('video')).toBeNull()
    })

    it('re-fetches the image on a timer while the popup is open, cleared once it closes', () => {
      vi.useFakeTimers()
      const clearSpy = vi.spyOn(globalThis, 'clearInterval')
      const { popup } = openPopup({ imageUrl: '/api/land/feeds/durham-cc/image/cam1' })
      const image = popup.content!.querySelector('img')!
      const before = image.src
      vi.advanceTimersByTime(60_000)
      expect(image.src).not.toBe(before) // cache-busted, so the src string changed

      popup.closeHandlers.forEach((handler) => handler())
      expect(clearSpy).toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('does not render a <video> when the feed has no clipUrl', () => {
      const { popup } = openPopup({ clipUrl: null })
      expect(popup.content!.querySelector('video')).toBeNull()
    })

    // Replaces the old "PLAY toggle" test: the clip now plays by itself, so
    // there is no button to assert. What has to hold instead is that it is a
    // muted, looping, inline autoplay clip posted with the still.
    it('renders a muted, looping, autoplaying <video> when a clip is available', () => {
      const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
      const video = popup.content!.querySelector('video')!
      expect(video.muted).toBe(true)
      expect(video.loop).toBe(true)
      expect(video.autoplay).toBe(true)
      expect(video.playsInline).toBe(true)
      // Built from the feature id ("<feedId>:<providerRef>"), not from the
      // clipUrl property, so the clip is proxied through our own backend.
      expect(video.getAttribute('src')).toBe('/api/land/feeds/durham-cc/clip/cam1')
      // The still stays underneath as the poster and the fallback, and the clip
      // is hidden until it is actually playing.
      expect(video.poster).toBe(popup.content!.querySelector('img')!.src)
      expect(video.style.display).toBe('none')
      // No manual control survives — the popup has no buttons of its own.
      expect(popup.content!.querySelectorAll('button')).toHaveLength(0)
    })

    it('leaves the still image blank when a feed offers only a clip', () => {
      const { popup } = openPopup({ imageUrl: null, clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
      const image = popup.content!.querySelector('img')!
      expect(image.getAttribute('src')).toBeNull()
      expect(popup.content!.querySelector('video')).not.toBeNull()
    })

    it('names the clip after the camera alone when the feed gives no view direction', () => {
      const { popup } = openPopup({
        name: 'Tyne Bridge',
        view: null,
        clipUrl: '/api/land/feeds/tfl-jamcams/clip/1',
      })
      const video = popup.content!.querySelector('video')!
      expect(video.getAttribute('aria-label')).toBe('Tyne Bridge — looping clip')
    })

    it('never renders a <video> under prefers-reduced-motion, even with a clip available', () => {
      const matchMediaSpy = vi.fn().mockReturnValue({ matches: true })
      vi.stubGlobal('matchMedia', matchMediaSpy)
      const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
      expect(popup.content!.querySelector('video')).toBeNull()
      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
      vi.unstubAllGlobals()
    })

    // Replaces the old manual PLAY/STILL toggle tests. The clip now starts
    // itself, and the still/clip swap is driven by the element's own media
    // events — which is what these cover.
    describe('clip autoplay lifecycle', () => {
      function openClipPopup() {
        const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
        const video = popup.content!.querySelector('video')!
        const image = popup.content!.querySelector('img')!
        return { popup, video, image }
      }

      it('starts the clip only once it reports it can play, not while detached', () => {
        const { video } = openClipPopup()
        const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
        // A play() before insertion is aborted by the load that follows it, so
        // nothing may have been attempted up to this point.
        expect(playSpy).not.toHaveBeenCalled()
        video.dispatchEvent(new Event('canplay'))
        expect(playSpy).toHaveBeenCalledOnce()
        // `once: true` — a second canplay must not restart it.
        video.dispatchEvent(new Event('canplay'))
        expect(playSpy).toHaveBeenCalledOnce()
      })

      it('leaves the still up when autoplay is refused', async () => {
        const { video, image } = openClipPopup()
        vi.spyOn(video, 'play').mockRejectedValue(new Error('autoplay blocked'))
        video.dispatchEvent(new Event('canplay'))
        await Promise.resolve()
        expect(video.style.display).toBe('none')
        expect(image.style.display).toBe('block') // untouched, as built
      })

      it('swaps the still for the clip once it is genuinely playing', () => {
        const { video, image } = openClipPopup()
        video.dispatchEvent(new Event('playing'))
        expect(video.style.display).toBe('block')
        expect(image.style.display).toBe('none')
      })

      it('falls back to the still when the clip errors', () => {
        const { video, image } = openClipPopup()
        video.dispatchEvent(new Event('playing'))
        video.dispatchEvent(new Event('error'))
        expect(video.style.display).toBe('none')
        expect(image.style.display).toBe('block')
      })

      it('restarts the loop from the top when the browser gives up mid-clip', () => {
        const { video } = openClipPopup()
        const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
        video.currentTime = 4
        video.dispatchEvent(new Event('pause'))
        expect(video.currentTime).toBe(0)
        expect(playSpy).toHaveBeenCalledOnce()
      })

      it('swallows a refused restart rather than surfacing an unhandled rejection', async () => {
        const { video } = openClipPopup()
        vi.spyOn(video, 'play').mockRejectedValue(new Error('still refused'))
        video.dispatchEvent(new Event('pause'))
        await expect(Promise.resolve()).resolves.toBeUndefined()
      })

      it('does not restart a paused clip that has been detached from the popup', () => {
        const { video } = openClipPopup()
        const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
        video.remove()
        video.currentTime = 4
        video.dispatchEvent(new Event('pause'))
        expect(playSpy).not.toHaveBeenCalled()
        expect(video.currentTime).toBe(4)
      })

      it('does not restart a clip that failed, so a broken feed is not retried in a loop', () => {
        const { video } = openClipPopup()
        const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
        // A real element sets `error` itself; jsdom never does, so stand one in.
        Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true })
        video.dispatchEvent(new Event('pause'))
        expect(playSpy).not.toHaveBeenCalled()
      })
    })

    // Replaces the old "meta line" pair: the cadence is no longer printed in
    // the popup, but it is still read from the store — to size the open card's
    // image-refresh timer.
    describe("image refresh cadence (the feed's own, floored)", () => {
      it("uses the feed's configured cadence when it is slower than the floor", () => {
        vi.useFakeTimers()
        landFeedsStore.feeds = [durhamFeed({ refreshSeconds: 300 })]
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        const firstSrc = image.src

        vi.advanceTimersByTime(299_000)
        expect(image.src).toBe(firstSrc)
        vi.advanceTimersByTime(2_000)
        expect(image.src).not.toBe(firstSrc)
        vi.useRealTimers()
      })

      it('floors a very fast feed at 15 s so a left-open card cannot hammer it', () => {
        vi.useFakeTimers()
        landFeedsStore.feeds = [durhamFeed({ refreshSeconds: 1 })]
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        const firstSrc = image.src

        vi.advanceTimersByTime(14_000)
        expect(image.src).toBe(firstSrc)
        vi.advanceTimersByTime(2_000)
        expect(image.src).not.toBe(firstSrc)
        vi.useRealTimers()
      })

      it('falls back to 60 s when the feed is unknown to the store', () => {
        vi.useFakeTimers()
        landFeedsStore.feeds = []
        const { popup } = openPopup()
        const image = popup.content!.querySelector('img')!
        const firstSrc = image.src

        vi.advanceTimersByTime(59_000)
        expect(image.src).toBe(firstSrc)
        vi.advanceTimersByTime(2_000)
        expect(image.src).not.toBe(firstSrc)
        vi.useRealTimers()
      })

      it('stops re-fetching a camera that has lost its image URL', () => {
        vi.useFakeTimers()
        const { popup } = openPopup({ imageUrl: null, clipUrl: '/api/land/feeds/tfl/clip/1' })
        const image = popup.content!.querySelector('img')!
        expect(image.getAttribute('src')).toBeNull()
        vi.advanceTimersByTime(120_000)
        expect(image.getAttribute('src')).toBeNull()
        vi.useRealTimers()
      })
    })

    // ── centring the open card in the visible map ──────────────────────────

    describe('centring', () => {
      /** Stub an element's box, as jsdom reports every rect as zero. */
      function stubRect(
        element: Element,
        rect: { left: number; top: number; width: number; height: number },
      ): void {
        element.getBoundingClientRect = () =>
          ({
            left: rect.left,
            top: rect.top,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
            width: rect.width,
            height: rect.height,
            x: rect.left,
            y: rect.top,
          }) as DOMRect
      }

      /** A visible-map chrome element the control measures around. */
      function chrome(
        id: string,
        rect: { left: number; top: number; width: number; height: number },
      ): HTMLElement {
        const element = document.createElement('div')
        element.id = id
        stubRect(element, rect)
        document.body.appendChild(element)
        return element
      }

      it('pans the map so the card sits in the middle of the visible map', async () => {
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        // Card centred at (200, 100); the visible map's centre is (500, 400).
        stubRect(created.popups[0]!.content!, { left: 100, top: 50, width: 200, height: 100 })

        await nextFrame()
        expect(map.panBy).toHaveBeenCalledWith([-300, -300], { duration: 250 })
      })

      it('measures the visible map inside the header, drawer, tab rail and icon rail', async () => {
        // All four sit fixed over the map rather than beside it, so the centre
        // the card is panned to is not the container's centre.
        chrome('nav', { left: 0, top: 0, width: 1000, height: 60 })
        chrome('map-sidebar-rail', { left: 0, top: 60, width: 40, height: 740 })
        chrome('map-sidebar', { left: 40, top: 60, width: 260, height: 740 })
        chrome('land-side-menu', { left: 940, top: 60, width: 60, height: 740 })

        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        // Visible map is x 300…940, y 60…800 → centre (620, 430).
        stubRect(created.popups[0]!.content!, { left: 0, top: 0, width: 200, height: 100 })

        await nextFrame()
        expect(map.panBy).toHaveBeenCalledWith([100 - 620, 50 - 430], { duration: 250 })
      })

      it('ignores chrome that is collapsed to zero width or sits away from the map edge', async () => {
        // A closed drawer (zero width) and a rail drawn mid-map must not shrink
        // the box the card is centred in.
        chrome('map-sidebar', { left: 0, top: 0, width: 0, height: 800 })
        chrome('land-side-menu', { left: 400, top: 0, width: 60, height: 800 })

        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        stubRect(created.popups[0]!.content!, { left: 100, top: 50, width: 200, height: 100 })

        await nextFrame()
        // Same as the bare-container case: the full 1000×800 box.
        expect(map.panBy).toHaveBeenCalledWith([-300, -300], { duration: 250 })
      })

      it('does not pan a card that is already centred, within a couple of pixels', async () => {
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        stubRect(created.popups[0]!.content!, { left: 400, top: 350, width: 200, height: 100 })

        await nextFrame()
        expect(map.panBy).not.toHaveBeenCalled()
      })

      it('re-checks up to three times, since a pan started mid-animation lands short', async () => {
        vi.useFakeTimers()
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        stubRect(created.popups[0]!.content!, { left: 100, top: 50, width: 200, height: 100 })

        vi.advanceTimersByTime(20) // the requestAnimationFrame jsdom schedules
        expect(map.panBy).toHaveBeenCalledTimes(1)
        // Four passes in total (the first plus three re-checks), then it stops
        // even though the stubbed card never actually moves.
        vi.advanceTimersByTime(4 * 320)
        expect(map.panBy).toHaveBeenCalledTimes(4)
        vi.useRealTimers()
      })

      it('re-centres whenever the card changes size, and stops observing on close', async () => {
        const observers: Array<{ callback: ResizeObserverCallback; disconnected: boolean }> = []
        vi.stubGlobal(
          'ResizeObserver',
          class {
            disconnected = false
            constructor(public callback: ResizeObserverCallback) {
              observers.push(this)
            }
            observe() {}
            disconnect() {
              this.disconnected = true
            }
          },
        )
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        const { control } = addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        stubRect(created.popups[0]!.content!, { left: 400, top: 350, width: 200, height: 100 })
        await nextFrame()
        expect(map.panBy).not.toHaveBeenCalled()

        // The still arrives and the card grows upward off centre.
        stubRect(created.popups[0]!.content!, { left: 100, top: 50, width: 200, height: 100 })
        const popupObserver = observers[observers.length - 1]!
        popupObserver.callback([], popupObserver as unknown as ResizeObserver)
        await nextFrame()
        expect(map.panBy).toHaveBeenCalledWith([-300, -300], { duration: 250 })

        control.onRemove()
        expect(popupObserver.disconnected).toBe(true)
      })

      it('opens the popup without a ResizeObserver (older engines)', () => {
        vi.stubGlobal('ResizeObserver', undefined)
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        expect(created.popups).toHaveLength(1)
        expect(created.popups[0]!.removed).toBe(false)
      })

      it('gives up centring once the popup has gone', async () => {
        setFeatures([camera()])
        const map = makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM })
        stubRect(map._container, { left: 0, top: 0, width: 1000, height: 800 })
        const { control } = addControl(map)
        created.markers[created.markers.length - 1]!.element.dispatchEvent(new Event('click'))
        stubRect(created.popups[0]!.content!, { left: 100, top: 50, width: 200, height: 100 })
        control.onRemove()

        await nextFrame()
        expect(map.panBy).not.toHaveBeenCalled()
      })
    })
  })
})
