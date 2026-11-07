import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import MapSideRail from './MapSideRail.vue'

const LAYERS_BUTTON = '#test-layers-btn'

function mountRail(locationActive = false): VueWrapper {
  return mount(MapSideRail, {
    props: {
      containerId: 'test-side-menu',
      accessibleName: 'Test map controls',
      layersButtonId: 'test-layers-btn',
      layersPanelId: 'test-layers-panel',
      locationActive,
    },
    slots: { layers: '<button class="an-overlay">Overlay</button>' },
  })
}

function button(wrapper: VueWrapper, name: string) {
  return wrapper.get(`button[aria-label="${name}"]`)
}

describe('MapSideRail', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is a named landmark with the id its section addresses', () => {
    const rail = mountRail().get('nav')

    expect(rail.attributes('id')).toBe('test-side-menu')
    expect(rail.attributes('aria-label')).toBe('Test map controls')
    expect(rail.classes()).toContain('map-side-rail')
  })

  it('lists zoom, location and map layers in order, each with a tooltip', () => {
    const buttons = mountRail().findAll('button').slice(0, 4)

    expect(buttons.map((item) => item.attributes('aria-label'))).toEqual([
      'Zoom in',
      'Zoom out',
      'Go to my location',
      'Map layers',
    ])
    expect(buttons.map((item) => item.attributes('data-tooltip'))).toEqual([
      'ZOOM IN',
      'ZOOM OUT',
      'GO TO MY LOCATION',
      'MAP LAYERS',
    ])
  })

  it.each([
    ['Zoom in', 'zoom-in'],
    ['Zoom out', 'zoom-out'],
    ['Go to my location', 'go-to-location'],
  ])('%s tells the section, once', async (name, event) => {
    const wrapper = mountRail()

    await button(wrapper, name).trigger('click')

    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(Object.keys(wrapper.emitted())).not.toContain(
      event === 'zoom-in' ? 'zoom-out' : 'zoom-in',
    )
  })

  it('shows the location button as active only when a location is known', () => {
    expect(button(mountRail(false), 'Go to my location').classes()).not.toContain('active')
    expect(button(mountRail(true), 'Go to my location').classes()).toContain('active')
  })

  it('ties the layers button to its panel, closed at first', () => {
    const layers = mountRail().get(LAYERS_BUTTON)

    expect(layers.attributes('aria-controls')).toBe('test-layers-panel')
    expect(layers.attributes('aria-expanded')).toBe('false')
    expect(layers.classes()).not.toContain('active')
  })

  it('opens the panel holding the section’s overlays, and closes it again', async () => {
    const wrapper = mountRail()
    const layers = wrapper.get(LAYERS_BUTTON)

    await layers.trigger('click')
    expect(layers.attributes('aria-expanded')).toBe('true')
    expect(layers.classes()).toContain('active')
    expect(wrapper.get('#test-layers-panel').find('.an-overlay').exists()).toBe(true)

    await layers.trigger('click')
    expect(layers.attributes('aria-expanded')).toBe('false')
  })

  it('collapses when the app says the side menu is closed', async () => {
    const wrapper = mountRail()
    expect(wrapper.get('nav').classes()).not.toContain('icon-rail--collapsed')

    useAppStore().sideMenuOpen = false
    await wrapper.vm.$nextTick()

    expect(wrapper.get('nav').classes()).toContain('icon-rail--collapsed')
  })

  it('has no axe violations with its panel open', async () => {
    const wrapper = mountRail(true)
    await wrapper.get(LAYERS_BUTTON).trigger('click')

    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
