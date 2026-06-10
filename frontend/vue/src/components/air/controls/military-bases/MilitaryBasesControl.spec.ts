import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Registry of constructed fake markers so the spec can inspect their DOM
// element and assert add/remove behaviour.
interface FakeMarker {
  options: { element: HTMLElement; anchor: string; offset: [number, number] }
  lngLat: [number, number] | null
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  // Regular function (not arrow) so `new Marker(...)` works.
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

import { MilitaryBasesToggleControl, MILITARY_BASES_DATA } from './MilitaryBasesControl'
import { useAirStore } from '@/stores/air'
import type { AirStore } from '../types'
import type maplibregl from 'maplibre-gl'

interface FakeMap {
  map: maplibregl.Map
  addSource: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  easeTo: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  sources: Set<string>
}

function fakeMap(options: { styleLoaded?: boolean } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const sources = new Set<string>()
  const addSource = vi.fn((id: string) => sources.add(id))
  const removeSource = vi.fn((id: string) => sources.delete(id))
  const easeTo = vi.fn()
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') styleLoadHandlers.push(handler)
    }),
    getSource: vi.fn((id: string) => (sources.has(id) ? { id } : undefined)),
    addSource,
    removeSource,
    easeTo,
  } as unknown as maplibregl.Map
  return { map, addSource, removeSource, easeTo, styleLoadHandlers, sources }
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

describe('MILITARY_BASES_DATA', () => {
  it('is a non-empty point feature collection', () => {
    expect(MILITARY_BASES_DATA.type).toBe('FeatureCollection')
    expect(MILITARY_BASES_DATA.features.length).toBeGreaterThan(0)
  })
})

describe('MilitaryBasesToggleControl constructor', () => {
  it('seeds visibility from the store (default on)', () => {
    expect(new MilitaryBasesToggleControl(airStore, () => false).visible).toBe(true)
  })

  it('seeds visibility off when the store disables military bases', () => {
    airStore.setOverlay('militaryBases', false)
    expect(new MilitaryBasesToggleControl(airStore, () => false).visible).toBe(false)
  })

  it('exposes its label and title', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    expect(control.buttonLabel).toBe('MIL')
    expect(control.buttonTitle).toBe('Toggle military bases')
  })
})

describe('MilitaryBasesToggleControl.onInit', () => {
  it('adds the source and a marker per base when the style is loaded and visible', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      'military-bases',
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(markerRegistry.instances).toHaveLength(MILITARY_BASES_DATA.features.length)
    // Visible by default → every marker is added to the map.
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalledOnce())
    expect(control.button.style.fontSize).toBe('8px')
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(markerRegistry.instances).toHaveLength(0)
    map.styleLoadHandlers[0]!()
    expect(markerRegistry.instances).toHaveLength(MILITARY_BASES_DATA.features.length)
  })

  it('builds markers but does not add them when not visible', () => {
    airStore.setOverlay('militaryBases', false)
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(markerRegistry.instances).toHaveLength(MILITARY_BASES_DATA.features.length)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).not.toHaveBeenCalled())
  })

  it('removes a pre-existing source before adding', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    map.sources.add('military-bases')
    control.onAdd(map.map)
    expect(map.removeSource).toHaveBeenCalledWith('military-bases')
  })

  it('does not rebuild markers if they already exist', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)
    const countAfterInit = markerRegistry.instances.length

    control.initLayers() // second call — markers already built
    expect(markerRegistry.instances.length).toBe(countAfterInit)
  })
})

describe('MilitaryBasesToggleControl marker labels', () => {
  it('renders an ICAO span for bases with an ICAO code', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap().map)
    const bensonIndex = MILITARY_BASES_DATA.features.findIndex((f) => f.properties.icao === 'EGUB')
    const element = markerRegistry.instances[bensonIndex]!.options.element
    expect(element.innerHTML).toContain('EGUB')
    expect(element.innerHTML).toContain('RAF BENSON')
  })

  it('omits the ICAO span for bases without an ICAO code', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap().map)
    const noIcaoIndex = MILITARY_BASES_DATA.features.findIndex((f) => f.properties.icao === '')
    const element = markerRegistry.instances[noIcaoIndex]!.options.element
    // Only the name span — no #c8ff00 ICAO highlight.
    expect(element.innerHTML).not.toContain('#c8ff00')
  })
})

describe('MilitaryBasesToggleControl marker interactions', () => {
  it('eases to the base with a 45° pitch when 3D is active', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => true)
    const map = fakeMap()
    control.onAdd(map.map)
    const element = markerRegistry.instances[0]!.options.element

    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 16, duration: 800, pitch: 45 }),
    )
  })

  it('eases without pitch when 3D is inactive', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)
    const element = markerRegistry.instances[0]!.options.element

    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const easeArgs = map.easeTo.mock.calls[0]![0] as Record<string, unknown>
    expect(easeArgs).not.toHaveProperty('pitch')
  })

  it('shows a hint panel on mouseenter and removes it on mouseleave', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap().map)
    const element = markerRegistry.instances[0]!.options.element

    element.dispatchEvent(new MouseEvent('mouseenter'))
    expect(element.innerHTML).toContain('CLICK TO ZOOM')
    // A second mouseenter must not create a duplicate panel.
    const htmlAfterFirst = element.innerHTML
    element.dispatchEvent(new MouseEvent('mouseenter'))
    expect(element.innerHTML).toBe(htmlAfterFirst)

    element.dispatchEvent(new MouseEvent('mouseleave'))
    expect(element.innerHTML).not.toContain('CLICK TO ZOOM')
    // A second mouseleave with no panel must be a safe no-op.
    expect(() => element.dispatchEvent(new MouseEvent('mouseleave'))).not.toThrow()
  })
})

describe('MilitaryBasesToggleControl.toggle', () => {
  it('hides the markers and persists when toggled off', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.visible).toBe(false)
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(airStore.overlayStates.militaryBases).toBe(false)
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('re-adds the markers and persists when toggled back on', () => {
    airStore.setOverlay('militaryBases', false)
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.visible).toBe(true)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalled())
    expect(airStore.overlayStates.militaryBases).toBe(true)
  })

  it('persists the toggle even before markers are built', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    // No onAdd → no markers and no button; toggle must still update the store.
    control.toggle()
    expect(airStore.overlayStates.militaryBases).toBe(false)
  })
})

describe('MilitaryBasesToggleControl.onRemove', () => {
  it('removes every marker and detaches the container', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    const element = control.onAdd(map.map)
    document.body.appendChild(element)

    control.onRemove()
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(element.parentNode).toBeNull()
  })

  it('is a safe no-op when removed before markers were ever built', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    // No onAdd → _markers is null; onRemove must not throw.
    expect(() => control.onRemove()).not.toThrow()
    expect(markerRegistry.instances).toHaveLength(0)
  })
})
