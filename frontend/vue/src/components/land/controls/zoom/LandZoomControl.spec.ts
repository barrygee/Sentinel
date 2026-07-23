import { describe, it, expect, vi } from 'vitest'
import { LandZoomControl } from './LandZoomControl'

function makeFakeMap() {
  return { zoomIn: vi.fn(), zoomOut: vi.fn() }
}

describe('LandZoomControl', () => {
  it('renders a + and − button with accessible names', () => {
    const control = new LandZoomControl()
    const container = control.onAdd(makeFakeMap() as never)
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].textContent).toBe('+')
    expect(buttons[0].getAttribute('aria-label')).toBe('Zoom in')
    expect(buttons[1].textContent).toBe('−')
    expect(buttons[1].getAttribute('aria-label')).toBe('Zoom out')
  })

  it('zooms the map in and out on click', () => {
    const map = makeFakeMap()
    const control = new LandZoomControl()
    const container = control.onAdd(map as never)
    const [zoomIn, zoomOut] = container.querySelectorAll('button')
    zoomIn.dispatchEvent(new Event('click'))
    expect(map.zoomIn).toHaveBeenCalledOnce()
    zoomOut.dispatchEvent(new Event('click'))
    expect(map.zoomOut).toHaveBeenCalledOnce()
  })

  it('applies a hover tint on the buttons', () => {
    const control = new LandZoomControl()
    const container = control.onAdd(makeFakeMap() as never)
    const button = container.querySelector('button')!
    button.dispatchEvent(new Event('mouseover'))
    expect(button.style.background).toBe('rgb(17, 17, 17)') // #111
    button.dispatchEvent(new Event('mouseout'))
    expect(button.style.background).toBe('rgb(0, 0, 0)') // #000
  })

  it('removes its container on onRemove', () => {
    const control = new LandZoomControl()
    const container = control.onAdd(makeFakeMap() as never)
    document.body.appendChild(container)
    control.onRemove()
    expect(document.body.contains(container)).toBe(false)
  })
})
