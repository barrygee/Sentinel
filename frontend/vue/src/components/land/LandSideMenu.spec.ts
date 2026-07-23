import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandSideMenu from './LandSideMenu.vue'

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    goToLocation: vi.fn(),
    toggleRangeRings: vi.fn(),
    toggleAprs: vi.fn(),
    rangeRingsActive: false,
    aprsActive: true,
    locationActive: false,
    ...overrides,
  }
}

function mountMenu(overrides: Record<string, unknown> = {}) {
  const props = makeProps(overrides)
  const wrapper = mount(LandSideMenu, { props })
  return { wrapper, props }
}

describe('LandSideMenu', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the five map controls with accessible names', () => {
    const { wrapper } = mountMenu()
    for (const name of [
      'Zoom in',
      'Zoom out',
      'Go to my location',
      'Range rings',
      'APRS stations',
    ]) {
      expect(wrapper.find(`[aria-label="${name}"]`).exists()).toBe(true)
    }
  })

  it('is a right-edge rail landmark', () => {
    const { wrapper } = mountMenu()
    const rail = wrapper.find('#land-side-menu')
    expect(rail.exists()).toBe(true)
    expect(rail.attributes('aria-label')).toBe('Land map controls')
  })

  it('wires each button to its handler', async () => {
    const { wrapper, props } = mountMenu()
    await wrapper.find('[aria-label="Zoom in"]').trigger('click')
    expect(props.zoomIn).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="Zoom out"]').trigger('click')
    expect(props.zoomOut).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="Go to my location"]').trigger('click')
    expect(props.goToLocation).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="Range rings"]').trigger('click')
    expect(props.toggleRangeRings).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="APRS stations"]').trigger('click')
    expect(props.toggleAprs).toHaveBeenCalledOnce()
  })

  it('reflects the active (green) state of each toggle', () => {
    const { wrapper } = mountMenu({
      rangeRingsActive: true,
      aprsActive: true,
      locationActive: true,
    })
    expect(wrapper.find('[aria-label="Range rings"]').classes()).toContain('active')
    expect(wrapper.find('[aria-label="APRS stations"]').classes()).toContain('active')
    expect(wrapper.find('[aria-label="Go to my location"]').classes()).toContain('active')
  })

  it('shows toggles as inactive when off', () => {
    const { wrapper } = mountMenu({
      rangeRingsActive: false,
      aprsActive: false,
      locationActive: false,
    })
    expect(wrapper.find('[aria-label="Range rings"]').classes()).not.toContain('active')
    expect(wrapper.find('[aria-label="APRS stations"]').classes()).not.toContain('active')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = mountMenu()
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
