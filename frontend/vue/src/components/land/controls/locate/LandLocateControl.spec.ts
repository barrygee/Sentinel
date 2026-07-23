import { describe, it, expect, vi } from 'vitest'
import { LandLocateControl } from './LandLocateControl'

function makeFakeMap(zoom = 6) {
  return { flyTo: vi.fn(), getZoom: vi.fn(() => zoom) }
}

describe('LandLocateControl', () => {
  it('exposes a "Go to my location" accessible name and a glyph', () => {
    const control = new LandLocateControl(() => null)
    const container = control.onAdd(makeFakeMap() as never)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('Go to my location')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('flies to the user location, zooming in to at least the locate zoom', () => {
    const map = makeFakeMap(6)
    const control = new LandLocateControl(() => [-1.5, 54.5])
    control.onAdd(map as never)
    control.handleClickPublic()
    expect(map.flyTo).toHaveBeenCalledWith({ center: [-1.5, 54.5], zoom: 10 })
  })

  it('keeps the current zoom when already closer than the locate zoom', () => {
    const map = makeFakeMap(13)
    const control = new LandLocateControl(() => [-1.5, 54.5])
    control.onAdd(map as never)
    control.handleClickPublic()
    expect(map.flyTo).toHaveBeenCalledWith({ center: [-1.5, 54.5], zoom: 13 })
  })

  it('does nothing when no location is available yet', () => {
    const map = makeFakeMap()
    const control = new LandLocateControl(() => null)
    control.onAdd(map as never)
    control.handleClickPublic()
    expect(map.flyTo).not.toHaveBeenCalled()
  })
})
