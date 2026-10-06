import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import MapZoomButtons from './MapZoomButtons.vue'

describe('MapZoomButtons', () => {
  it('renders a named group of Zoom in then Zoom out, with rail tooltips', () => {
    const wrapper = mount(MapZoomButtons)
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Map zoom')
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Zoom in',
      'Zoom out',
    ])
    expect(buttons.map((button) => button.attributes('data-tooltip'))).toEqual([
      'ZOOM IN',
      'ZOOM OUT',
    ])
  })

  it('pins the dark rail palette so the buttons read on the map inside light surfaces', () => {
    expect(mount(MapZoomButtons).classes()).toContain('theme-dark')
  })

  it('passes a class from its parent through to its root', () => {
    const wrapper = mount(MapZoomButtons, { attrs: { class: 'placed-by-parent' } })
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['map-zoom-buttons', 'placed-by-parent']),
    )
  })

  it('emits zoom-in for + and zoom-out for −, and nothing else', async () => {
    const wrapper = mount(MapZoomButtons)
    const [zoomInButton, zoomOutButton] = wrapper.findAll('button')
    await zoomInButton!.trigger('click')
    expect(wrapper.emitted('zoom-in')).toHaveLength(1)
    expect(wrapper.emitted('zoom-out')).toBeUndefined()
    await zoomOutButton!.trigger('click')
    expect(wrapper.emitted('zoom-out')).toHaveLength(1)
    expect(wrapper.emitted('zoom-in')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapZoomButtons)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
