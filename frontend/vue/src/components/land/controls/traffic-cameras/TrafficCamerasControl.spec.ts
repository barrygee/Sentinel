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

import { TrafficCamerasControl } from './TrafficCamerasControl'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, CameraFeatureState } from '@/types/landFeeds'

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

  it('setVisible starts and stops polling, and is a no-op when unchanged', () => {
    landStore.setTrafficCamerasLayerVisible(false)
    const { control } = addControl()
    vi.mocked(landFeedsStore.startPolling).mockClear()

    control.setVisible(true)
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()
    expect(landStore.trafficCamerasLayerVisible).toBe(true)

    control.setVisible(true) // unchanged — no-op
    expect(landFeedsStore.startPolling).toHaveBeenCalledOnce()

    control.setVisible(false)
    expect(landFeedsStore.stopPolling).toHaveBeenCalledOnce()
    expect(landStore.trafficCamerasLayerVisible).toBe(false)
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

    it('draws a live camera at full opacity with the standard badge pill', () => {
      const element = markerFor('live')
      expect(element.style.opacity).toBe('1')
      const well = element.querySelector('div')! as HTMLElement
      expect(well.style.opacity).toBe('1')
    })

    it('dims a stale camera to .45 overall, without recolouring the pill', () => {
      const element = markerFor('stale')
      expect(element.style.opacity).toBe('0.45')
    })

    it('recolours and dims an offline camera to .35, with no dimming on the wrapper', () => {
      const element = markerFor('offline')
      expect(element.style.opacity).toBe('1') // wrapper itself is not dimmed…
      const well = element.querySelector('div')! as HTMLElement
      expect(well.style.background).toBe('var(--color-button-bg)') // …the pill is recoloured…
      expect(well.style.opacity).toBe('0.35') // …and dimmed, along with the label
    })

    it('draws no borders anywhere on the marker pill', () => {
      const element = markerFor('live')
      expect(element.style.border).toBe('')
      const well = element.querySelector('div')!
      expect((well as HTMLElement).style.border).toBe('')
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

    it('shows a second label line for the view, uppercased, only when present', () => {
      setFeatures([camera({ view: 'West' })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const element = created.markers[created.markers.length - 1]!.element
      expect(element.textContent).toContain('WEST')

      created.markers.length = 0
      setFeatures([camera({ id: 'durham-cc:noview', view: null })])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const withoutView = created.markers[created.markers.length - 1]!.element
      expect(withoutView.textContent).not.toContain('WEST')
    })

    it('anchors the marker top-left, offset clear of the pin', () => {
      setFeatures([camera()])
      addControl(makeFakeMap({ getZoom: () => LABEL_REVEAL_ZOOM }))
      const marker = created.markers[created.markers.length - 1]!
      expect(marker.anchor).toBe('top-left')
      expect(marker.offset).toEqual([8, -6])
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

  describe('land-camera-selected (list → map parity)', () => {
    it('flies to the selected camera and opens its popup', () => {
      setFeatures([camera({ id: 'durham-cc:cam1' }, 3, 4)])
      const map = makeFakeMap({ getZoom: () => 2 })
      addControl(map)
      document.dispatchEvent(
        new CustomEvent('land-camera-selected', { detail: { featureId: 'durham-cc:cam1' } }),
      )
      expect(map.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [3, 4], zoom: LABEL_REVEAL_ZOOM }),
      )
      map._emitOnce('moveend')
      expect(created.popups).toHaveLength(1)
    })

    it('does nothing for an id that matches no currently-loaded feature', () => {
      setFeatures([camera({ id: 'durham-cc:cam1' })])
      const map = makeFakeMap()
      addControl(map)
      expect(() =>
        document.dispatchEvent(
          new CustomEvent('land-camera-selected', { detail: { featureId: 'unknown' } }),
        ),
      ).not.toThrow()
      expect(map.flyTo).not.toHaveBeenCalled()
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

    it('shows the view line as given, not upper-cased', () => {
      const { popup } = openPopup({ view: 'View towards the City Centre' })
      expect(popup.content!.textContent).toContain('View towards the City Centre')
    })

    it('omits the view paragraph entirely when the camera reports none', () => {
      const withView = openPopup({ view: 'West' }).popup
      const withoutView = openPopup({ view: null }).popup
      // One fewer <p> (meta + attribution remain; the view line is gone, not blank).
      expect(withoutView.content!.querySelectorAll('p')).toHaveLength(
        withView.content!.querySelectorAll('p').length - 1,
      )
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
      expect(popup.content!.textContent).not.toContain('PLAY')
    })

    it('renders a muted, looping <video> with a PLAY toggle when a clip is available', () => {
      const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
      const video = popup.content!.querySelector('video')!
      expect(video.muted).toBe(true)
      expect(video.loop).toBe(true)
      expect(video.playsInline).toBe(true)
      const toggle = Array.from(popup.content!.querySelectorAll('button')).find(
        (button) => button.textContent === 'PLAY',
      )
      expect(toggle).toBeDefined()
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

    it('toggles between the still image and the playing clip, swapping the button label', async () => {
      const { popup } = openPopup({ clipUrl: '/api/land/feeds/tfl-jamcams/clip/1' })
      const video = popup.content!.querySelector('video')!
      const image = popup.content!.querySelector('img')!
      const toggle = Array.from(popup.content!.querySelectorAll('button')).find(
        (button) => button.textContent === 'PLAY',
      )!
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
      const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {})

      toggle.dispatchEvent(new Event('click'))
      expect(video.style.display).toBe('block')
      expect(image.style.display).toBe('none')
      expect(toggle.textContent).toBe('STILL')
      expect(playSpy).toHaveBeenCalledOnce()

      toggle.dispatchEvent(new Event('click'))
      expect(video.style.display).toBe('none')
      expect(image.style.display).toBe('block')
      expect(toggle.textContent).toBe('PLAY')
      expect(pauseSpy).toHaveBeenCalledOnce()
    })

    it('shows the refresh cadence and update time in the meta line when known', () => {
      landFeedsStore.feeds = [
        {
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
        },
      ]
      const { popup } = openPopup({ updatedAt: '2026-09-14T19:29:11Z' })
      expect(popup.content!.textContent).toContain('refreshes every ~60s')
      expect(popup.content!.textContent).toContain('Durham County Council')
    })

    it('omits the refresh cadence from the meta line when the feed is unknown to the store', () => {
      const { popup } = openPopup()
      expect(popup.content!.textContent).not.toContain('refreshes every')
    })
  })
})
