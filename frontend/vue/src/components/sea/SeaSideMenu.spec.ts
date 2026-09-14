import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaSideMenu from './SeaSideMenu.vue'
import { useAppStore } from '@/stores/app'
import type { SeaFilterCategory } from '@/utils/aisShipType'

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    goToLocation: vi.fn(),
    toggleLabels: vi.fn(),
    toggleRangeRings: vi.fn(),
    toggleFerryRoutes: vi.fn(),
    setFilterCategory: vi.fn(),
    filterCategory: 'all' as SeaFilterCategory,
    labelsActive: true,
    rangeRingsActive: false,
    ferryRoutesActive: false,
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
    expect(names.slice(0, 5)).toEqual([
      'Zoom in',
      'Zoom out',
      'Go to my location',
      'Filter vessels',
      'Show all vessels',
    ])
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

  it('offers one FILTER sub-button per vessel family and reports the active one', async () => {
    const { wrapper, props } = mountMenu({ filterCategory: 'tanker' })
    const modes = wrapper.findAll('[data-mode]').map((button) => button.attributes('data-mode'))
    expect(modes).toEqual(['all', 'cargo', 'tanker', 'passenger', 'fishing', 'other'])
    expect(wrapper.find('[data-mode="tanker"]').classes()).toContain('active')
    expect(wrapper.find('[data-mode="all"]').classes()).not.toContain('active')
    await wrapper.find('[aria-label="Fishing vessels only"]').trigger('click')
    expect(props.setFilterCategory).toHaveBeenCalledWith('fishing')
  })

  it('wires the MAP LAYERS buttons and reflects their active state', async () => {
    const { wrapper, props } = mountMenu({ ferryRoutesActive: true, rangeRingsActive: true })
    await wrapper.find('[aria-label="Vessel labels"]').trigger('click')
    await wrapper.find('[aria-label="Range ring"]').trigger('click')
    await wrapper.find('[aria-label="Ferry routes"]').trigger('click')
    expect(props.toggleLabels).toHaveBeenCalledOnce()
    expect(props.toggleRangeRings).toHaveBeenCalledOnce()
    expect(props.toggleFerryRoutes).toHaveBeenCalledOnce()
    expect(wrapper.find('[aria-label="Ferry routes"]').classes()).toContain('active')
    expect(wrapper.find('[aria-label="Range ring"]').classes()).toContain('active')
  })

  it('shows toggles as inactive when off, and offers no vessels or place-names toggle', () => {
    const { wrapper } = mountMenu({
      labelsActive: false,
      locationActive: true,
    })
    // Live vessels and place names are always on at sea: FILTER narrows the
    // vessels, and nothing on the rail can hide the names.
    expect(wrapper.find('[aria-label="Live vessels"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Location names"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Vessel labels"]').classes()).not.toContain('active')
    expect(wrapper.find('[aria-label="Go to my location"]').classes()).toContain('active')
  })

  it('expands and collapses each accordion', async () => {
    const { wrapper } = mountMenu()
    const filter = wrapper.find('[aria-label="Filter vessels"]')
    const layers = wrapper.find('[aria-label="Map layers"]')
    expect(filter.attributes('aria-controls')).toBe('sea-filter-mode-flyout')
    expect(layers.attributes('aria-controls')).toBe('sea-layers-panel')
    expect(panelDisplay(wrapper, '#sea-filter-mode-flyout')).toBe('none')
    await filter.trigger('click')
    expect(filter.attributes('aria-expanded')).toBe('true')
    expect(panelDisplay(wrapper, '#sea-filter-mode-flyout')).not.toBe('none')
    await layers.trigger('click')
    expect(layers.attributes('aria-expanded')).toBe('true')
    await filter.trigger('click')
    expect(filter.attributes('aria-expanded')).toBe('false')
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
    await wrapper.find('[aria-label="Filter vessels"]').trigger('click')
    await wrapper.find('[aria-label="Map layers"]').trigger('click')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
