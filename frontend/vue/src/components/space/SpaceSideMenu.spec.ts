import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

// useUserLocation is mocked so tests drive the location-active state directly.
const shared = vi.hoisted(() => ({
  locationRef: null as { value: { lon: number; lat: number } | null } | null,
}))

vi.mock('@/composables/useUserLocation', async () => {
  const { ref } = await import('vue')
  const location = ref<{ lon: number; lat: number } | null>(null)
  shared.locationRef = location as unknown as { value: { lon: number; lat: number } | null }
  return { useUserLocation: () => ({ location }) }
})

import SpaceSideMenu from './SpaceSideMenu.vue'
import { useSpaceStore } from '@/stores/space'

// Map-control stubs the menu delegates to.
function makeControls() {
  return {
    map: { zoomIn: vi.fn(), zoomOut: vi.fn() },
    satellite: { toggleTrack: vi.fn(), toggleFootprint: vi.fn() },
    daynight: { toggleDaynight: vi.fn() },
    names: { handleClickPublic: vi.fn() },
  }
}

// Build a SpaceMap-like proxy. `getMap` can be forced to null to exercise the
// inner optional-chaining branch on the zoom buttons.
function makeMapProxy(controls: ReturnType<typeof makeControls>, mapPresent = true) {
  return {
    current: {
      getMap: () => (mapPresent ? controls.map : null),
      getSatelliteControl: () => controls.satellite,
      getDaynightControl: () => controls.daynight,
      getNamesControl: () => controls.names,
    },
  }
}

function mountMenu(mapRef: unknown) {
  // The real prop type is the markRaw SpaceMap proxy; the stubs above stand in
  // for it, so cast through the component's expected prop shape.
  return mount(SpaceSideMenu, {
    props: { mapRef } as unknown as InstanceType<typeof SpaceSideMenu>['$props'],
  })
}

let spaceStore: ReturnType<typeof useSpaceStore>

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  spaceStore = useSpaceStore()
  if (shared.locationRef) shared.locationRef.value = null
  localStorage.clear()
})

describe('SpaceSideMenu expand/collapse', () => {
  it('reflects the persisted expanded state and toggles it on click', async () => {
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    const root = wrapper.find('#space-side-menu')
    expect(root.classes()).not.toContain('expanded')

    await wrapper.find('#space-side-menu-toggle').trigger('click')
    expect(spaceStore.sideMenuExpanded).toBe(true)
    expect(wrapper.find('#space-side-menu').classes()).toContain('expanded')

    await wrapper.find('#space-side-menu-toggle').trigger('click')
    expect(spaceStore.sideMenuExpanded).toBe(false)
  })

  it('shows the collapse glyph and tooltip when already expanded', () => {
    spaceStore.sideMenuExpanded = true
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    const toggle = wrapper.find('#space-side-menu-toggle')
    expect(toggle.text()).toBe('›')
    expect(toggle.attributes('data-tooltip')).toBe('COLLAPSE MENU')
  })
})

describe('SpaceSideMenu zoom buttons', () => {
  it('zooms the map in and out via the live map instance', async () => {
    const controls = makeControls()
    const wrapper = mountMenu(makeMapProxy(controls))
    await wrapper.find('button[title="Zoom in"]').trigger('click')
    await wrapper.find('button[title="Zoom out"]').trigger('click')
    expect(controls.map.zoomIn).toHaveBeenCalledTimes(1)
    expect(controls.map.zoomOut).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when the map instance is not yet available', async () => {
    const controls = makeControls()
    const wrapper = mountMenu(makeMapProxy(controls, false))
    await wrapper.find('button[title="Zoom in"]').trigger('click')
    expect(controls.map.zoomIn).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no map ref at all', async () => {
    const wrapper = mountMenu({ current: null })
    await expect(wrapper.find('button[title="Zoom in"]').trigger('click')).resolves.toBeUndefined()
  })
})

describe('SpaceSideMenu location button', () => {
  it('is inactive without a fix and active with one', async () => {
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    const button = wrapper.find('button[title="Go to my location"]')
    expect(button.classes()).not.toContain('active')

    shared.locationRef!.value = { lon: 1, lat: 2 }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button[title="Go to my location"]').classes()).toContain('active')
  })

  it('dispatches space-go-to-location when clicked', async () => {
    const handler = vi.fn()
    document.addEventListener('space-go-to-location', handler)
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    await wrapper.find('button[title="Go to my location"]').trigger('click')
    expect(handler).toHaveBeenCalledTimes(1)
    document.removeEventListener('space-go-to-location', handler)
  })
})

describe('SpaceSideMenu overlay toggles', () => {
  it('delegates ground-track, footprint, day/night and locations to their controls', async () => {
    const controls = makeControls()
    spaceStore.sideMenuExpanded = true // reveal the iss + daynight groups
    const wrapper = mountMenu(makeMapProxy(controls))

    await wrapper.find('button[data-tooltip="GROUND TRACK"]').trigger('click')
    await wrapper.find('button[data-tooltip="FOOTPRINT"]').trigger('click')
    await wrapper.find('button[data-tooltip="DAY / NIGHT"]').trigger('click')
    await wrapper.find('button[data-tooltip="LOCATIONS"]').trigger('click')

    expect(controls.satellite.toggleTrack).toHaveBeenCalledTimes(1)
    expect(controls.satellite.toggleFootprint).toHaveBeenCalledTimes(1)
    expect(controls.daynight.toggleDaynight).toHaveBeenCalledTimes(1)
    expect(controls.names.handleClickPublic).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for every overlay toggle when no map ref is present', async () => {
    spaceStore.sideMenuExpanded = true
    const wrapper = mountMenu({ current: null })
    await wrapper.find('button[data-tooltip="GROUND TRACK"]').trigger('click')
    await wrapper.find('button[data-tooltip="FOOTPRINT"]').trigger('click')
    await wrapper.find('button[data-tooltip="DAY / NIGHT"]').trigger('click')
    await expect(
      wrapper.find('button[data-tooltip="LOCATIONS"]').trigger('click'),
    ).resolves.toBeUndefined()
  })

  it('reflects each overlay active state from the store', () => {
    spaceStore.sideMenuExpanded = true
    spaceStore.overlayStates.groundTrack = true
    spaceStore.overlayStates.footprint = false
    spaceStore.overlayStates.daynight = true
    spaceStore.overlayStates.names = false
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    expect(wrapper.find('button[data-tooltip="GROUND TRACK"]').classes()).toContain('active')
    expect(wrapper.find('button[data-tooltip="FOOTPRINT"]').classes()).not.toContain('active')
    expect(wrapper.find('button[data-tooltip="DAY / NIGHT"]').classes()).toContain('active')
    expect(wrapper.find('button[data-tooltip="LOCATIONS"]').classes()).not.toContain('active')
  })
})

describe('SpaceSideMenu search', () => {
  it('dispatches open-space-search when the search button is clicked', async () => {
    const handler = vi.fn()
    document.addEventListener('open-space-search', handler)
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    await wrapper.find('#ssm-filter-btn').trigger('click')
    expect(handler).toHaveBeenCalledTimes(1)
    document.removeEventListener('open-space-search', handler)
  })
})

describe('SpaceSideMenu accessibility', () => {
  it('has no axe violations when expanded', async () => {
    spaceStore.sideMenuExpanded = true
    const wrapper = mountMenu(makeMapProxy(makeControls()))
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
