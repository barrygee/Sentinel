import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaSideMenu from './SeaSideMenu.vue'
import { useAppStore } from '@/stores/app'

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    goToLocation: vi.fn(),
    toggleRangeRings: vi.fn(),
    rangeRingsActive: false,
    locationActive: false,
    ...overrides,
  }
}

function mountMenu(overrides: Record<string, unknown> = {}) {
  const props = makeProps(overrides)
  const wrapper = mount(SeaSideMenu, { props })
  return { wrapper, props }
}

/** `v-show` writes `display` straight onto the panel element. */
function panelDisplay(wrapper: ReturnType<typeof mountMenu>['wrapper'], panelId: string): string {
  return (wrapper.find(panelId).element as HTMLElement).style.display
}

describe('SeaSideMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('is the right-edge rail landmark, in the Air map order', () => {
    const { wrapper } = mountMenu()
    const rail = wrapper.find('#sea-side-menu')
    expect(rail.attributes('aria-label')).toBe('Sea map controls')
    const names = wrapper.findAll('button').map((button) => button.attributes('aria-label'))
    expect(names.slice(0, 4)).toEqual(['Zoom in', 'Zoom out', 'Go to my location', 'Map layers'])
    // The vessel FILTER categories live on the left sidebar only.
    expect(names).not.toContain('Filter vessels')
    expect(wrapper.find('[data-mode]').exists()).toBe(false)
  })

  it('wires the rail buttons to their handlers', async () => {
    const { wrapper, props } = mountMenu()
    await wrapper.find('[aria-label="Zoom in"]').trigger('click')
    await wrapper.find('[aria-label="Zoom out"]').trigger('click')
    await wrapper.find('[aria-label="Go to my location"]').trigger('click')
    expect(props.zoomIn).toHaveBeenCalledOnce()
    expect(props.zoomOut).toHaveBeenCalledOnce()
    expect(props.goToLocation).toHaveBeenCalledOnce()
  })

  it('offers only the range ring under MAP LAYERS, wired and reflecting its state', async () => {
    const { wrapper, props } = mountMenu({ rangeRingsActive: true, locationActive: true })
    await wrapper.find('[aria-label="Range ring"]').trigger('click')
    expect(props.toggleRangeRings).toHaveBeenCalledOnce()
    expect(wrapper.find('[aria-label="Range ring"]').classes()).toContain('active')
    expect(wrapper.find('[aria-label="Go to my location"]').classes()).toContain('active')
    // Vessel labels, ferry routes and ports are set in Settings > SEA > Map
    // Layers; live vessels and place names are always on at sea.
    for (const name of [
      'Vessel labels',
      'Ferry routes',
      'Port markers',
      'Ports',
      'Live vessels',
      'Location names',
    ]) {
      expect(wrapper.find(`[aria-label="${name}"]`).exists()).toBe(false)
    }
    expect(wrapper.findAll('#sea-layers-panel button')).toHaveLength(1)
  })

  it('shows the range ring as inactive when off', () => {
    const { wrapper } = mountMenu({ rangeRingsActive: false })
    expect(wrapper.find('[aria-label="Range ring"]').classes()).not.toContain('active')
  })

  it('expands and collapses the layers accordion', async () => {
    const { wrapper } = mountMenu()
    const layers = wrapper.find('[aria-label="Map layers"]')
    expect(layers.attributes('aria-controls')).toBe('sea-layers-panel')
    expect(panelDisplay(wrapper, '#sea-layers-panel')).toBe('none')
    await layers.trigger('click')
    expect(layers.attributes('aria-expanded')).toBe('true')
    expect(panelDisplay(wrapper, '#sea-layers-panel')).not.toBe('none')
    await layers.trigger('click')
    expect(layers.attributes('aria-expanded')).toBe('false')
    expect(panelDisplay(wrapper, '#sea-layers-panel')).toBe('none')
  })

  it('collapses with the app-wide side-menu flag', async () => {
    const { wrapper } = mountMenu()
    expect(wrapper.find('#sea-side-menu').classes()).not.toContain('icon-rail--collapsed')
    useAppStore().sideMenuOpen = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sea-side-menu').classes()).toContain('icon-rail--collapsed')
  })

  it('has no accessibility violations, collapsed and expanded', async () => {
    const { wrapper } = mountMenu()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    await wrapper.find('[aria-label="Map layers"]').trigger('click')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
