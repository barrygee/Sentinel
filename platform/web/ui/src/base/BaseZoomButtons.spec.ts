import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseZoomButtons from './BaseZoomButtons.vue'

describe('BaseZoomButtons', () => {
  it('renders a named group of Zoom in then Zoom out, with rail tooltips', () => {
    const wrapper = mount(BaseZoomButtons)
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
    expect(mount(BaseZoomButtons).classes()).toContain('theme-dark')
  })

  it('passes a class from its parent through to its root', () => {
    const wrapper = mount(BaseZoomButtons, { attrs: { class: 'placed-by-parent' } })
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['base-zoom-buttons', 'placed-by-parent']),
    )
  })

  it('emits zoom-in for + and zoom-out for −, and nothing else', async () => {
    const wrapper = mount(BaseZoomButtons)
    const [zoomInButton, zoomOutButton] = wrapper.findAll('button')
    await zoomInButton!.trigger('click')
    expect(wrapper.emitted('zoom-in')).toHaveLength(1)
    expect(wrapper.emitted('zoom-out')).toBeUndefined()
    await zoomOutButton!.trigger('click')
    expect(wrapper.emitted('zoom-out')).toHaveLength(1)
    expect(wrapper.emitted('zoom-in')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(BaseZoomButtons)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
