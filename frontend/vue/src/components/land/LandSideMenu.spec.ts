import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandSideMenu from './LandSideMenu.vue'
import { useAppStore } from '@/stores/app'
import { useBasemapStore } from '@/stores/basemap'

/**
 * The rail now holds map navigation and annotation only: the data layers (APRS,
 * traffic cameras, repeaters) moved to the left sidebar's FILTER sub-tabs and
 * Settings › LAND › Map Layers, and LOCATION NAMES moved to Settings, so the
 * props for those toggles are gone with them.
 */
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
  const wrapper = mount(LandSideMenu, { props })
  return { wrapper, props }
}

/**
 * The accordion panel is shown/hidden with `v-show`, which writes `display`
 * straight onto the element. Reading that inline value is checked rather than
 * VTU's `isVisible()`, whose `getComputedStyle` cascade is unreliable in jsdom
 * once the scoped `display: flex` rule for the panel is in the document.
 */
function panelDisplay(wrapper: ReturnType<typeof mountMenu>['wrapper'], panelId: string): string {
  return (wrapper.find(panelId).element as HTMLElement).style.display
}

describe('LandSideMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders every map control with an accessible name', () => {
    const { wrapper } = mountMenu()
    for (const name of [
      'Zoom in',
      'Zoom out',
      'Go to my location',
      'Map layers',
      'Range rings',
      'Terrain relief and contour lines',
    ]) {
      expect(wrapper.find(`[aria-label="${name}"]`).exists()).toBe(true)
    }
  })

  // The data-layer buttons were deliberately removed from the rail; assert they
  // are gone so nobody quietly re-adds a second way to switch a layer.
  it('no longer offers the data layers or place names on the rail', () => {
    const { wrapper } = mountMenu()
    for (const name of [
      'Filter stations',
      'APRS stations',
      'Traffic cameras',
      'Location name labels',
    ]) {
      expect(wrapper.find(`[aria-label="${name}"]`).exists()).toBe(false)
    }
  })

  it('is a right-edge rail landmark', () => {
    const { wrapper } = mountMenu()
    const rail = wrapper.find('#land-side-menu')
    expect(rail.exists()).toBe(true)
    expect(rail.attributes('aria-label')).toBe('Land map controls')
  })

  it('orders the rail to match the Air and Space maps', () => {
    const { wrapper } = mountMenu()
    // Only the rail's own buttons, not the ones inside the accordion panel.
    const railLabels = wrapper
      .findAll('#land-side-menu > button')
      .map((button) => button.attributes('aria-label'))
    expect(railLabels).toEqual(['Zoom in', 'Zoom out', 'Go to my location', 'Map layers'])
  })

  it('wires each rail button to its handler', async () => {
    const { wrapper, props } = mountMenu()
    await wrapper.find('[aria-label="Zoom in"]').trigger('click')
    expect(props.zoomIn).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="Zoom out"]').trigger('click')
    expect(props.zoomOut).toHaveBeenCalledOnce()
    await wrapper.find('[aria-label="Go to my location"]').trigger('click')
    expect(props.goToLocation).toHaveBeenCalledOnce()
  })

  it('wires the range-rings panel button to its handler', async () => {
    const { wrapper, props } = mountMenu()
    await wrapper.find('[aria-label="Range rings"]').trigger('click')
    expect(props.toggleRangeRings).toHaveBeenCalledOnce()
  })

  it('reflects the active (green) state of each prop-driven toggle', () => {
    const { wrapper } = mountMenu({ rangeRingsActive: true, locationActive: true })
    expect(wrapper.find('[aria-label="Range rings"]').classes()).toContain('active')
    expect(wrapper.find('[aria-label="Go to my location"]').classes()).toContain('active')
  })

  it('shows prop-driven toggles as inactive when off', () => {
    const { wrapper } = mountMenu({ rangeRingsActive: false, locationActive: false })
    expect(wrapper.find('[aria-label="Range rings"]').classes()).not.toContain('active')
    expect(wrapper.find('[aria-label="Go to my location"]').classes()).not.toContain('active')
  })

  it('collapses the rail with the app-wide side-menu switch', async () => {
    const appStore = useAppStore()
    const { wrapper } = mountMenu()
    const rail = wrapper.find('#land-side-menu')
    expect(rail.classes()).not.toContain('icon-rail--collapsed')

    appStore.sideMenuOpen = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#land-side-menu').classes()).toContain('icon-rail--collapsed')
  })

  it('toggles the shared terrain layer on the basemap store and reflects it, disabled without tiles', async () => {
    const basemapStore = useBasemapStore()
    const { wrapper } = mountMenu()
    const terrain = () => wrapper.find('[aria-label="Terrain relief and contour lines"]')
    expect(terrain().classes()).not.toContain('active')
    expect(terrain().attributes('disabled')).toBeUndefined()
    expect(terrain().attributes('data-tooltip')).toBe('TERRAIN')

    await terrain().trigger('click')
    expect(basemapStore.layers.terrain).toBe(true)
    expect(terrain().classes()).toContain('active')
    await terrain().trigger('click')
    expect(basemapStore.layers.terrain).toBe(false)

    // The first map to open a missing archive marks it unavailable on the
    // store; every rail then greys the button out and says why.
    basemapStore.setTerrainAvailable(false)
    await wrapper.vm.$nextTick()
    expect(terrain().attributes('disabled')).toBeDefined()
    expect(terrain().attributes('data-tooltip')).toBe('TERRAIN — TILES NOT INSTALLED')
  })

  it('reads the terrain active state straight off the shared basemap store', async () => {
    const basemapStore = useBasemapStore()
    const { wrapper } = mountMenu()
    const terrain = () => wrapper.find('[aria-label="Terrain relief and contour lines"]')
    expect(terrain().classes()).not.toContain('active')

    // A change made on another map (or restored from storage) lights it up here
    // without LandView passing anything down.
    basemapStore.setLayer('terrain', true)
    await wrapper.vm.$nextTick()
    expect(terrain().classes()).toContain('active')
  })
})

