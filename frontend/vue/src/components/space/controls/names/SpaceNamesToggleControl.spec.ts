import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import { SpaceNamesToggleControl } from './SpaceNamesToggleControl'
import { useSpaceStore } from '@/stores/space'

// The full set of label layers the control toggles together.
const NAME_LAYERS = [
  'place_country',
  'place_country_other',
  'place_suburb',
  'place_village',
  'place_town',
  'place_city',
  'place_state',
  'water_name',
]

interface FakeMap {
  map: maplibregl.Map
  isStyleLoaded: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
}

// A fake MapLibre map whose `getLayer` reports only `existingLayers` as present,
// so we can assert the control skips layers that are absent from the style.
function fakeMap(options: { styleLoaded?: boolean; existingLayers?: string[] } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const existingLayers = new Set(options.existingLayers ?? NAME_LAYERS)
  const isStyleLoaded = vi.fn(() => options.styleLoaded ?? true)
  const once = vi.fn((event: string, handler: () => void) => {
    if (event === 'style.load') styleLoadHandlers.push(handler)
  })
  const getLayer = vi.fn((id: string) => (existingLayers.has(id) ? { id } : undefined))
  const setLayoutProperty = vi.fn()
  const map = { isStyleLoaded, once, getLayer, setLayoutProperty } as unknown as maplibregl.Map
  return { map, isStyleLoaded, once, getLayer, setLayoutProperty, styleLoadHandlers }
}

let spaceStore: ReturnType<typeof useSpaceStore>

beforeEach(() => {
  setActivePinia(createPinia())
  spaceStore = useSpaceStore()
})

describe('SpaceNamesToggleControl constructor', () => {
  it('seeds visibility from the space store overlay state (default on)', () => {
    expect(new SpaceNamesToggleControl(spaceStore).namesVisible).toBe(true)
  })

  it('seeds visibility as off when the store has names disabled', () => {
    spaceStore.setOverlay('names', false)
    expect(new SpaceNamesToggleControl(spaceStore).namesVisible).toBe(false)
  })

  it('exposes its label and title', () => {
    const control = new SpaceNamesToggleControl(spaceStore)
    expect(control.buttonLabel).toBe('N')
    expect(control.buttonTitle).toBe('Toggle city names')
  })
})

describe('SpaceNamesToggleControl.onInit', () => {
  it('applies visibility immediately when the style is already loaded', () => {
    spaceStore.setOverlay('names', true)
    const control = new SpaceNamesToggleControl(spaceStore)
    const map = fakeMap({ styleLoaded: true, existingLayers: ['place_city', 'water_name'] })
    control.onAdd(map.map)

    // Only the two present layers are touched, each set visible.
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(2)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('place_city', 'visibility', 'visible')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('water_name', 'visibility', 'visible')
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })

  it('defers visibility application to the style.load event when the style is not ready', () => {
    spaceStore.setOverlay('names', true)
    const control = new SpaceNamesToggleControl(spaceStore)
    const map = fakeMap({ styleLoaded: false, existingLayers: ['place_city'] })
    control.onAdd(map.map)

    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function))

    map.styleLoadHandlers[0]!()
    expect(map.setLayoutProperty).toHaveBeenCalledWith('place_city', 'visibility', 'visible')
  })
})

describe('SpaceNamesToggleControl.handleClick', () => {
  it('toggles names off, hides the layers, and persists the new state', () => {
    spaceStore.setOverlay('names', true)
    const control = new SpaceNamesToggleControl(spaceStore)
    const map = fakeMap({ existingLayers: ['place_city'] })
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(control.namesVisible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('place_city', 'visibility', 'none')
    expect(spaceStore.overlayStates.names).toBe(false)
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('toggles names on, shows the layers, and persists the new state', () => {
    spaceStore.setOverlay('names', false)
    const control = new SpaceNamesToggleControl(spaceStore)
    const map = fakeMap({ existingLayers: ['place_city'] })
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()

    expect(control.namesVisible).toBe(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('place_city', 'visibility', 'visible')
    expect(spaceStore.overlayStates.names).toBe(true)
    expect(control.button.style.opacity).toBe('1')
  })

  it('skips layers that are absent from the current style', () => {
    const control = new SpaceNamesToggleControl(spaceStore)
    const map = fakeMap({ existingLayers: [] })
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.handleClickPublic()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})
