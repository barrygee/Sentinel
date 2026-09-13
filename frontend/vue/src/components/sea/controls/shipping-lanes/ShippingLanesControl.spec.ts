import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ShippingLanesControl, SHIPPING_LANES_MIN_ZOOM } from './ShippingLanesControl'
import { useSeaStore } from '@/stores/sea'

function makeFakeMap(options: { zoom?: number; withVessels?: boolean } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers: Record<string, Array<() => void>> = {}
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers: Array<{ id: string; beneath: string | undefined; spec: Record<string, unknown> }> =
    []
  const layout: Record<string, Record<string, unknown>> = {}
  const map = {
    zoom: options.zoom ?? 9,
    getContainer: () => container,
    getZoom(): number {
      return this.zoom
    },
    getBounds: () => ({
      getSouth: () => 50,
      getNorth: () => 52,
      getWest: () => 0,
      getEast: () => 2,
    }),
    on: (event: string, handler: () => void) => {
      ;(handlers[event] ??= []).push(handler)
    },
    off: (event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter((each) => each !== handler)
    },
    _emit: (event: string) => (handlers[event] ?? []).forEach((handler) => handler()),
    _handlerCount: (event: string) => (handlers[event] ?? []).length,
    addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
    getSource: (id: string) => sources.get(id),
    addLayer: (spec: { id: string }, beneath?: string) => {
      layers.push({ id: spec.id, beneath, spec })
      layout[spec.id] = {}
    },
    getLayer: (id: string) =>
      layers.find((layer) => layer.id === id) ??
      (options.withVessels && id === 'sea-vessel-track-line' ? { id } : undefined),
    setLayoutProperty: (id: string, name: string, value: unknown) => {
      layout[id]![name] = value
    },
    _sources: sources,
    _layers: layers,
    _layout: layout,
  }
  return map
}

const ROUTE = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 50],
      [1, 51],
    ],
  },
  properties: { kind: 'separation_lane' },
}

