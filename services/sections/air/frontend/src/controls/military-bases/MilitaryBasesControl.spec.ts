import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The labels themselves are AirfieldMarkers' own spec; this control's job is
// feeding it the right sites and keeping it in step.
const fieldRegistry = vi.hoisted(() => ({
  instances: [] as Array<{
    sites: Array<{
      name: string
      code?: string
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

import { MilitaryBasesToggleControl, MILITARY_BASES_DATA } from './MilitaryBasesControl'
import { useAirStore } from '../../stores/air'
import type { AirStore } from '../types'
import type * as maplibregl from 'maplibre-gl'

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
  fieldRegistry.instances.length = 0
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
  it('hands every site to the labels, then shows and attaches them', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    const [labels] = fieldRegistry.instances
    expect(labels!.kind).toBe('military')
    expect(labels!.sites).toHaveLength(MILITARY_BASES_DATA.features.length)
    expect(labels!.sites[0]!.code).toBe(MILITARY_BASES_DATA.features[0]!.properties.icao)
    expect(labels!.setVisible).toHaveBeenCalledWith(true)
    expect(labels!.attach).toHaveBeenCalled()
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(fieldRegistry.instances).toHaveLength(0)
    map.styleLoadHandlers[0]!()
    expect(fieldRegistry.instances).toHaveLength(1)
  })

  it('keeps the labels hidden when the overlay is off', () => {
    airStore.setOverlay('militaryBases', false)
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenCalledWith(false)
  })

  it('replaces a pre-existing source on initialisation', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap({ styleLoaded: true })
    map.sources.add('military-bases')
    control.onAdd(map.map)
    expect(map.removeSource).toHaveBeenCalledWith('military-bases')
  })

  it('re-attaches the same labels after a style reload', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.initLayers()
    expect(fieldRegistry.instances).toHaveLength(1)
    expect(fieldRegistry.instances[0]!.attach).toHaveBeenCalledTimes(2)
  })
})

describe('MilitaryBasesToggleControl site click', () => {
  it('eases to the base with a 45° pitch when 3D is active', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => true)
    const map = fakeMap()
    control.onAdd(map.map)
    fieldRegistry.instances[0]!.sites[0]!.onClick()
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 16, duration: 800, pitch: 45 }),
    )
  })

  it('eases without pitch when 3D is inactive', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    const map = fakeMap()
    control.onAdd(map.map)
    fieldRegistry.instances[0]!.sites[0]!.onClick()
    const easeArgs = map.easeTo.mock.calls[0]![0] as Record<string, unknown>
    expect(easeArgs).not.toHaveProperty('pitch')
  })
})

describe('MilitaryBasesToggleControl.toggle', () => {
  it('hides the labels and persists when toggled off', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.toggle()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(false)
    expect(airStore.overlayStates.militaryBases).toBe(false)
  })

  it('shows the labels and persists when toggled back on', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.toggle()
    control.toggle()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(true)
    expect(airStore.overlayStates.militaryBases).toBe(true)
  })

  it('persists the toggle even before the labels are built', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.toggle()
    expect(airStore.overlayStates.militaryBases).toBe(false)
  })
})

describe('MilitaryBasesToggleControl button', () => {
  it('toggles on click', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    ;(control as unknown as { handleClick: () => void }).handleClick()
    expect(control.visible).toBe(false)
  })
})

describe('MilitaryBasesToggleControl.onRemove', () => {
  it('hides the labels', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: true }).map)
    control.onRemove()
    expect(fieldRegistry.instances[0]!.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('is a safe no-op when removed before any labels were built', () => {
    const control = new MilitaryBasesToggleControl(airStore, () => false)
    control.onAdd(fakeMap({ styleLoaded: false }).map)
    expect(() => control.onRemove()).not.toThrow()
  })
})
