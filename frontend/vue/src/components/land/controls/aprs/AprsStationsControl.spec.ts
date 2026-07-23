import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

// ── maplibre-gl mock: record created markers/popups so the control's DOM/
//    lifecycle effects can be asserted without a real map. The classes live in
//    vi.hoisted so they exist when the (hoisted) vi.mock factory runs. ──────────
interface RecordedMarker {
  element: HTMLElement
  lngLat: [number, number] | null
  removed: boolean
}
interface RecordedPopup {
  html: string
  removed: boolean
}

const mocks = vi.hoisted(() => {
  const created = { markers: [] as RecordedMarker[], popups: [] as RecordedPopup[] }
  class MockMarker {
    element: HTMLElement
    lngLat: [number, number] | null = null
    removed = false
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      created.markers.push(this)
    }
    setLngLat(coords: [number, number]): this {
      this.lngLat = coords
      return this
    }
    addTo(): this {
      return this
    }
    remove(): this {
      this.removed = true
      return this
    }
  }
  class MockPopup {
    html = ''
    removed = false
    constructor() {
      created.popups.push(this)
    }
    setLngLat(): this {
      return this
    }
    setHTML(html: string): this {
      this.html = html
      return this
    }
    addTo(): this {
      return this
    }
    remove(): this {
      this.removed = true
      return this
    }
  }
  return { created, MockMarker, MockPopup }
})

const created = mocks.created

vi.mock('maplibre-gl', () => ({ default: { Marker: mocks.MockMarker, Popup: mocks.MockPopup } }))

import { AprsStationsControl } from './AprsStationsControl'
import { useLandStore, type AprsStation } from '@/stores/land'

function station(overrides: Partial<AprsStation> = {}): AprsStation {
  return {
    callsign: 'M0ABC-9',
    latitude: 51.5,
    longitude: -0.1,
    symbol: '/>',
    comment: 'rolling',
    course: 90,
    speed: 30,
    altitude: 120,
    path: 'WIDE1-1',
    raw: 'M0ABC-9>APRS:!x',
    last_heard_ms: 1000,
    ...overrides,
  }
}

function makeFakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { getContainer: () => container, _container: container }
}

