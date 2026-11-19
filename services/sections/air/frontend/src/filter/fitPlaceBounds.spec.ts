import { describe, it, expect, vi, afterEach } from 'vitest'

const chromeInsets = vi.hoisted(() => ({ left: 0, right: 0 }))
vi.mock('@sentinel/shell-api/shell/mapChromeInsets', () => ({
  mapChromeInsets: vi.fn(() => chromeInsets),
}))

import type { Map as MapLibreMap } from 'maplibre-gl'
import { mapChromeInsets } from '@sentinel/shell-api/shell/mapChromeInsets'
import { boundsCentredOn, fitPlaceBounds } from './fitPlaceBounds'

function makeMap() {
  const container = document.createElement('div')
  return {
    container,
    map: { fitBounds: vi.fn(), getContainer: vi.fn(() => container) },
  }
}

// A stand-in for MapLibre's top-right control stack, with a measured size.
function addControlStack(width: number, height: number): HTMLElement {
  const stack = document.createElement('div')
  stack.className = 'maplibregl-ctrl-top-right'
  Object.defineProperty(stack, 'offsetWidth', { value: width })
  Object.defineProperty(stack, 'offsetHeight', { value: height })
  document.body.appendChild(stack)
  return stack
}

afterEach(() => {
  document.body.innerHTML = ''
  chromeInsets.left = 0
  chromeInsets.right = 0
})

describe('boundsCentredOn', () => {
  it('grows a box whose marker sits on its top edge to centre on the marker', () => {
    // EGNT-like: the marker is on the north edge of its stored box.
    const [west, south, east, north] = boundsCentredOn([-1.8, 54.9, -1.6, 55.1], [-1.7, 55.1])
    expect(west).toBeCloseTo(-1.8, 10)
    expect(east).toBeCloseTo(-1.6, 10)
    // The south half (0.2) is kept and mirrored north of the marker.
    expect(south).toBeCloseTo(54.9, 10)
    expect(north).toBeCloseTo(55.3, 10)
  })

  it('takes the larger half on each axis', () => {
    // Marker near the west and north edges: the east and south halves win.
    expect(boundsCentredOn([0, 0, 10, 4], [2, 3])).toEqual([-6, 0, 10, 6])
    // Marker near the east and south edges: the west and north halves win.
    expect(boundsCentredOn([0, 0, 10, 4], [8, 1])).toEqual([0, -2, 16, 4])
  })

  it('leaves a box already centred on the marker unchanged', () => {
    expect(boundsCentredOn([-1, -2, 1, 2], [0, 0])).toEqual([-1, -2, 1, 2])
  })
})

describe('fitPlaceBounds', () => {
  it('fits the centred box with the base padding when nothing covers the map', () => {
    const { map, container } = makeMap()
    fitPlaceBounds(map as unknown as MapLibreMap, [0, 0, 10, 4], [2, 3])
    expect(mapChromeInsets).toHaveBeenCalledWith(container)
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [-6, 0],
        [10, 6],
      ],
      { padding: { top: 80, bottom: 80, left: 80, right: 80 }, maxZoom: 13, duration: 800 },
    )
  })

  it('pads by the shell chrome and the control stack width', () => {
    chromeInsets.left = 430
    chromeInsets.right = 44
    addControlStack(50, 100)
    const { map } = makeMap()
    fitPlaceBounds(map as unknown as MapLibreMap, [-1, -1, 1, 1], [0, 0])
    expect(map.fitBounds.mock.calls[0]![1].padding).toEqual({
      // A stack no taller than twice the padding adds nothing on top.
      top: 80,
      bottom: 80,
      left: 80 + 430,
      right: 80 + 50 + 44,
    })
  })

  it('adds top padding for the half of a tall control stack beyond the base padding', () => {
    addControlStack(40, 400)
    const { map } = makeMap()
    fitPlaceBounds(map as unknown as MapLibreMap, [-1, -1, 1, 1], [0, 0])
    expect(map.fitBounds.mock.calls[0]![1].padding.top).toBe(80 + (400 / 2 - 80))
  })

  it('adds no top padding for a stack exactly twice the base padding tall', () => {
    addControlStack(40, 160)
    const { map } = makeMap()
    fitPlaceBounds(map as unknown as MapLibreMap, [-1, -1, 1, 1], [0, 0])
    expect(map.fitBounds.mock.calls[0]![1].padding.top).toBe(80)
  })
})
