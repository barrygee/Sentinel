import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { AwacToggleControl } from './AwacControl'
import { useAirStore } from '@/stores/air'
import type { AirStore } from '../types'
import type maplibregl from 'maplibre-gl'

const SOURCE_ID = 'awacs-orbits'
const LAYER_IDS = ['awacs-fill', 'awacs-outline']

interface FakeMap {
  map: maplibregl.Map
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
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
  } as unknown as maplibregl.Map
  return { map, addSource, addLayer, setLayoutProperty, styleLoadHandlers, sources, layers }
}

let airStore: AirStore

beforeEach(() => {
  setActivePinia(createPinia())
  airStore = useAirStore()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('AwacToggleControl constructor', () => {
  it('seeds visibility from the store (default on)', () => {
    expect(new AwacToggleControl(airStore).visible).toBe(true)
  })

  it('seeds visibility off when the store disables AWACS', () => {
    airStore.setOverlay('awacs', false)
    expect(new AwacToggleControl(airStore).visible).toBe(false)
  })

  it('exposes its label and title', () => {
    const control = new AwacToggleControl(airStore)
    expect(control.buttonLabel).toBe('○')
    expect(control.buttonTitle).toBe('Toggle UK AWACS orbits')
  })
})

describe('AwacToggleControl.onInit', () => {
  it('adds the orbit source and fill/outline layers visible when enabled', () => {
    const control = new AwacToggleControl(airStore)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    const fillLayer = map.addLayer.mock.calls.find((call) => call[0].id === 'awacs-fill')![0]
    const outlineLayer = map.addLayer.mock.calls.find((call) => call[0].id === 'awacs-outline')![0]
    expect(fillLayer).toMatchObject({ type: 'fill', layout: { visibility: 'visible' } })
    expect(outlineLayer).toMatchObject({ type: 'line', layout: { visibility: 'visible' } })
    // Button reflects the active state.
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })

  it('builds layers hidden when the overlay is disabled', () => {
    airStore.setOverlay('awacs', false)
    const control = new AwacToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)

    LAYER_IDS.forEach((id) => {
      const layer = map.addLayer.mock.calls.find((call) => call[0].id === id)![0]
      expect(layer.layout.visibility).toBe('none')
    })
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new AwacToggleControl(airStore)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('does not rebuild when the source already exists', () => {
    const control = new AwacToggleControl(airStore)
    const map = fakeMap()
    map.sources.add(SOURCE_ID) // pretend it was already initialised
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
  })
})

describe('AwacToggleControl.toggle', () => {
  it('hides the layers and persists when toggled off', () => {
    const control = new AwacToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(control.visible).toBe(false)
    LAYER_IDS.forEach((id) =>
      expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'none'),
    )
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
    expect(airStore.overlayStates.awacs).toBe(false)
  })

  it('shows the layers and persists when toggled back on', () => {
    airStore.setOverlay('awacs', false)
    const control = new AwacToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)

    control.handleClickPublic()

    expect(control.visible).toBe(true)
    LAYER_IDS.forEach((id) =>
      expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'visible'),
    )
    expect(airStore.overlayStates.awacs).toBe(true)
  })

  it('skips absent layers when toggling', () => {
    const control = new AwacToggleControl(airStore)
    const map = fakeMap()
    control.onAdd(map.map)
    map.layers.clear() // layers vanished from the style
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    // Store still updated even though no layers were touched.
    expect(airStore.overlayStates.awacs).toBe(false)
  })
})
