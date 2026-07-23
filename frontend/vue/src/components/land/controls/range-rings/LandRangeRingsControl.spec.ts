import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LandRangeRingsControl } from './LandRangeRingsControl'

const LAYER = 'land-range-rings'

function makeFakeMap(styleLoaded = true) {
  const state = {
    layers: new Set<string>(),
    sources: new Map<string, { data?: unknown; setData: ReturnType<typeof vi.fn> }>(),
    visibility: {} as Record<string, string>,
    styleLoadCb: null as null | (() => void),
  }
  const map = {
    isStyleLoaded: () => styleLoaded,
    once: (event: string, cb: () => void) => {
      if (event === 'style.load') state.styleLoadCb = cb
    },
    getLayer: (id: string) => (state.layers.has(id) ? { id } : undefined),
    removeLayer: (id: string) => state.layers.delete(id),
    getSource: (id: string) => state.sources.get(id),
    removeSource: (id: string) => state.sources.delete(id),
    addSource: (id: string, source: { data: unknown }) =>
      state.sources.set(id, {
        data: source.data,
        setData: vi.fn((data) => (state.sources.get(id)!.data = data)),
      }),
    addLayer: (layer: { id: string; layout?: { visibility?: string } }) => {
      state.layers.add(layer.id)
      state.visibility[layer.id] = layer.layout?.visibility ?? 'visible'
    },
    setLayoutProperty: (id: string, prop: string, value: string) => {
      if (prop === 'visibility') state.visibility[id] = value
    },
    _state: state,
  }
  return map
}

describe('LandRangeRingsControl', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('starts hidden by default and builds the ring layer on init', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    expect(map._state.layers.has(LAYER)).toBe(true)
    expect(map._state.visibility[LAYER]).toBe('none') // toggle off by default
  })

  it('restores an ON toggle from localStorage and shows rings when a location exists', () => {
    localStorage.setItem('sentinel_land_rangeRings', '1')
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    expect(map._state.visibility[LAYER]).toBe('visible')
  })

  it('falls back to hidden when localStorage read throws', () => {
    // Store '1' so a *successful* read would show rings — proving the catch ran
    // when the result is instead hidden.
    localStorage.setItem('sentinel_land_rangeRings', '1')
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    expect(map._state.visibility[LAYER]).toBe('none') // read threw → default hidden
    spy.mockRestore()
  })

  it('exposes the current toggle state via `visible`', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    expect(control.visible).toBe(false)
    control.handleClickPublic()
    expect(control.visible).toBe(true)
  })

  it('toggles rings on click and persists the choice', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    control.handleClickPublic()
    expect(map._state.visibility[LAYER]).toBe('visible')
    expect(localStorage.getItem('sentinel_land_rangeRings')).toBe('1')
    control.handleClickPublic()
    expect(map._state.visibility[LAYER]).toBe('none')
    expect(localStorage.getItem('sentinel_land_rangeRings')).toBe('0')
  })

  it('swallows a localStorage write failure on toggle', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(map._state.visibility[LAYER]).toBe('visible') // still toggled in memory
    spy.mockRestore()
  })

  it('stays hidden when toggled on with no location', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => null)
    control.onAdd(map as never)
    control.handleClickPublic() // toggle on, but no location
    expect(map._state.visibility[LAYER]).toBe('none')
  })

  it('shows rings once a location becomes available', () => {
    localStorage.setItem('sentinel_land_rangeRings', '1')
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => null)
    control.onAdd(map as never)
    expect(map._state.visibility[LAYER]).toBe('none') // no location yet
    control.setLocationAvailable(true)
    expect(map._state.visibility[LAYER]).toBe('visible')
  })

  it('re-centres the rings on a new fix', () => {
    const map = makeFakeMap()
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    control.updateCenter(-1, 55)
    expect(map._state.sources.get(LAYER)!.setData).toHaveBeenCalledOnce()
  })

  it('defers layer creation until the style has loaded', () => {
    const map = makeFakeMap(false) // style not ready
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    expect(map._state.layers.has(LAYER)).toBe(false) // not built yet
    map._state.styleLoadCb?.() // style.load fires
    expect(map._state.layers.has(LAYER)).toBe(true)
  })

  it('replaces a stale ring layer/source left by a previous style', () => {
    const map = makeFakeMap()
    // Pre-seed a stale layer + source (e.g. survived a style reload).
    map._state.layers.add(LAYER)
    const stale = { data: 'stale', setData: vi.fn() }
    map._state.sources.set(LAYER, stale)
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    // initRings removes the stale layer/source, then re-adds fresh ones.
    expect(map._state.sources.get(LAYER)).not.toBe(stale)
    expect(map._state.layers.has(LAYER)).toBe(true)
  })

  it('is a no-op when re-centred or toggled before the layer exists', () => {
    const map = makeFakeMap(false) // style not ready → no layer/source yet
    const control = new LandRangeRingsControl(() => [-2, 54])
    control.onAdd(map as never)
    // Both guard against a missing layer/source rather than throwing.
    expect(() => control.updateCenter(-1, 55)).not.toThrow()
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(map._state.sources.has(LAYER)).toBe(false)
  })
})
