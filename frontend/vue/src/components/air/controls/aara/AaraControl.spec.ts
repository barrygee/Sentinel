import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Registry of fake markers so the spec can inspect label elements and the
// add/remove lifecycle.
interface FakeMarker {
  options: { element: HTMLElement; anchor: string }
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

import { AaraToggleControl } from './AaraControl'
import { useAirStore } from '@/stores/air'
import type { AirStore } from '../types'
import type maplibregl from 'maplibre-gl'

const ZONE_COUNT = 14
const LAYER_IDS = ['aara-fill', 'aara-outline']

interface FakeMap {
  map: maplibregl.Map
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  project: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  sources: Set<string>
  layers: Set<string>
}

function fakeMap(options: { styleLoaded?: boolean } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const sources = new Set<string>()
  const layers = new Set<string>()
  const addSource = vi.fn((id: string) => sources.add(id))
  const addLayer = vi.fn((layer: { id: string }) => layers.add(layer.id))
  const setLayoutProperty = vi.fn()
  // Identity-ish projection: lng→x, lat→y, so rotation maths run on real data.
  const project = vi.fn((coords: [number, number]) => ({ x: coords[0], y: coords[1] }))
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') styleLoadHandlers.push(handler)
    }),
    getSource: vi.fn((id: string) => (sources.has(id) ? { id } : undefined)),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    addSource,
    addLayer,
    setLayoutProperty,
    project,
  } as unknown as maplibregl.Map
  return {
    map,
    addSource,
    addLayer,
    setLayoutProperty,
    project,
    styleLoadHandlers,
    sources,
    layers,
  }
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

describe('AaraToggleControl constructor', () => {
  it('seeds visibility from the store (default on)', () => {
    expect(new AaraToggleControl(airStore).visible).toBe(true)
  })

  it('seeds visibility off when the store disables AARA', () => {
    airStore.setOverlay('aara', false)
    expect(new AaraToggleControl(airStore).visible).toBe(false)
  })

  it('exposes its label and title', () => {
    const control = new AaraToggleControl(airStore)
    expect(control.buttonLabel).toBe('=')
    expect(control.buttonTitle).toBe('Toggle UK air-to-air refuelling areas')
  })
})

describe('AaraToggleControl.onInit', () => {
  it('adds the zone source, fill/outline layers and one label marker per zone when visible', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      'aara-zones',
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aara-fill', type: 'fill' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aara-outline', type: 'line' }),
    )
    expect(markerRegistry.instances).toHaveLength(ZONE_COUNT)
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalledOnce())
  })

  it('builds layers hidden and markers detached when not visible', () => {
    airStore.setOverlay('aara', false)
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)

    const fillLayer = map.addLayer.mock.calls.find((call) => call[0].id === 'aara-fill')![0]
    expect(fillLayer.layout.visibility).toBe('none')
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).not.toHaveBeenCalled())
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('does not rebuild when the source already exists', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    map.sources.add('aara-zones') // pretend it was already initialised
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(markerRegistry.instances).toHaveLength(0)
  })

  it('renders the zone name in each label', () => {
    const control = new AaraToggleControl(airStore)
    control.onAdd(fakeMap().map)
    const firstLabel = markerRegistry.instances[0]!.options.element.textContent
    expect(firstLabel).toMatch(/^AARA \d+$/)
  })
})

describe('AaraToggleControl.toggle', () => {
  it('hides the layers and markers and persists when toggled off', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(control.visible).toBe(false)
    LAYER_IDS.forEach((id) =>
      expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'none'),
    )
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(airStore.overlayStates.aara).toBe(false)
  })

  it('shows the layers and markers and persists when toggled back on', () => {
    airStore.setOverlay('aara', false)
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.visible).toBe(true)
    LAYER_IDS.forEach((id) =>
      expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'visible'),
    )
    markerRegistry.instances.forEach((marker) => expect(marker.addTo).toHaveBeenCalled())
    expect(airStore.overlayStates.aara).toBe(true)
  })

  it('skips absent layers when toggling', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    map.layers.clear() // layers vanished from the style
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('persists the toggle while initialisation is still deferred (no markers yet)', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap({ styleLoaded: false }) // initLayers deferred → no markers
    control.onAdd(map.map)

    // map is set but layers/markers are not built yet — toggle must still persist.
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(control.visible).toBe(false)
    expect(airStore.overlayStates.aara).toBe(false)
  })
})

describe('AaraToggleControl._updateLabelRotations', () => {
  it('reprojects each label and writes a rotate transform', () => {
    const control = new AaraToggleControl(airStore)
    control.onAdd(fakeMap().map)

    control._updateLabelRotations()
    markerRegistry.instances.forEach((marker) => {
      const label = marker.options.element.querySelector('div')!
      expect(label.style.transform).toMatch(/^rotate\(-?\d+(\.\d+)?deg\)$/)
    })
  })

  it('normalises a near-vertical edge angle into the readable range', () => {
    const control = new AaraToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    // Force a single label with an edge whose projected angle is < -90°, so the
    // +180 normalisation branch runs.
    const label = document.createElement('div')
    ;(control as unknown as { _labelEls: HTMLElement[] })._labelEls = [label]
    ;(control as unknown as { _labelEdges: [number, number][][] })._labelEdges = [
      [
        [0, 0],
        [-1, -1],
      ],
    ]
    control._updateLabelRotations()
    // atan2(-1,-1) = -135° → +180 → 45°.
    expect(label.style.transform).toBe('rotate(45deg)')
  })

  it('is a no-op when there are no labels yet', () => {
    const control = new AaraToggleControl(airStore)
    expect(() => control._updateLabelRotations()).not.toThrow()
  })
})

describe('AaraToggleControl.onRemove', () => {
  it('removes every label marker and detaches the container', () => {
    const control = new AaraToggleControl(airStore)
    const element = control.onAdd(fakeMap().map)
    document.body.appendChild(element)

    control.onRemove()
    markerRegistry.instances.forEach((marker) => expect(marker.remove).toHaveBeenCalled())
    expect(element.parentNode).toBeNull()
  })

  it('is a safe no-op when removed before any markers were built', () => {
    const control = new AaraToggleControl(airStore)
    expect(() => control.onRemove()).not.toThrow()
  })
})
