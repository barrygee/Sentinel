import { describe, it, expect, vi } from 'vitest'
import maplibregl from 'maplibre-gl'
import { OverheadZoneControl, OVERHEAD_ZONE_RADIUS_NM } from './OverheadZoneControl'

const SOURCE_ID = 'overhead-zone'
const FILL_ID = 'overhead-zone-fill'
const LINE_ID = 'overhead-zone-line'

interface FakeMap {
  map: maplibregl.Map
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  setData: ReturnType<typeof vi.fn>
  removeLayer: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  styleLoadHandlers: Array<() => void>
  layers: Set<string>
  sources: Set<string>
}

function fakeMap(options: { styleLoaded?: boolean } = {}): FakeMap {
  const styleLoadHandlers: Array<() => void> = []
  const layers = new Set<string>()
  const sources = new Set<string>()
  const setData = vi.fn()
  const addSource = vi.fn((id: string) => sources.add(id))
  const addLayer = vi.fn((layer: { id: string }) => layers.add(layer.id))
  const setLayoutProperty = vi.fn()
  const removeLayer = vi.fn((id: string) => layers.delete(id))
  const removeSource = vi.fn((id: string) => sources.delete(id))
  const map = {
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') styleLoadHandlers.push(handler)
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    getSource: vi.fn((id: string) => (sources.has(id) ? { setData } : undefined)),
    removeLayer,
    removeSource,
    addSource,
    addLayer,
    setLayoutProperty,
  } as unknown as maplibregl.Map
  return {
    map,
    addSource,
    addLayer,
    setLayoutProperty,
    setData,
    removeLayer,
    removeSource,
    styleLoadHandlers,
    layers,
    sources,
  }
}

const CENTER: [number, number] = [-1, 51]

describe('OverheadZoneControl.onAdd', () => {
  it('builds the source and fill/line layers immediately when the style is loaded', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: true })
    control.onAdd(map.map)

    expect(map.addSource).toHaveBeenCalledWith(
      SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: FILL_ID, type: 'fill' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: LINE_ID, type: 'line' }),
    )
  })

  it('defers initialisation to style.load when the style is not ready', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    expect(map.addSource).not.toHaveBeenCalled()
    map.styleLoadHandlers[0]!()
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('builds an empty source and keeps layers hidden when there is no centre', () => {
    const control = new OverheadZoneControl(true, null)
    const map = fakeMap()
    control.onAdd(map.map)
    const data = map.addSource.mock.calls[0]![1] as { data: GeoJSON.GeoJsonObject }
    expect((data.data as GeoJSON.FeatureCollection).features).toHaveLength(0)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(FILL_ID, 'visibility', 'none')
  })

  it('removes pre-existing layers/source before rebuilding', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    map.layers.add(FILL_ID)
    map.layers.add(LINE_ID)
    map.sources.add(SOURCE_ID)
    control.onAdd(map.map)
    expect(map.removeLayer).toHaveBeenCalledWith(LINE_ID)
    expect(map.removeLayer).toHaveBeenCalledWith(FILL_ID)
    expect(map.removeSource).toHaveBeenCalledWith(SOURCE_ID)
  })
})

describe('OverheadZoneControl visibility', () => {
  it('shows the zone when visible and a centre exists', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(FILL_ID, 'visibility', 'visible')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_ID, 'visibility', 'visible')
  })

  it('hides the zone when setVisible(false) is called', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setLayoutProperty.mockClear()

    control.setVisible(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(FILL_ID, 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LINE_ID, 'visibility', 'none')
  })

  it('keeps the zone hidden when visible but no centre exists', () => {
    const control = new OverheadZoneControl(true, null)
    const map = fakeMap()
    control.onAdd(map.map)
    // Only the 'none' visibility should ever be applied with no centre.
    const visibleCalls = map.setLayoutProperty.mock.calls.filter((args) => args[2] === 'visible')
    expect(visibleCalls).toHaveLength(0)
  })

  it('does nothing when no map is attached', () => {
    const control = new OverheadZoneControl(true, CENTER)
    expect(() => control.setVisible(false)).not.toThrow()
  })
})