describe('AprsStationsControl', () => {
  let store: ReturnType<typeof useLandStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    created.markers.length = 0
    created.popups.length = 0
    // The control starts polling on init; stub fetch so the store never hits the
    // network, and spy on the polling methods to assert lifecycle wiring.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }),
    )
    store = useLandStore()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function addControl() {
    const control = new AprsStationsControl(store)
    const map = makeFakeMap()
    control.onAdd(map as never)
    return { control, map }
  }

  it('starts polling and plots existing stations on add', () => {
    const startSpy = vi.spyOn(store, 'startAprsPolling')
    store.aprsStations = [station()]
    addControl()
    expect(startSpy).toHaveBeenCalledOnce()
    expect(created.markers).toHaveLength(1)
    expect(created.markers[0].element.textContent).toContain('M0ABC-9')
    expect(created.markers[0].lngLat).toEqual([-0.1, 51.5])
  })

  it('renders a hidden accessible data table of stations', () => {
    store.aprsStations = [station()]
    const { map } = addControl()
    const region = map._container.querySelector('[role="region"]')
    expect(region?.getAttribute('aria-label')).toBe('APRS stations')
    expect(region?.querySelector('caption')?.textContent).toBe('APRS stations heard')
    expect(region?.textContent).toContain('M0ABC-9')
  })

  it('shows an empty a11y message when nothing is heard', () => {
    const { map } = addControl()
    const region = map._container.querySelector('[role="region"]')
    expect(region?.textContent).toContain('No APRS stations heard.')
    expect(created.markers).toHaveLength(0)
  })

  it('adds, moves, and removes markers as the station list changes', async () => {
    addControl()
    store.aprsStations = [station({ callsign: 'A' })]
    await nextTick()
    expect(created.markers.filter((marker) => !marker.removed)).toHaveLength(1)

    // Same callsign, new position → existing marker moved, not re-created.
    const before = created.markers.length
    store.aprsStations = [station({ callsign: 'A', latitude: 52 })]
    await nextTick()
    expect(created.markers).toHaveLength(before) // no new marker
    expect(created.markers[created.markers.length - 1].lngLat).toEqual([-0.1, 52])

    // Station disappears → its marker is removed.
    store.aprsStations = []
    await nextTick()
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
  })

  it('opens a popup with details when a marker is clicked', () => {
    store.aprsStations = [station({ comment: 'hi', course: 90, speed: 30 })]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    expect(created.popups).toHaveLength(1)
    const html = created.popups[0].html
    expect(html).toContain('M0ABC-9')
    expect(html).toContain('51.5000, -0.1000')
    expect(html).toContain('hi')
    expect(html).toContain('Course 90° · Speed 30 kn')
    expect(html).toContain('Heard')
  })

  it('omits movement and comment rows when absent, keeping partial movement', () => {
    store.aprsStations = [station({ comment: null, course: 45, speed: null })]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    const html = created.popups[0].html
    // Only course present → speed shown as em-dash (no "kn"); no comment line.
    expect(html).toContain('Course 45° · Speed —')
    expect(html).not.toContain('rolling')
  })

  it('shows a dash for course when only speed is present', () => {
    store.aprsStations = [station({ course: null, speed: 20 })]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    expect(created.popups[0].html).toContain('Course — · Speed 20 kn')
  })

  it('omits the movement row entirely when neither course nor speed is present', () => {
    store.aprsStations = [station({ course: null, speed: null })]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    expect(created.popups[0].html).not.toContain('Course')
  })

  it('closes a previous popup before opening a new one', () => {
    store.aprsStations = [station()]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    created.markers[0].element.dispatchEvent(new Event('click'))
    expect(created.popups).toHaveLength(2)
    expect(created.popups[0].removed).toBe(true) // first popup closed
  })

  it('escapes HTML in callsign/comment to prevent injection', () => {
    store.aprsStations = [station({ callsign: 'X&<Y>', comment: '<script>' })]
    addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    expect(created.popups[0].html).toContain('X&amp;&lt;Y&gt;')
    expect(created.popups[0].html).not.toContain('<script>')
  })

  it('toggles station visibility on button click', () => {
    store.aprsStations = [station()]
    const { control } = addControl()
    expect(created.markers.filter((marker) => !marker.removed)).toHaveLength(1)
    control.handleClickPublic() // hide
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
    control.handleClickPublic() // show again
    expect(created.markers.filter((marker) => !marker.removed).length).toBeGreaterThan(0)
  })

  it('stops polling and tears down markers, popup, and a11y region on remove', () => {
    const stopSpy = vi.spyOn(store, 'stopAprsPolling')
    store.aprsStations = [station()]
    const { control, map } = addControl()
    created.markers[0].element.dispatchEvent(new Event('click'))
    control.onRemove()
    expect(stopSpy).toHaveBeenCalledOnce()
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
    expect(created.popups[0].removed).toBe(true)
    expect(map._container.querySelector('[role="region"]')).toBeNull()
  })

  it('removes cleanly when no popup was ever opened', () => {
    store.aprsStations = [station()]
    const { control, map } = addControl()
    // No marker click → no popup; onRemove must still tear everything down.
    expect(() => control.onRemove()).not.toThrow()
    expect(created.popups).toHaveLength(0)
    expect(map._container.querySelector('[role="region"]')).toBeNull()
  })

  it('exposes a descriptive accessible name on its button', () => {
    const { control } = addControl()
    expect(control.button.getAttribute('aria-label')).toBe('Toggle APRS stations')
  })

  it('the accessible station table has no accessibility violations', async () => {
    store.aprsStations = [station()]
    const { map } = addControl()
    const region = map._container.querySelector('[role="region"]') as HTMLElement
    expect(await axe(region)).toHaveNoViolations()
  })
})
