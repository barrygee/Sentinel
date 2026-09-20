import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

// ── maplibre-gl mock: record every marker the control creates so its DOM and
//    lifecycle effects can be asserted without a real map. The class lives in
//    vi.hoisted so it exists when the (hoisted) vi.mock factory runs. ─────────
interface RecordedMarker {
  element: HTMLElement
  anchor: string | undefined
  offset: [number, number] | undefined
  lngLat: [number, number] | null
  removed: boolean
}
const mocks = vi.hoisted(() => {
  const created = { markers: [] as RecordedMarker[] }
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
    setOffset(offset: [number, number]): this {
      this.offset = offset
      return this
    }
    getElement(): HTMLElement {
      return this.element
    }
    addTo(): this {
      return this
    }
    remove(): this {
      this.removed = true
      return this
    }
  }
  return { created, MockMarker }
})
const created = mocks.created

vi.mock('maplibre-gl', () => ({ Marker: mocks.MockMarker }))
vi.mock('@/services/repeatersApi', () => ({ fetchRepeaterDirectory: vi.fn() }))
vi.mock('@/services/settingsApi', () => ({ put: vi.fn(), getNamespace: vi.fn() }))

import {
  RepeatersControl,
  REPEATER_LOCATE_EVENT,
  REPEATER_OPEN_EVENT,
  stationAccessibleName,
} from './RepeatersControl'
import { useLandStore } from '@/stores/land'
import { useRepeatersStore, DEFAULT_REPEATER_LABEL_FIELDS } from '@/stores/repeaters'
import * as repeatersApi from '@/services/repeatersApi'
import type {
  RepeaterChannel,
  RepeaterLabelFieldMap,
  RepeaterStation,
  RepeaterStatus,
} from '@/types/repeaters'

const OFF_AIR: RepeaterStatus = 'NOT OPERATIONAL'

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.7125,
    rxMhz: 145.1125,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 40,
    erpDbw: 12,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function station(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NR',
    latitude: 52,
    longitude: 0,
    locator: 'JO02PP',
    location: 'NORWICH',
    postcode: 'NR2',
    region: 'EA',
    keeper: 'G4XYZ',
    channels: [channel()],
    ...overrides,
  }
}

/**
 * Fake MapLibre map.
 *
 * `project` scales one degree to 100 px, so fixture positions a degree or more
 * apart never share a grouping cell (150 px at the label zoom) while positions
 * a fraction of a degree apart deliberately do.
 */
function makeFakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers: Record<string, (() => void)[]> = {}
  return {
    getContainer: () => container,
    _container: container,
    /** Default is above LABEL_REVEAL_ZOOM (9), so labels draw. */
    zoom: 10,
    /** Roughly the UK, so every fixture station is in view by default. */
    bounds: { west: -10, south: 49, east: 5, north: 61 },
    getZoom(): number {
      return this.zoom
    },
    getBounds() {
      const { west, south, east, north } = this.bounds
      return {
        getWest: () => west,
        getSouth: () => south,
        getEast: () => east,
        getNorth: () => north,
        getSouthWest: () => [west, south] as [number, number],
        getNorthEast: () => [east, north] as [number, number],
      }
    },
    project: ([longitude, latitude]: [number, number]) => ({
      x: longitude * 100,
      y: -latitude * 100,
    }),
    unproject: ([x, y]: [number, number]) => ({
      toArray: () => [x / 100, -y / 100] as [number, number],
    }),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    on: (event: string, handler: () => void) => {
      ;(handlers[event] ??= []).push(handler)
    },
    off: (event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter((each) => each !== handler)
    },
    /** Fire a map event, as MapLibre does once a pan or zoom settles. */
    _emit: (event: string) => (handlers[event] ?? []).forEach((handler) => handler()),
    _handlerCount: (event: string) => (handlers[event] ?? []).length,
  }
}

type FakeMap = ReturnType<typeof makeFakeMap>

/** Markers still on the map (the control removes rather than reuses on rebuild). */
function liveMarkers(): RecordedMarker[] {
  return created.markers.filter((marker) => !marker.removed)
}

