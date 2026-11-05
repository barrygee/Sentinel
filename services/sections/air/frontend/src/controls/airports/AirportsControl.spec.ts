import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The labels themselves are AirfieldMarkers' own spec; this control's job is
// feeding it the right sites and keeping it in step.
const fieldRegistry = vi.hoisted(() => ({
  instances: [] as Array<{
    sites: Array<{
      code?: string
      name: string
      coordinates: [number, number]
      onClick: () => void
    }>
    kind: string
    setVisible: ReturnType<typeof vi.fn>
    attach: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('../airfield-label/AirfieldMarkers', () => ({
  AirfieldMarkers: function (
    this: (typeof fieldRegistry.instances)[number],
    _map: unknown,
    sites: (typeof fieldRegistry.instances)[number]['sites'],
    kind: string,
  ) {
    this.sites = sites
    this.kind = kind
    this.setVisible = vi.fn()
    this.attach = vi.fn()
    fieldRegistry.instances.push(this)
  },
}))

import { AirportsToggleControl, AIRPORTS_DATA } from './AirportsControl'
import { useAirStore } from '../../stores/air'
import type { AirStore } from '../types'
import type * as maplibregl from 'maplibre-gl'

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
  fieldRegistry.instances.length = 0
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
  it('hands every site to the labels, then shows and attaches them', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    const [labels] = fieldRegistry.instances
    expect(labels!.kind).toBe('civil')
    expect(labels!.sites).toHaveLength(AIRPORTS_DATA.features.length)
    expect(labels!.sites[0]).toMatchObject({
      code: AIRPORTS_DATA.features[0]!.properties.icao,
      name: AIRPORTS_DATA.features[0]!.properties.name,
    })
    expect(labels!.setVisible).toHaveBeenCalledWith(true)
    expect(labels!.attach).toHaveBeenCalled()
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(fieldRegistry.instances).toHaveLength(0)
    map.styleLoadHandlers[0]!()
    expect(fieldRegistry.instances).toHaveLength(1)
  })

  it('keeps the labels hidden when the overlay is off', () => {
    airStore.setOverlay('airports', false)
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenCalledWith(false)
  })

  it('replaces a pre-existing source on initialisation', () => {
    const control = new AirportsToggleControl(airStore)
    const map = fakeMap({ styleLoaded: true })
    map.sources.add('airports')
    control.onAdd(map.map)
    expect(map.removeSource).toHaveBeenCalledWith('airports')
  })

  it('re-attaches the same labels after a style reload', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.initLayers()
    expect(fieldRegistry.instances).toHaveLength(1)
    expect(fieldRegistry.instances[0]!.attach).toHaveBeenCalledTimes(2)
  })
})

describe('AirportsToggleControl site click', () => {
  it('dispatches an air-open-airport event with the airport ICAO', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    const listener = vi.fn()
    document.addEventListener('air-open-airport', listener)
    fieldRegistry.instances[0]!.sites[0]!.onClick()
    document.removeEventListener('air-open-airport', listener)
    const event = listener.mock.calls[0]![0] as CustomEvent<{ icao: string }>
    expect(event.detail.icao).toBe(AIRPORTS_DATA.features[0]!.properties.icao)
  })
})

describe('AirportsToggleControl.toggle', () => {
  it('hides the labels and persists when toggled off', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.toggle()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(false)
    expect(airStore.overlayStates.airports).toBe(false)
  })

  it('shows the labels and persists when toggled back on', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.toggle()
    control.toggle()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(true)
    expect(airStore.overlayStates.airports).toBe(true)
  })

  it('persists the toggle even before the labels are built', () => {
    const control = new AirportsToggleControl(airStore)
    control.toggle()
    expect(airStore.overlayStates.airports).toBe(false)
  })
})

describe('AirportsToggleControl button', () => {
  it('toggles on click', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    ;(control as unknown as { handleClick: () => void }).handleClick()
    expect(control.visible).toBe(false)
  })
})

describe('AirportsToggleControl.onRemove', () => {
  it('hides the labels', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.onRemove()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('is a safe no-op when removed before any labels were built', () => {
    const control = new AirportsToggleControl(airStore)
    control.onAdd(fakeMap({ styleLoaded: false }).map)
    expect(() => control.onRemove()).not.toThrow()
  })
})