describe('LandSideMenu accordion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts with the MAP LAYERS panel collapsed', () => {
    const { wrapper } = mountMenu()
    expect(wrapper.find('[aria-label="Map layers"]').attributes('aria-expanded')).toBe('false')
    expect(panelDisplay(wrapper, '#land-layers-panel')).toBe('none')
  })

  it('expands and collapses the MAP LAYERS panel on click', async () => {
    const { wrapper } = mountMenu()
    const trigger = wrapper.find('[aria-label="Map layers"]')
    expect(trigger.attributes('aria-controls')).toBe('land-layers-panel')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.classes()).toContain('active')
    expect(panelDisplay(wrapper, '#land-layers-panel')).not.toBe('none')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.classes()).not.toContain('active')
    expect(panelDisplay(wrapper, '#land-layers-panel')).toBe('none')
  })

  it('puts range rings above terrain in the LAYERS panel', () => {
    const { wrapper } = mountMenu()
    const labels = wrapper
      .findAll('#land-layers-panel button')
      .map((button) => button.attributes('aria-label'))
    expect(labels).toEqual(['Range rings', 'Terrain relief and contour lines'])
  })
})

describe('LandSideMenu accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('has no accessibility violations while collapsed', async () => {
    const { wrapper } = mountMenu()
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })

  it('has no accessibility violations with the panel expanded', async () => {
    const { wrapper } = mountMenu()
    await wrapper.find('[aria-label="Map layers"]').trigger('click')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })

  it('keeps the terrain button operable from the keyboard', async () => {
    const basemapStore = useBasemapStore()
    const { wrapper } = mountMenu()
    await wrapper.find('[aria-label="Map layers"]').trigger('click')
    const terrain = wrapper.find('[aria-label="Terrain relief and contour lines"]')
    // A real <button>, so Enter/Space activate it — assert the native element
    // rather than simulating the browser's own click synthesis.
    expect(terrain.element.tagName).toBe('BUTTON')
    await terrain.trigger('keydown.enter')
    await terrain.trigger('click')
    expect(basemapStore.layers.terrain).toBe(true)
  })
})
