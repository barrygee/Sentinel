/* eslint-disable vue/one-component-per-file, vue/require-prop-types -- this spec
   defines tiny stub components (with untyped capture props) to stand in for
   SeaView's children. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { axe } from 'jest-axe'

// User location: a controllable ref.
const locationState = vi.hoisted(() => ({
  location: null as null | { value: { lat: number; lon: number } | null },
}))
vi.mock('@/composables/useUserLocation', async () => {
  const { ref: vueRef } = await import('vue')
  locationState.location = vueRef(null)
  return { useUserLocation: () => ({ location: locationState.location, start: vi.fn() }) }
})

// SeaMap is stubbed: it has its own spec. The stub exposes the same handles
// SeaView reaches for, over a fake map.
const mapSpies = vi.hoisted(() => ({
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  flyTo: vi.fn(),
  getZoom: vi.fn(() => 6),
  selectByMmsi: vi.fn(),
  mapPresent: true,
}))
const SeaMapStub = defineComponent({
  name: 'SeaMap',
  setup(_props, { expose }) {
    expose({
      getMap: () =>
        mapSpies.mapPresent
          ? {
              zoomIn: mapSpies.zoomIn,
              zoomOut: mapSpies.zoomOut,
              flyTo: mapSpies.flyTo,
              getZoom: mapSpies.getZoom,
            }
          : null,
      getVesselsControl: () => ({ selectByMmsi: mapSpies.selectByMmsi }),
    })
    return () => h('div', { class: 'sea-map-stub' })
  },
})

// Capture the props SeaView passes to the side menu so the handlers can be
// invoked and the active-state props asserted.
let sideMenuProps: Record<string, unknown> | null = null
const SeaSideMenuStub = defineComponent({
  name: 'SeaSideMenu',
  props: [
    'zoomIn',
    'zoomOut',
    'goToLocation',
    'toggleLabels',
    'toggleRangeRings',
    'toggleFerryRoutes',
    'togglePorts',
    'setFilterCategory',
    'filterCategory',
    'labelsActive',
    'rangeRingsActive',
    'ferryRoutesActive',
    'portsActive',
    'locationActive',
  ],
  setup(props) {
    sideMenuProps = props as unknown as Record<string, unknown>
    return () => h('nav', { class: 'sea-side-menu-stub', 'aria-label': 'Sea map controls' })
  },
})

let filterEmit: null | ((event: 'locate', mmsi: string) => void) = null
const SeaFilterStub = defineComponent({
  name: 'SeaFilter',
  emits: ['locate'],
  setup(_props, { emit }) {
    filterEmit = emit as (event: 'locate', mmsi: string) => void
    return () => h('div', { class: 'sea-filter-stub' })
  },
})
const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

import SeaView from './SeaView.vue'
import { useSeaStore } from '@/stores/sea'

/** Stand in for the sidebar pane MapSidebar owns, which SeaView teleports into. */
function teleportTarget(): void {
  const searchPane = document.createElement('div')
  searchPane.id = 'msb-pane-search'
  document.body.append(searchPane)
}

function mountView() {
  return mount(SeaView, {
    attachTo: document.body,
    global: {
      stubs: {
        SeaMap: SeaMapStub,
        SeaSideMenu: SeaSideMenuStub,
        SeaFilter: SeaFilterStub,
        SeaSourceNotice: InertStub,
        NoUrlOverlay: InertStub,
      },
    },
  })
}

enableAutoUnmount(afterEach)

describe('SeaView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    mapSpies.mapPresent = true
    sideMenuProps = null
    filterEmit = null
    if (locationState.location) locationState.location.value = null
    document.body.innerHTML = ''
  })

  it('composes the map, rail, overlays and the teleported filter pane', () => {
    teleportTarget()
    const wrapper = mountView()
    expect(wrapper.find('#map-wrap').attributes('data-domain')).toBe('sea')
    expect(wrapper.find('.sea-map-stub').exists()).toBe(true)
    expect(wrapper.find('.sea-side-menu-stub').exists()).toBe(true)
    expect(document.querySelector('#msb-pane-search .sea-filter-stub')).not.toBeNull()
  })

  it('leaves the filter pane unmounted while the sidebar target is absent', () => {
    mountView()
    expect(document.querySelector('.sea-filter-stub')).toBeNull()
  })

  it('drives the map from the rail handlers', () => {
    teleportTarget()
    mountView()
    const props = sideMenuProps as Record<string, () => void>
    props.zoomIn!()
    props.zoomOut!()
    expect(mapSpies.zoomIn).toHaveBeenCalledOnce()
    expect(mapSpies.zoomOut).toHaveBeenCalledOnce()
    // Without a map yet, zooming is a harmless no-op.
    mapSpies.mapPresent = false
    expect(() => props.zoomIn!()).not.toThrow()
  })

  it('flies to the operator only once a fix exists, never below the locate zoom', () => {
    teleportTarget()
    mountView()
    const props = sideMenuProps as Record<string, () => void>
    props.goToLocation!()
    expect(mapSpies.flyTo).not.toHaveBeenCalled()
    locationState.location!.value = { lat: 51, lon: 1 }
    props.goToLocation!()
    expect(mapSpies.flyTo).toHaveBeenCalledWith({ center: [1, 51], zoom: 10, duration: 800 })
    mapSpies.getZoom.mockReturnValueOnce(13)
    props.goToLocation!()
    expect(mapSpies.flyTo).toHaveBeenLastCalledWith({ center: [1, 51], zoom: 13, duration: 800 })
  })

  it('every overlay toggle writes the store, which the rail reads back', async () => {
    teleportTarget()
    mountView()
    const store = useSeaStore()
    const props = sideMenuProps as Record<string, unknown>
    expect(props.labelsActive).toBe(true)
    expect(props.rangeRingsActive).toBe(false)
    expect(props.ferryRoutesActive).toBe(true)
    expect(props.portsActive).toBe(true)
    expect(props.filterCategory).toBe('all')
    ;(props.toggleLabels as () => void)()
    ;(props.toggleRangeRings as () => void)()
    ;(props.toggleFerryRoutes as () => void)()
    ;(props.togglePorts as () => void)()
    ;(props.setFilterCategory as (category: string) => void)('cargo')
    await nextTick()
    expect(store.overlayStates).toEqual({
      vessels: true,
      vesselLabels: false,
      rangeRings: true,
      ferryRoutes: false,
      ports: false,
    })
    expect(store.seaFilterCategory).toBe('cargo')
    expect(sideMenuProps!.labelsActive).toBe(false)
    expect(sideMenuProps!.portsActive).toBe(false)
    expect(sideMenuProps!.filterCategory).toBe('cargo')
  })

  it('reports whether a location fix exists', async () => {
    teleportTarget()
    mountView()
    expect(sideMenuProps!.locationActive).toBe(false)
    locationState.location!.value = { lat: 51, lon: 1 }
    await nextTick()
    expect(sideMenuProps!.locationActive).toBe(true)
  })

  it('SHOW ON MAP from the pane selects the vessel and flies to it', () => {
    teleportTarget()
    mountView()
    filterEmit!('locate', '232012345')
    expect(mapSpies.selectByMmsi).toHaveBeenCalledWith('232012345', { flyTo: true })
  })

  it('has one screen-reader heading and no accessibility violations', async () => {
    teleportTarget()
    const wrapper = mountView()
    await flushPromises()
    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Sea — live vessel tracking')
    expect(headings[0]!.classes()).toContain('sr-only')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
