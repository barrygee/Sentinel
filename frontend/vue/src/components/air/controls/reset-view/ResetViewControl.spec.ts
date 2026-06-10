import { describe, it, expect, vi } from 'vitest'
import maplibregl from 'maplibre-gl'
import { ResetViewControl } from './ResetViewControl'

function fakeMap(): { map: maplibregl.Map; flyTo: ReturnType<typeof vi.fn> } {
  const flyTo = vi.fn()
  return { map: { flyTo } as unknown as maplibregl.Map, flyTo }
}

describe('ResetViewControl', () => {
  it('exposes a descriptive title and an SVG home icon label', () => {
    const control = new ResetViewControl()
    expect(control.buttonTitle).toBe('Reset view to home')
    expect(control.buttonLabel.trimStart().startsWith('<svg')).toBe(true)
  })

  it('renders the SVG icon into the button on add', () => {
    const control = new ResetViewControl()
    const { map } = fakeMap()
    control.onAdd(map)
    expect(control.button.querySelector('svg')).not.toBeNull()
  })

  it('flies the map back to the home centre and zoom with level pitch/bearing on click', () => {
    const control = new ResetViewControl()
    const { map, flyTo } = fakeMap()
    control.onAdd(map)

    control.handleClickPublic()

    expect(flyTo).toHaveBeenCalledWith({
      center: [-4.4815, 54.1453],
      zoom: 6,
      pitch: 0,
      bearing: 0,
    })
  })
})
