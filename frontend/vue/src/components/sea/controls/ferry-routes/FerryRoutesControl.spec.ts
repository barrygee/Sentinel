import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { FerryRoutesControl } from './FerryRoutesControl'
import { useSeaStore } from '@/stores/sea'

interface FakeLayer {
  id: string
  beneath: string | undefined
  spec: Record<string, unknown>
}

/** A stand-in map that records layers, insertion order and layout writes.
 *  `styleLayers` seeds base-style layers (with their source layers) so the
 *  control's schema probe has something to read. */
function makeFakeMap(
  options: { styleLayers?: Record<string, string>; withVessels?: boolean } = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const layers: FakeLayer[] = []
  const layout: Record<string, Record<string, unknown>> = {}
  const styleLayers = options.styleLayers ?? {}
  return {
    getContainer: () => container,
    addLayer: (spec: { id: string }, beneath?: string) => {
      layers.push({ id: spec.id, beneath, spec })
      layout[spec.id] = {}
    },
    getLayer: (id: string) => {
      const own = layers.find((layer) => layer.id === id)
      if (own) return own
      if (id in styleLayers) return { id, sourceLayer: styleLayers[id] }
      if (options.withVessels && id === 'sea-vessel-track-line') return { id }
      return undefined
    },
    setLayoutProperty: (id: string, name: string, value: unknown) => {
      layout[id]![name] = value
    },
    _layers: layers,
    _layout: layout,
  }
}

describe('FerryRoutesControl', () => {
  let store: ReturnType<typeof useSeaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    store = useSeaStore()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function addControl(options: Parameters<typeof makeFakeMap>[0] = {}) {
    const control = new FerryRoutesControl(store)
    const map = makeFakeMap(options)
    control.onAdd(map as never)
    return { control, map }
  }

  it('describes itself with an icon and an accessible title', () => {
    const { control } = addControl()
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect(control.buttonTitle).toBe('Toggle ferry routes')
    expect(control.button.getAttribute('aria-label')).toBe('Toggle ferry routes')
  })

  it('adds a dashed line and a label layer over the base-map source, beneath the vessels', () => {
    const { map } = addControl({ withVessels: true })
    expect(map._layers.map((layer) => layer.id)).toEqual([
      'sea-ferry-routes-line',
      'sea-ferry-routes-label',
    ])
    expect(map._layers.every((layer) => layer.beneath === 'sea-vessel-track-line')).toBe(true)
    expect(map._layers.every((layer) => layer.spec.source === 'openmaptiles')).toBe(true)
    const [line, label] = map._layers as [FakeLayer, FakeLayer]
    expect(line.spec.type).toBe('line')
    expect((line.spec.paint as Record<string, unknown>)['line-dasharray']).toEqual([1, 3])
    expect(label.spec.type).toBe('symbol')
    expect((label.spec.layout as Record<string, unknown>)['symbol-placement']).toBe('line')
  })

  it('goes on top when there are no vessel layers yet, and initLayers is idempotent', () => {
    const { control, map } = addControl()
    expect(map._layers.every((layer) => layer.beneath === undefined)).toBe(true)
    control.initLayers()
    expect(map._layers).toHaveLength(2)
  })

  it('reads the offline Protomaps schema by default (roads / kind)', () => {
    const { map } = addControl({ styleLayers: { highway_minor: 'roads' } })
    for (const layer of map._layers) {
      expect(layer.spec['source-layer']).toBe('roads')
      expect(layer.spec.filter).toEqual(['==', ['get', 'kind'], 'ferry'])
    }
  })

  it('falls back to the offline schema when the probe layer is missing', () => {
    const { map } = addControl()
    expect(map._layers[0]!.spec['source-layer']).toBe('roads')
  })

  it('reads the online OpenMapTiles schema (transportation / class) off the base style', () => {
    const { map } = addControl({ styleLayers: { highway_minor: 'transportation' } })
    const [line, label] = map._layers as [FakeLayer, FakeLayer]
    expect(line.spec['source-layer']).toBe('transportation')
    expect(label.spec['source-layer']).toBe('transportation_name')
    for (const layer of map._layers) {
      expect(layer.spec.filter).toEqual(['==', ['get', 'class'], 'ferry'])
    }
  })

  it('is visible by default and follows the store flag on the layers and the button', () => {
    const { control, map } = addControl()
    expect(control.visible).toBe(true)
    for (const layer of map._layers) expect(map._layout[layer.id]!.visibility).toBe('visible')
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')

    store.setOverlay('ferryRoutes', false)
    control.applyVisibility()
    for (const layer of map._layers) expect(map._layout[layer.id]!.visibility).toBe('none')
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
  })

  it('toggles the store flag from the button and from the side menu', () => {
    const { control, map } = addControl()
    control.button.click()
    expect(store.overlayStates.ferryRoutes).toBe(false)
    expect(map._layout['sea-ferry-routes-line']!.visibility).toBe('none')
    control.toggle()
    expect(store.overlayStates.ferryRoutes).toBe(true)
    expect(map._layout['sea-ferry-routes-label']!.visibility).toBe('visible')
  })

  it('skips layers that are not on the map when applying visibility', () => {
    const { control, map } = addControl()
    map._layers.length = 0 // the style was swapped and the layers are gone
    expect(() => control.applyVisibility()).not.toThrow()
  })
})
