import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

interface FakeMarker {
  options: { element: HTMLElement; anchor: string; offset: [number, number] }
  lngLat: [number, number] | null
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  // Regular function (not arrow) so `new Marker(...)` constructs correctly.
  function Marker(this: FakeMarker, options: FakeMarker['options']) {
    this.options = options
    this.lngLat = null
    this.addTo = vi.fn(() => this)
    this.remove = vi.fn(() => this)
    this.setLngLat = vi.fn((coords: [number, number]) => {
      this.lngLat = coords
      return this
    })
    markerRegistry.instances.push(this)
  }
  return { default: { Marker } }
})

import { AirportsToggleControl, AIRPORTS_DATA } from './AirportsControl'
import { useAirStore } from '@/stores/air'
import type { AirStore } from '../types'
import type maplibregl from 'maplibre-gl'

interface FakeMap {
  map: maplibregl.Map
  addSource: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  sources: Set<string>
}

function fakeMap(options: { styleLoaded?: boolean } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const sources = new Set<string>()
  const addSource = vi.fn((id: string) => sources.add(id))
  const removeSource = vi.fn((id: string) => sources.delete(id))
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') styleLoadHandlers.push(handler)
    }),
    getSource: vi.fn((id: string) => (sources.has(id) ? { id } : undefined)),
    addSource,
    removeSource,
  } as unknown as maplibregl.Map
  return { map, addSource, removeSource, styleLoadHandlers, sources }
}

let airStore: AirStore

beforeEach(() => {
  markerRegistry.instances.length = 0
  setActivePinia(createPinia())
  airStore = useAirStore()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('AIRPORTS_DATA', () => {
  it('is a non-empty point feature collection with ICAO/name properties', () => {
    expect(AIRPORTS_DATA.type).toBe('FeatureCollection')
    expect(AIRPORTS_DATA.features.length).toBeGreaterThan(0)
    expect(AIRPORTS_DATA.features[0]!.properties.icao).toBeTruthy()
  })
})

describe('AirportsToggleControl constructor', () => {
  it('seeds visibility from the store (default on)', () => {
    expect(new AirportsToggleControl(airStore).visible).toBe(true)
  })

  it('seeds visibility off when the store disables airports', () => {
    airStore.setOverlay('airports', false)
    expect(new AirportsToggleControl(airStore).visible).toBe(false)
  })

  it('exposes its label and title', () => {
    const control = new AirportsToggleControl(airStore)
    expect(control.buttonLabel).toBe('CVL')
    expect(control.buttonTitle).toBe('Toggle airports')
  })
})

describe('AirportsToggleControl.onInit', () => {
  it('adds the source and a marker per airport when the style is loaded and visible', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      'airports',
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(markerRegistry.instances).toHaveLength(AIRPORTS_DATA.features.length)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalledOnce())
    expect(control.button.style.fontSize).toBe('8px')
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(markerRegistry.instances).toHaveLength(0)
    map.styleLoadHandlers[0]!()
    expect(markerRegistry.instances).toHaveLength(AIRPORTS_DATA.features.length)
  })

  it('builds markers but does not add them when not visible', () => {
    airStore.setOverlay('airports', false)
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).not.toHaveBeenCalled())
  })

  it('replaces a pre-existing source on initialisation', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap()
    map.sources.add('airports')
    control.onAdd(map.map)
    expect(map.removeSource).toHaveBeenCalledWith('airports')
    expect(map.addSource).toHaveBeenCalledWith('airports', expect.anything())
  })

  it('does not rebuild markers when they already exist', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    const countAfterInit = markerRegistry.instances.length
    control.initLayers()
    expect(markerRegistry.instances.length).toBe(countAfterInit)
  })

  it('renders the ICAO and name in each marker label', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)
    const element = markerRegistry.instances[0]!.options.element
    expect(element.querySelector('.apt-icao')!.textContent).toBe('EGLL')
    expect(element.querySelector('.apt-name')!.textContent).toBe('HEATHROW')
  })
})

describe('AirportsToggleControl marker click', () => {
  it('dispatches an air-open-airport event with the airport ICAO', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)
    const handler = vi.fn()
    document.addEventListener('air-open-airport', handler)

    markerRegistry.instances[0]!.options.element.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )

    expect(handler).toHaveBeenCalledOnce()
    const event = handler.mock.calls[0]![0] as CustomEvent
    expect(event.detail).toEqual({ icao: 'EGLL' })
    document.removeEventListener('air-open-airport', handler)
  })
})

describe('AirportsToggleControl.toggle', () => {
  it('hides the markers and persists when toggled off', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)

    control.handleClickPublic()

    expect(control.visible).toBe(false)
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(airStore.overlayStates.airports).toBe(false)
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('removes a lingering hover marker when toggled off', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)
    const hoverMarker = { remove: vi.fn() }
    ;(control as unknown as { _hoverMarker: unknown })._hoverMarker = hoverMarker

    control.handleClickPublic()
    expect(hoverMarker.remove).toHaveBeenCalledOnce()
    expect((control as unknown as { _hoverMarker: unknown })._hoverMarker).toBeNull()
  })

  it('re-adds the markers and persists when toggled back on', () => {
    airStore.setOverlay('airports', false)
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap().map)

    control.handleClickPublic()

    expect(control.visible).toBe(true)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalled())
    expect(airStore.overlayStates.airports).toBe(true)
  })

  it('persists the toggle even before markers are built', () => {
    const control = new AirportsToggleControl(airStore)
    control.toggle() // no onAdd → no markers/button
    expect(airStore.overlayStates.airports).toBe(false)
  })
})

describe('AirportsToggleControl.onRemove', () => {
  it('removes every marker and detaches the container', () => {
    const control = new AirportsToggleControl(airStore)
    const element = control.onAdd(fakeMap().map)
    document.body.appendChild(element)

    control.onRemove()
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(element.parentNode).toBeNull()
  })

  it('is a safe no-op when removed before any markers were built', () => {
    const control = new AirportsToggleControl(airStore)
    expect(() => control.onRemove()).not.toThrow()
    expect(markerRegistry.instances).toHaveLength(0)
  })
})