describe('OverheadZoneControl.setRadiusNm', () => {
  it('ignores non-finite or non-positive radii', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)
    map.setData.mockClear()

    control.setRadiusNm(Number.NaN)
    control.setRadiusNm(0)
    control.setRadiusNm(-5)
    expect(map.setData).not.toHaveBeenCalled()
  })

  it('rewrites the source data for a valid radius when a centre and source exist', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)

    control.setRadiusNm(25)
    expect(map.setData).toHaveBeenCalledOnce()
  })

  it('reinitialises when a valid radius is set but the source is missing', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)
    map.sources.delete(SOURCE_ID) // simulate the source vanishing
    map.addSource.mockClear()

    control.setRadiusNm(25)
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('only stores the radius when there is no map or centre', () => {
    const control = new OverheadZoneControl(true, null)
    // No map attached: setRadiusNm must not throw and must not try to render.
    expect(() => control.setRadiusNm(25)).not.toThrow()
  })

  it('defaults the radius to the exported constant', () => {
    expect(OVERHEAD_ZONE_RADIUS_NM).toBe(10)
  })
})

describe('OverheadZoneControl.updateCenter', () => {
  it('sets the source data when the source already exists', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)

    control.updateCenter(2, 49)
    expect(map.setData).toHaveBeenCalledOnce()
  })

  it('reinitialises when no source exists yet', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map) // deferred → no source
    map.addSource.mockClear()

    control.updateCenter(2, 49)
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('applies visibility when a centre is gained for the first time', () => {
    const control = new OverheadZoneControl(true, null)
    const map = fakeMap()
    control.onAdd(map.map) // empty source, no centre
    map.setLayoutProperty.mockClear()

    control.updateCenter(2, 49)
    // Gaining a centre flips the gate, so the zone becomes visible.
    expect(map.setLayoutProperty).toHaveBeenCalledWith(FILL_ID, 'visibility', 'visible')
  })

  it('is a no-op without a map', () => {
    const control = new OverheadZoneControl(true, CENTER)
    expect(() => control.updateCenter(2, 49)).not.toThrow()
  })
})

describe('OverheadZoneControl.reinit and onRemove', () => {
  it('reinit rebuilds the source when a map is attached', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)
    map.addSource.mockClear()

    control.reinit()
    expect(map.addSource).toHaveBeenCalledOnce()
  })

  it('reinit is a no-op without a map', () => {
    const control = new OverheadZoneControl(true, CENTER)
    expect(() => control.reinit()).not.toThrow()
  })

  it('onRemove tears down layers and source and clears the map', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap()
    control.onAdd(map.map)

    control.onRemove()
    expect(map.removeLayer).toHaveBeenCalledWith(LINE_ID)
    expect(map.removeLayer).toHaveBeenCalledWith(FILL_ID)
    expect(map.removeSource).toHaveBeenCalledWith(SOURCE_ID)
    // A second onRemove with the map cleared must be a safe no-op.
    expect(() => control.onRemove()).not.toThrow()
  })

  it('onRemove skips teardown when the layers/source were never created', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: false }) // deferred → nothing built yet
    control.onAdd(map.map)

    control.onRemove()
    expect(map.removeLayer).not.toHaveBeenCalled()
    expect(map.removeSource).not.toHaveBeenCalled()
  })
})

describe('OverheadZoneControl deferred lifecycle edge cases', () => {
  it('applies visibility without touching absent layers before initialisation', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: false }) // deferred → no layers yet
    control.onAdd(map.map)
    // setVisible runs _applyVisibility, but the fill/line layers do not exist.
    expect(() => control.setVisible(false)).not.toThrow()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('ignores a style.load that fires after the control was removed', () => {
    const control = new OverheadZoneControl(true, CENTER)
    const map = fakeMap({ styleLoaded: false })
    control.onAdd(map.map)
    control.onRemove() // map detached before the deferred init runs

    // The captured style.load handler now runs against a null map → no-op.
    expect(() => map.styleLoadHandlers[0]!()).not.toThrow()
    expect(map.addSource).not.toHaveBeenCalled()
  })
})