function lanesResponse(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

describe('ShippingLanesControl', () => {
  let store: ReturnType<typeof useSeaStore>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    store = useSeaStore()
    fetchMock = vi
      .fn()
      .mockResolvedValue(lanesResponse({ type: 'FeatureCollection', features: [ROUTE] }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function addControl(options: Parameters<typeof makeFakeMap>[0] = {}) {
    const control = new ShippingLanesControl(store)
    const map = makeFakeMap(options)
    control.onAdd(map as never)
    return { control, map }
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(400)
  }

  it('adds one source and three layers beneath the vessel layers, hidden by default', () => {
    const { control, map } = addControl({ withVessels: true })
    expect(control.buttonTitle).toBe('Toggle shipping lanes')
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect([...map._sources.keys()]).toEqual(['sea-shipping-lanes'])
    expect(map._layers.map((layer) => layer.id)).toEqual([
      'sea-shipping-lanes-fill',
      'sea-shipping-lanes-line',
      'sea-shipping-lanes-line-dashed',
    ])
    expect(map._layers.every((layer) => layer.beneath === 'sea-vessel-track-line')).toBe(true)
    expect(map._layers.every((layer) => layer.spec.minzoom === SHIPPING_LANES_MIN_ZOOM)).toBe(true)
    for (const layer of map._layers) expect(map._layout[layer.id]!.visibility).toBe('none')
    expect(control.visible).toBe(false)
  })

  it('goes on top when there are no vessel layers yet, and initLayers is idempotent', () => {
    const { control, map } = addControl()
    expect(map._layers.every((layer) => layer.beneath === undefined)).toBe(true)
    control.initLayers()
    expect(map._layers).toHaveLength(3)
  })

  it('does not fetch while switched off, then fetches the padded viewport when switched on', async () => {
    const { control, map } = addControl()
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    control.toggle()
    expect(store.overlayStates.shippingLanes).toBe(true)
    for (const layer of map._layers) expect(map._layout[layer.id]!.visibility).toBe('visible')
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toBe('/api/sea/lanes?bbox=49.50,-0.50,52.50,2.50')
    const source = map._sources.get('sea-shipping-lanes')!
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [ROUTE] })
    // The same view is not asked for twice.
    map._emit('moveend')
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('debounces a run of moves into one request', async () => {
    const { map } = addControl()
    store.setOverlay('shippingLanes', true)
    map._emit('moveend')
    map._emit('moveend')
    map._emit('moveend')
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('draws nothing below the minimum zoom', async () => {
    const { map } = addControl({ zoom: SHIPPING_LANES_MIN_ZOOM - 1 })
    store.setOverlay('shippingLanes', true)
    map._emit('moveend')
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps what is drawn on a too-wide answer and asks again while cells are still fetching', async () => {
    const { map } = addControl()
    const source = map._sources.get('sea-shipping-lanes')!
    fetchMock.mockResolvedValueOnce(
      lanesResponse({ type: 'FeatureCollection', features: [ROUTE], partial: true }),
    )
    store.setOverlay('shippingLanes', true)
    await settle()
    expect(source.setData).toHaveBeenCalledTimes(1)
    // A partial answer schedules a forced re-ask for the same bbox.
    fetchMock.mockResolvedValueOnce(
      lanesResponse({ type: 'FeatureCollection', features: [], tooWide: true }),
    )
    await vi.advanceTimersByTimeAsync(4_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(source.setData).toHaveBeenCalledTimes(1) // too wide: nothing replaced
  })

  it('leaves the last routes drawn on a failed or aborted request', async () => {
    const { map } = addControl()
    const source = map._sources.get('sea-shipping-lanes')!
    fetchMock.mockResolvedValueOnce(lanesResponse({}, false))
    store.setOverlay('shippingLanes', true)
    await settle()
    expect(source.setData).not.toHaveBeenCalled()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    map.zoom = 10 // a new view
    map._emit('moveend')
    await settle()
    expect(source.setData).not.toHaveBeenCalled()
  })

  it('a newer request aborts the one in flight and its late answer is dropped', async () => {
    const { control, map } = addControl()
    const source = map._sources.get('sea-shipping-lanes')!
    let resolveFirst!: (value: unknown) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    store.setOverlay('shippingLanes', true)
    await settle()
    const firstSignal = (fetchMock.mock.calls[0]![1] as { signal: AbortSignal }).signal
    // Force a second request for the same view before the first answers.
    ;(
      control as unknown as { _scheduleFetch: (delay: number, force: boolean) => void }
    )._scheduleFetch(0, true)
    await settle()
    expect(firstSignal.aborted).toBe(true)
    resolveFirst(lanesResponse({ type: 'FeatureCollection', features: [ROUTE, ROUTE] }))
    await settle()
    expect(source.setData).toHaveBeenCalledTimes(1)
    expect((source.setData.mock.calls[0]![0] as GeoJSON.FeatureCollection).features).toHaveLength(1)
  })

  it('removes its listeners and cancels pending work', async () => {
    const { control, map } = addControl()
    store.setOverlay('shippingLanes', true)
    map._emit('moveend')
    control.onRemove()
    expect(map._handlerCount('moveend')).toBe(0)
    vi.advanceTimersByTime(1_000)
    expect(fetchMock).not.toHaveBeenCalled()
    // Removing while a request is in flight aborts it.
    const again = addControl()
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))
    store.setOverlay('shippingLanes', true)
    again.control.applyVisibility()
    await settle()
    const signal = (fetchMock.mock.calls.at(-1)![1] as { signal: AbortSignal }).signal
    again.control.onRemove()
    expect(signal.aborted).toBe(true)
  })

  it('reflects the store flag on the button', () => {
    const { control } = addControl()
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
    store.setOverlay('shippingLanes', true)
    control.applyVisibility()
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })
})