function labelMarkers(): RecordedMarker[] {
  return liveMarkers().filter(
    (marker) => !marker.element.classList.contains('repeater-cluster-marker'),
  )
}

function clusterMarkers(): RecordedMarker[] {
  return liveMarkers().filter((marker) =>
    marker.element.classList.contains('repeater-cluster-marker'),
  )
}

describe('RepeatersControl', () => {
  let landStore: ReturnType<typeof useLandStore>
  let repeatersStore: ReturnType<typeof useRepeatersStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    created.markers.length = 0
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    // Resolving to null (as a failed fetch does) leaves whatever a test put in
    // the store in place — a directory payload would overwrite the fixtures.
    vi.mocked(repeatersApi.fetchRepeaterDirectory).mockResolvedValue(null)
    landStore = useLandStore()
    repeatersStore = useRepeatersStore()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  /** Add the control to a fake map, with the layer switched on by default. */
  function addControl({ visible = true }: { visible?: boolean } = {}) {
    landStore.setRepeatersLayerVisible(visible)
    const control = new RepeatersControl(landStore, repeatersStore)
    const map = makeFakeMap()
    control.onAdd(map as never)
    return { control, map }
  }

  function a11yRegion(map: FakeMap): HTMLElement {
    return map._container.querySelector('[role="region"]') as HTMLElement
  }

  // ── button ────────────────────────────────────────────────────────────────

  it('exposes a descriptive accessible name on its button', () => {
    const { control } = addControl()
    expect(control.button.getAttribute('aria-label')).toBe('Toggle amateur radio repeaters')
    expect(control.buttonTitle).toBe('Toggle amateur radio repeaters')
  })

  it('draws its glyph in the button colour so the active state shows through', () => {
    const { control } = addControl()
    expect(control.buttonLabel).toContain('stroke="currentColor"')
    expect(control.buttonLabel).not.toContain('stroke="#ffffff"')
  })

  it('shows the button active while the layer is on, and dimmed when off', async () => {
    const { control } = addControl()
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
    control.setVisible(false)
    await nextTick()
    expect(control.button.style.opacity).toBe('0.3')
  })

  // ── loading the directory ────────────────────────────────────────────────

  it('loads the directory when the layer is on', () => {
    const loadSpy = vi.spyOn(repeatersStore, 'load')
    addControl()
    expect(loadSpy).toHaveBeenCalled()
  })

  it('does not load the directory while the layer is off', () => {
    const loadSpy = vi.spyOn(repeatersStore, 'load')
    addControl({ visible: false })
    expect(loadSpy).not.toHaveBeenCalled()
  })

  // ── markers ──────────────────────────────────────────────────────────────

  it('plots a label per station on add and reports the viewport to the store', () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    expect(labelMarkers()).toHaveLength(1)
    expect(labelMarkers()[0]?.element.textContent).toContain('GB3NR')
    expect(labelMarkers()[0]?.lngLat).toEqual([0, 52])
    expect(labelMarkers()[0]?.anchor).toBe('left')
    expect(repeatersStore.viewportBounds).toEqual({
      west: map.bounds.west,
      south: map.bounds.south,
      east: map.bounds.east,
      north: map.bounds.north,
    })
  })

  it('plots nothing while the layer is off', () => {
    repeatersStore.stations = [station()]
    addControl({ visible: false })
    expect(liveMarkers()).toHaveLength(0)
  })

  it('leaves out stations beyond the viewport margin', () => {
    repeatersStore.stations = [station(), station({ callsign: 'GB3FAR', longitude: 40 })]
    addControl()
    expect(labelMarkers().map((marker) => marker.element.textContent)).toEqual([
      expect.stringContaining('GB3NR'),
    ])
  })

  it('keeps a station just outside the bounds but inside the pixel margin', () => {
    // 120 px of margin at 100 px per degree — 0.5° past the eastern edge is in.
    repeatersStore.stations = [station({ callsign: 'GB3EDGE', longitude: 5.5 })]
    addControl()
    expect(labelMarkers()).toHaveLength(1)
  })

  it('keeps the same pill element when a re-render finds the station unchanged', () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    const pill = labelMarkers()[0]!.element
    map._emit('moveend')
    expect(labelMarkers()).toHaveLength(1)
    expect(labelMarkers()[0]!.element).toBe(pill)
    expect(labelMarkers()[0]!.lngLat).toEqual([0, 52])
  })

  it('moves the marker when the station reports a new position', async () => {
    repeatersStore.stations = [station()]
    addControl()
    repeatersStore.stations = [station({ latitude: 53 })]
    await nextTick()
    expect(labelMarkers()).toHaveLength(1)
    expect(labelMarkers()[0]!.lngLat).toEqual([0, 53])
  })

  it('does not rebuild markers when the map merely moves', () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    const createdAfterAdd = created.markers.length
    map._emit('moveend')
    map._emit('moveend')
    expect(created.markers).toHaveLength(createdAfterAdd)
    expect(labelMarkers()).toHaveLength(1)
  })

  it('rebuilds a marker when the station data itself changes', async () => {
    repeatersStore.stations = [station()]
    addControl()
    const createdAfterAdd = created.markers.length
    repeatersStore.stations = [station({ location: 'GREAT YARMOUTH' })]
    await nextTick()
    expect(created.markers.length).toBeGreaterThan(createdAfterAdd)
    expect(labelMarkers()).toHaveLength(1)
  })

  it('rebuilds labels when the operator changes which fields they show', async () => {
    repeatersStore.stations = [station()]
    addControl()
    const createdAfterAdd = created.markers.length
    repeatersStore.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, location: true })
    await nextTick()
    expect(created.markers.length).toBeGreaterThan(createdAfterAdd)
    expect(labelMarkers()[0]?.element.textContent).toContain('NORWICH')
  })

  it('removes the marker of a station that leaves the filtered set', async () => {
    repeatersStore.stations = [station()]
    addControl()
    expect(labelMarkers()).toHaveLength(1)
    repeatersStore.stations = []
    await nextTick()
    expect(liveMarkers()).toHaveLength(0)
  })

  // ── clustering ───────────────────────────────────────────────────────────

  it('draws one count marker for stations sharing a grouping cell', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    addControl()
    expect(labelMarkers()).toHaveLength(0)
    const cluster = clusterMarkers()
    expect(cluster).toHaveLength(1)
    expect(cluster[0]?.element.getAttribute('aria-label')).toBe(
      '2 repeaters here — zoom in to see them',
    )
    expect(cluster[0]?.element.textContent).toBe('2')
    // Sited at the mean of its members' positions.
    expect(cluster[0]?.lngLat).toEqual([0.25, 52])
    expect(cluster[0]?.anchor).toBe('center')
  })

  it('counts even a lone station below the label-reveal zoom', () => {
    repeatersStore.stations = [station()]
    const { control, map } = addControl()
    map.zoom = 8
    map._emit('moveend')
    expect(labelMarkers()).toHaveLength(0)
    expect(clusterMarkers()).toHaveLength(1)
    // A single-member cluster sits on the station's own position, not a mean.
    expect(clusterMarkers()[0]?.lngLat).toEqual([0, 52])
    control.onRemove()
  })

  it('reuses a count marker while its membership is unchanged', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    const { map } = addControl()
    const createdAfterAdd = created.markers.length
    map._emit('moveend')
    expect(created.markers).toHaveLength(createdAfterAdd)
    expect(clusterMarkers()).toHaveLength(1)
  })

  it('rebuilds a count marker when its membership changes', async () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    addControl()
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
      station({ callsign: 'GB3C', longitude: 0.6 }),
    ]
    await nextTick()
    expect(clusterMarkers()).toHaveLength(1)
    expect(clusterMarkers()[0]?.element.textContent).toBe('3')
  })

  it('replaces counts with labels once the map zooms past the reveal level', () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    map.zoom = 8
    map._emit('moveend')
    expect(clusterMarkers()).toHaveLength(1)
    map.zoom = 11
    map._emit('moveend')
    expect(clusterMarkers()).toHaveLength(0)
    expect(labelMarkers()).toHaveLength(1)
  })

  it('zooms in when a count marker is clicked', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    const { map } = addControl()
    const clickEvent = new MouseEvent('click', { bubbles: true })
    clusterMarkers()[0]?.element.dispatchEvent(clickEvent)
    expect(map.easeTo).toHaveBeenCalledWith({
      center: [0.25, 52],
      zoom: 12, // current zoom + the click step
      duration: 300,
    })
  })

  it('never zooms a count click short of the label-reveal level', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    const { map } = addControl()
    map.zoom = 4
    map._emit('moveend')
    clusterMarkers()[0]?.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 9 }))
  })

  it('widens the grouping cell for every optional label field switched on', async () => {
    // 2° apart: two cells at the 150 px base width, one cell at 240 px.
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 2 }),
    ]
    addControl()
    expect(labelMarkers()).toHaveLength(2)
    repeatersStore.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, location: true })
    await nextTick()
    expect(labelMarkers()).toHaveLength(0)
    expect(clusterMarkers()).toHaveLength(1)
  })

  // ── visibility ───────────────────────────────────────────────────────────

  describe('stacking past the stacking zoom', () => {
    /** Two sites on one mast and a third in the same cell but 20 px lower. */
    function stackedFixture() {
      repeatersStore.stations = [
        station({ callsign: 'GB7A', longitude: 0, latitude: 52 }),
        station({ callsign: 'GB3A', longitude: 0, latitude: 52 }),
        station({ callsign: 'GB3C', longitude: 0.1, latitude: 51.8 }),
      ]
    }

    /** The label marker for a callsign, by the pill's accessible name. */
    function labelFor(callsign: string): RecordedMarker | undefined {
      return labelMarkers().find((marker) =>
        marker.element.getAttribute('aria-label')?.startsWith(`Repeater ${callsign},`),
      )
    }

    it('keeps sharing a cell as a count below the stacking zoom', () => {
      stackedFixture()
      const { map } = addControl()
      map.zoom = 11
      map._emit('moveend')
      expect(clusterMarkers()).toHaveLength(1)
      expect(labelMarkers()).toHaveLength(0)
    })

    it('draws every site in the cell as its own label from the stacking zoom', () => {
      stackedFixture()
      const { map } = addControl()
      map.zoom = 12
      map._emit('moveend')
      expect(clusterMarkers()).toHaveLength(0)
      expect(labelMarkers()).toHaveLength(3)
    })

    it('pushes a label that would overprint the one above down by one pitch', () => {
      stackedFixture()
      const { map } = addControl()
      map.zoom = 12
      map._emit('moveend')
      // Same row → alphabetical: GB3A sits on the mast, GB7A one pitch (26 + 4)
      // below it, and GB3C — 20 px down of its own accord — is pushed to the
      // next free pitch, 60 px below the mast, 40 px below its own spot.
      expect(labelFor('GB3A')?.offset).toEqual([-13, 0])
      expect(labelFor('GB7A')?.offset).toEqual([-13, 30])
      expect(labelFor('GB3C')?.offset).toEqual([-13, 40])
      // Each pill is still anchored at its own site, not the stack's.
      expect(labelFor('GB3C')?.lngLat).toEqual([0.1, 51.8])
    })

    it('leaves a site far enough below the stack at its own spot', () => {
      repeatersStore.stations = [
        station({ callsign: 'GB3A', longitude: 0, latitude: 52 }),
        station({ callsign: 'GB3C', longitude: 0.1, latitude: 51.5 }),
      ]
      const { map } = addControl()
      map.zoom = 12
      map._emit('moveend')
      // 50 px below the first label — clear of its 30 px pitch, so no push.
      expect(labelFor('GB3C')?.offset).toEqual([-13, 0])
    })

    it('re-seats a reused pill when its place in the stack changes', async () => {
      stackedFixture()
      const { map } = addControl()
      map.zoom = 12
      map._emit('moveend')
      const before = labelFor('GB3C')
      expect(before?.offset).toEqual([-13, 40])
      // GB7A leaves the filtered set: GB3C moves up one pitch in the same pill.
      repeatersStore.stations = repeatersStore.stations.filter((each) => each.callsign !== 'GB7A')
      await nextTick()
      const after = labelFor('GB3C')
      expect(after).toBe(before)
      expect(after?.offset).toEqual([-13, 10])
    })
  })

  it('setVisible hides and shows the layer, and is a no-op when unchanged', async () => {
    repeatersStore.stations = [station()]
    const { control } = addControl()
    expect(labelMarkers()).toHaveLength(1)
    control.setVisible(false)
    await nextTick()
    expect(liveMarkers()).toHaveLength(0)
    const createdWhileHidden = created.markers.length
    control.setVisible(false)
    await nextTick()
    expect(created.markers).toHaveLength(createdWhileHidden)
    control.setVisible(true)
    await nextTick()
    expect(labelMarkers()).toHaveLength(1)
    expect(landStore.repeatersLayerVisible).toBe(true)
  })

  it('toggles the layer on a button click', async () => {
    repeatersStore.stations = [station()]
    const { control } = addControl()
    control.handleClickPublic()
    await nextTick()
    expect(landStore.repeatersLayerVisible).toBe(false)
    expect(liveMarkers()).toHaveLength(0)
    control.handleClickPublic()
    await nextTick()
    expect(labelMarkers()).toHaveLength(1)
  })

  it('follows the store flag when another part of the app flips it', async () => {
    repeatersStore.stations = [station()]
    addControl({ visible: false })
    expect(liveMarkers()).toHaveLength(0)
    landStore.selectLayer('repeaters')
    await nextTick()
    expect(labelMarkers()).toHaveLength(1)
  })

  // ── opening a station in the pane ────────────────────────────────────────

  it('expands the station row and announces the open event when a label is clicked', () => {
    repeatersStore.stations = [station()]
    addControl()
    const openListener = vi.fn()
    document.addEventListener(REPEATER_OPEN_EVENT, openListener)
    labelMarkers()[0]?.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.removeEventListener(REPEATER_OPEN_EVENT, openListener)
    expect(landStore.searchExpandedCallsign).toBe('rpt:GB3NR')
    expect(openListener).toHaveBeenCalledOnce()
    expect((openListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ callsign: 'GB3NR' })
  })

  it('openInPane can be driven directly, as the pane does', () => {
    const { control } = addControl()
    control.openInPane('GB3PI')
    expect(landStore.searchExpandedCallsign).toBe('rpt:GB3PI')
  })

  // ── revealing a station from the pane ────────────────────────────────────

  function locate(callsign: string): void {
    document.dispatchEvent(new CustomEvent(REPEATER_LOCATE_EVENT, { detail: { callsign } }))
  }

  it('flies to a station at a zoom that clears its nearest neighbour', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    const { map } = addControl()
    locate('GB3A')
    // Neighbour 50 px away, 300 px of clearance needed → +log2(6) ≈ 2.6 zooms,
    // but the stacking zoom (12) is as deep as a reveal ever needs to go.
    expect(map.flyTo).toHaveBeenCalledWith({ center: [0, 52], zoom: 12, duration: 600 })
  })

  it('flies only as deep as the nearest neighbour needs, short of the stacking zoom', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 1.5 }),
    ]
    const { map } = addControl()
    locate('GB3A')
    // Neighbour 150 px away, 300 px of clearance needed → +log2(2) = 1 zoom.
    expect(map.flyTo).toHaveBeenCalledWith({ center: [0, 52], zoom: 11, duration: 600 })
  })

  it('never zooms out below the current level to reveal a station', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 10 }),
    ]
    const { map } = addControl()
    locate('GB3A')
    // Its neighbour is already 1000 px clear, so the map stays where it is.
    expect(map.flyTo).toHaveBeenCalledWith({ center: [0, 52], zoom: 10, duration: 600 })
  })

  it('goes to the stacking zoom for a station with no plotted neighbour', () => {
    repeatersStore.stations = [station({ callsign: 'GB3A' })]
    const { map } = addControl()
    locate('GB3A')
    expect(map.flyTo).toHaveBeenCalledWith({ center: [0, 52], zoom: 12, duration: 600 })
  })

  it('goes to the stacking zoom for stations sharing a mast, where they are drawn apart', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0, latitude: 52 }),
      station({ callsign: 'GB7A', longitude: 0, latitude: 52 }),
    ]
    const { map } = addControl()
    locate('GB7A')
    expect(map.flyTo).toHaveBeenCalledWith({ center: [0, 52], zoom: 12, duration: 600 })
  })

  it('ignores a locate request for a callsign the directory does not hold', () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    locate('GB3ZZZ')
    expect(map.flyTo).not.toHaveBeenCalled()
  })

  // ── accessibility ────────────────────────────────────────────────────────

  it('renders a hidden data table of the repeaters in view, one row per channel', () => {
    repeatersStore.stations = [
      station({
        channels: [
          channel({ band: '2M' }),
          channel({
            band: '70CM',
            txMhz: 430.875,
            rxMhz: 438.475,
            modes: ['M'],
            ctcssHz: null,
            dmrColourCode: 3,
          }),
        ],
      }),
    ]
    const { map } = addControl()
    const region = a11yRegion(map)
    expect(region.getAttribute('aria-label')).toBe('Amateur radio repeaters')
    expect(region.querySelector('caption')?.textContent).toBe('Amateur radio repeaters in view')
    expect([...region.querySelectorAll('th')].map((header) => header.textContent)).toEqual([
      'Callsign',
      'Location',
      'Band',
      'Output',
      'Input',
      'Modes',
      'CTCSS / CC',
      'Status',
    ])
    const rows = [...region.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    expect([...rows[0]!.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      'GB3NR',
      'NORWICH',
      '2M',
      '145.7125 MHz',
      '145.1125 MHz',
      'FM',
      '118.8 Hz',
      'OPERATIONAL',
    ])
    expect(rows[1]?.textContent).toContain('CC3')
  })

  it('renders an empty cell for a station whose location the register withheld', () => {
    repeatersStore.stations = [station({ location: null })]
    const { map } = addControl()
    const cells = [...a11yRegion(map).querySelectorAll('tbody td')]
    expect(cells[1]?.textContent).toBe('')
  })

  it('says so when no repeaters are in view', () => {
    const { map } = addControl()
    expect(a11yRegion(map).textContent).toContain('No amateur radio repeaters in view.')
    expect(a11yRegion(map).querySelector('table')).toBeNull()
  })

  it('escapes untrusted register fields in the data table', () => {
    repeatersStore.stations = [
      station({
        callsign: '<img src=x onerror="alert(1)">',
        location: '</td><script>bad()</script>',
      }),
    ]
    const { map } = addControl()
    const region = a11yRegion(map)
    expect(region.querySelector('img')).toBeNull()
    expect(region.querySelector('script')).toBeNull()
    expect(region.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(region.textContent).toContain('</td><script>bad()</script>')
  })

  it('the hidden repeater table has no accessibility violations', async () => {
    repeatersStore.stations = [station()]
    const { map } = addControl()
    expect(await axe(a11yRegion(map))).toHaveNoViolations()
  })

  it('names each label marker for a screen reader', () => {
    repeatersStore.stations = [station()]
    addControl()
    expect(labelMarkers()[0]?.element.getAttribute('aria-label')).toBe(
      'Repeater GB3NR, NORWICH, 2M',
    )
  })

  // ── the label pill ───────────────────────────────────────────────────────

  describe('label pill', () => {
    /** Every optional field on, so a full pill renders. */
    const ALL_FIELDS_ON: RepeaterLabelFieldMap = {
      symbol: true,
      callsign: true,
      band: true,
      location: true,
      modes: true,
      output: true,
      input: true,
      tone: true,
      channel: true,
      locator: true,
      keeper: true,
      status: true,
    }

    it('shows the glyph, callsign and a badge per band by default', () => {
      repeatersStore.stations = [
        station({ channels: [channel({ band: '2M' }), channel({ band: '70CM' })] }),
      ]
      addControl()
      const pill = labelMarkers()[0]!.element
      expect(pill.querySelector('svg')).not.toBeNull()
      expect(pill.textContent).toContain('GB3NR')
      expect(pill.textContent).toContain('2M')
      expect(pill.textContent).toContain('70CM')
      // Optional data fields stay off until the operator asks for them.
      expect(pill.textContent).not.toContain('NORWICH')
      expect(pill.textContent).not.toContain('G4XYZ')
    })

    it('shows every optional field, listing each channel value once', () => {
      repeatersStore.stations = [
        station({
          channels: [
            channel({ band: '2M', channel: 'RV52', txMhz: 145.7125, rxMhz: 145.1125 }),
            channel({
              band: '70CM',
              channel: 'DVU12',
              txMhz: 430.875,
              rxMhz: 438.475,
              modes: ['M'],
              ctcssHz: null,
              dmrColourCode: 3,
              status: OFF_AIR,
            }),
          ],
        }),
      ]
      repeatersStore.setLabelFields(ALL_FIELDS_ON)
      addControl()
      const pill = labelMarkers()[0]!.element
      const text = pill.textContent ?? ''
      expect(text).toContain('NORWICH')
      expect(text).toContain('FM · DMR')
      expect(text).toContain('145.7125 · 430.8750')
      expect(text).toContain('145.1125 · 438.4750')
      expect(text).toContain('118.8 Hz · CC3')
      expect(text).toContain('RV52 · DVU12')
      expect(text).toContain('JO02PP')
      expect(text).toContain('G4XYZ')
      expect(text).toContain('OPERATIONAL · NOT OPERATIONAL')
    })

    it('collapses a value shared by every channel to one entry', () => {
      repeatersStore.stations = [
        station({ channels: [channel({ band: '2M' }), channel({ band: '70CM' })] }),
      ]
      repeatersStore.setLabelFields(ALL_FIELDS_ON)
      addControl()
      const text = labelMarkers()[0]!.element.textContent ?? ''
      expect(text).toContain('OPERATIONAL')
      expect(text).not.toContain('OPERATIONAL · OPERATIONAL')
    })

    it('omits a field no channel or the site itself has a value for', () => {
      repeatersStore.stations = [
        station({
          locator: null,
          keeper: null,
          location: null,
          channels: [channel({ channel: null, modes: [], ctcssHz: null, dmrColourCode: null })],
        }),
      ]
      repeatersStore.setLabelFields(ALL_FIELDS_ON)
      addControl()
      const pill = labelMarkers()[0]!.element
      expect(pill.textContent).not.toContain('QTH')
      expect(pill.textContent).not.toContain('MODE')
      expect(pill.textContent).not.toContain('TONE')
      expect(pill.textContent).not.toContain('CH')
      expect(pill.textContent).not.toContain('LOC')
      expect(pill.textContent).not.toContain('KPR')
    })

    it('omits a field whose only channel value is an empty string', () => {
      repeatersStore.stations = [station({ channels: [channel({ channel: '' })] })]
      repeatersStore.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, channel: true })
      addControl()
      expect(labelMarkers()[0]!.element.textContent).not.toContain('CH')
    })

    it('dims a site whose every channel is off air', () => {
      repeatersStore.stations = [
        station({ callsign: 'GB3OLD', channels: [channel({ status: OFF_AIR })] }),
      ]
      addControl()
      expect(labelMarkers()[0]!.element.style.opacity).toBe('0.4')
    })

    it('leaves a site with one working channel at full opacity', () => {
      repeatersStore.stations = [
        station({ channels: [channel({ status: OFF_AIR }), channel({ band: '70CM' })] }),
      ]
      addControl()
      expect(labelMarkers()[0]!.element.style.opacity).toBe('')
    })

    it('renders a glyph-less pill with the callsign standing alone', () => {
      repeatersStore.stations = [station()]
      repeatersStore.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, symbol: false })
      addControl()
      const pill = labelMarkers()[0]!.element
      expect(pill.querySelector('svg')).toBeNull()
      expect(pill.querySelector('.adsb-label-name')?.textContent).toBe('GB3NR')
    })

    it('renders an empty pill when every field is switched off', () => {
      repeatersStore.stations = [station()]
      repeatersStore.setLabelFields({
        ...DEFAULT_REPEATER_LABEL_FIELDS,
        symbol: false,
        callsign: false,
        band: false,
      })
      addControl()
      expect(labelMarkers()[0]!.element.textContent).toBe('')
    })

    it('escapes an untrusted register value interpolated into a data badge', () => {
      repeatersStore.stations = [station({ location: '<img src=x onerror="alert(1)">' })]
      repeatersStore.setLabelFields({ ...DEFAULT_REPEATER_LABEL_FIELDS, location: true })
      addControl()
      const pill = labelMarkers()[0]!.element
      expect(pill.querySelector('img')).toBeNull()
      expect(pill.textContent).toContain('<img src=x onerror="alert(1)">')
    })

    it('carries the station name on the pill itself as well as the marker', () => {
      repeatersStore.stations = [station()]
      addControl()
      expect(labelMarkers()[0]!.element.getAttribute('aria-label')).toBe(
        'Repeater GB3NR, NORWICH, 2M',
      )
    })
  })

  // ── teardown ─────────────────────────────────────────────────────────────

  it('tears down markers, the hidden region and every listener on remove', () => {
    repeatersStore.stations = [station()]
    const { control, map } = addControl()
    expect(map._handlerCount('moveend')).toBe(1)
    control.onRemove()
    expect(created.markers.every((marker) => marker.removed)).toBe(true)
    expect(map._handlerCount('moveend')).toBe(0)
    expect(map._container.querySelector('[role="region"]')).toBeNull()
  })

  it('also tears down count markers on remove', () => {
    repeatersStore.stations = [
      station({ callsign: 'GB3A', longitude: 0 }),
      station({ callsign: 'GB3B', longitude: 0.5 }),
    ]
    const { control } = addControl()
    expect(clusterMarkers()).toHaveLength(1)
    control.onRemove()
    expect(liveMarkers()).toHaveLength(0)
  })

  it('stops responding to store changes and locate requests once removed', async () => {
    repeatersStore.stations = [station()]
    const { control, map } = addControl()
    control.onRemove()
    const createdAfterRemove = created.markers.length
    repeatersStore.stations = [station({ callsign: 'GB3PI', longitude: 1 })]
    await nextTick()
    expect(created.markers).toHaveLength(createdAfterRemove)
    expect(() => locate('GB3PI')).not.toThrow()
    expect(map.flyTo).not.toHaveBeenCalled()
  })
})

describe('stationAccessibleName', () => {
  it('names a station by callsign, place and bands', () => {
    expect(
      stationAccessibleName(
        station({ channels: [channel({ band: '2M' }), channel({ band: '70CM' })] }),
      ),
    ).toBe('Repeater GB3NR, NORWICH, 2M, 70CM')
  })

  it('leaves out a place the register withheld', () => {
    expect(stationAccessibleName(station({ location: null }))).toBe('Repeater GB3NR, 2M')
  })

  it('announces an off-air site as not operational', () => {
    expect(stationAccessibleName(station({ channels: [channel({ status: OFF_AIR })] }))).toBe(
      'Repeater GB3NR, NORWICH, 2M, not operational',
    )
  })

  it('names a site with no channels at all', () => {
    // `stationOffAir` is vacuously true for an empty channel list.
    expect(stationAccessibleName(station({ channels: [] }))).toBe(
      'Repeater GB3NR, NORWICH, not operational',
    )
  })
})
