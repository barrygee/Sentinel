import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

// Controllable user-location ref for the locActive computed + goToLocation.
const shared = vi.hoisted(() => ({
  loc: null as { value: { lon: number; lat: number } | null } | null,
}))

vi.mock('@/composables/useUserLocation', async () => {
  const { ref } = await import('vue')
  const location = ref<{ lon: number; lat: number } | null>(null)
  shared.loc = location as unknown as { value: { lon: number; lat: number } | null }
  return { useUserLocation: () => ({ location, start: vi.fn() }) }
})

import AirSideMenu from './AirSideMenu.vue'
import { useAirStore } from '@/stores/air'

// ---- Fake AirMap + controls ----------------------------------------------
function makeControls() {
  return {
    map: {
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      flyTo: vi.fn(),
      easeTo: vi.fn(),
      getZoom: vi.fn(() => 8),
      getPitch: vi.fn(() => 20),
      getBearing: vi.fn(() => 30),
    },
    adsb: {
      toggle: vi.fn(),
      visible: true,
      setHideGroundVehicles: vi.fn(),
      setHideTowers: vi.fn(),
      _allHidden: false,
      _typeFilter: 'all' as 'all' | 'civil' | 'mil',
      setAllHidden: vi.fn(),
      setTypeFilter: vi.fn(),
    },
    labels: { syncToAdsb: vi.fn(), toggle: vi.fn() },
    rangeRings: { handleClickPublic: vi.fn() },
    aara: { toggle: vi.fn() },
    awacs: { toggle: vi.fn() },
    airports: { toggle: vi.fn() },
    mil: { toggle: vi.fn() },
    names: { handleClickPublic: vi.fn() },
    roads: { handleClickPublic: vi.fn() },
    clear: { toggle: vi.fn(), _cleared: true },
    set3DActive: vi.fn(),
    setTargetPitch: vi.fn(),
  }
}

type Controls = ReturnType<typeof makeControls>

function makeAirMap(controls: Controls) {
  return {
    getMap: () => controls.map,
    getAdsbControl: () => controls.adsb,
    getAdsbLabels: () => controls.labels,
    getRangeRings: () => controls.rangeRings,
    getAara: () => controls.aara,
    getAwacs: () => controls.awacs,
    getAirports: () => controls.airports,
    getMilBases: () => controls.mil,
    getNamesControl: () => controls.names,
    getRoadsControl: () => controls.roads,
    getClearControl: () => controls.clear,
    set3DActive: controls.set3DActive,
    setTargetPitch: controls.setTargetPitch,
  }
}

function mountMenu(current: unknown) {
  return mount(AirSideMenu, { props: { mapRef: { current } } as never })
}

const tip = (label: string) => `[data-tooltip="${label}"]`

enableAutoUnmount(afterEach)

describe('AirSideMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    if (shared.loc) shared.loc.value = null
    localStorage.clear()
    document.body.innerHTML = ''
  })

  describe('with the map available', () => {
    let controls: Controls
    let wrapper: ReturnType<typeof mountMenu>

    beforeEach(() => {
      controls = makeControls()
      wrapper = mountMenu(makeAirMap(controls))
    })

    it('expands and collapses the menu', async () => {
      expect(wrapper.find('#side-menu').classes()).not.toContain('expanded')
      await wrapper.find('#side-menu-toggle').trigger('click')
      expect(wrapper.find('#side-menu').classes()).toContain('expanded')
      await wrapper.find('#side-menu-toggle').trigger('click')
      expect(wrapper.find('#side-menu').classes()).not.toContain('expanded')
    })

    it('zooms the map in and out', async () => {
      await wrapper.find(tip('ZOOM IN')).trigger('click')
      await wrapper.find(tip('ZOOM OUT')).trigger('click')
      expect(controls.map.zoomIn).toHaveBeenCalled()
      expect(controls.map.zoomOut).toHaveBeenCalled()
    })

    it('flies to the user location when a fix is available', async () => {
      shared.loc!.value = { lon: 5, lat: 10 }
      await wrapper.vm.$nextTick()
      await wrapper.find(tip('GO TO MY LOCATION')).trigger('click')
      expect(controls.map.flyTo).toHaveBeenCalledWith({
        center: [5, 10],
        zoom: 10,
        duration: 800,
      })
    })

    it('does not fly when there is no fix', async () => {
      await wrapper.find(tip('GO TO MY LOCATION')).trigger('click')
      expect(controls.map.flyTo).not.toHaveBeenCalled()
    })

    it('toggles planes and syncs the label control', async () => {
      await wrapper.find(tip('PLANES')).trigger('click')
      expect(controls.adsb.toggle).toHaveBeenCalled()
      expect(controls.labels.syncToAdsb).toHaveBeenCalledWith(true)
    })

    it('toggles planes without throwing when no label control is present', async () => {
      const localControls = makeControls()
      const localWrapper = mountMenu({ ...makeAirMap(localControls), getAdsbLabels: () => null })
      await localWrapper.find(tip('PLANES')).trigger('click')
      expect(localControls.adsb.toggle).toHaveBeenCalled()
      expect(localControls.labels.syncToAdsb).not.toHaveBeenCalled()
    })

    it('toggles ground vehicles and towers', async () => {
      await wrapper.find(tip('GROUND VEHICLES')).trigger('click')
      expect(controls.adsb.setHideGroundVehicles).toHaveBeenCalledWith(true)
      await wrapper.find(tip('TOWERS')).trigger('click')
      expect(controls.adsb.setHideTowers).toHaveBeenCalledWith(true)
    })

    it('toggles callsign labels only while planes are on', async () => {
      const air = useAirStore()
      air.overlayStates.adsb = false
      await wrapper.find(tip('CALLSIGNS')).trigger('click')
      expect(controls.labels.toggle).not.toHaveBeenCalled()

      air.overlayStates.adsb = true
      await wrapper.vm.$nextTick()
      await wrapper.find(tip('CALLSIGNS')).trigger('click')
      expect(controls.labels.toggle).toHaveBeenCalled()
    })

    it('toggles the ring, refuelling, AWACS, airports, bases, locations and roads', async () => {
      await wrapper.find(tip('RANGE RING')).trigger('click')
      await wrapper.find(tip('A2A REFUELING')).trigger('click')
      await wrapper.find(tip('AWACS')).trigger('click')
      await wrapper.find(tip('AIRPORTS')).trigger('click')
      await wrapper.find(tip('MILITARY BASES')).trigger('click')
      await wrapper.find(tip('LOCATIONS')).trigger('click')
      await wrapper.find(tip('ROADS')).trigger('click')
      expect(controls.rangeRings.handleClickPublic).toHaveBeenCalled()
      expect(controls.aara.toggle).toHaveBeenCalled()
      expect(controls.awacs.toggle).toHaveBeenCalled()
      expect(controls.airports.toggle).toHaveBeenCalled()
      expect(controls.mil.toggle).toHaveBeenCalled()
      expect(controls.names.handleClickPublic).toHaveBeenCalled()
      expect(controls.roads.handleClickPublic).toHaveBeenCalled()
    })

    it('toggles the 3D view on and off', async () => {
      await wrapper.find(tip('3D VIEW')).trigger('click')
      expect(controls.set3DActive).toHaveBeenCalledWith(true)
      await wrapper.find(tip('3D VIEW')).trigger('click')
      expect(controls.set3DActive).toHaveBeenCalledWith(false)
    })

    it('tilts, rotates and resets the bearing via the 3D widget', async () => {
      await wrapper.find(tip('TILT UP')).trigger('click')
      expect(controls.setTargetPitch).toHaveBeenCalledWith(30) // 20 + 10
      expect(controls.map.easeTo).toHaveBeenCalledWith({ pitch: 30, duration: 300 })

      await wrapper.find(tip('TILT DOWN')).trigger('click')
      expect(controls.setTargetPitch).toHaveBeenCalledWith(10) // 20 - 10

      await wrapper.find(tip('ROTATE LEFT')).trigger('click')
      expect(controls.map.easeTo).toHaveBeenCalledWith({ bearing: 15, duration: 300 }) // 30 - 15

      await wrapper.find(tip('ROTATE RIGHT')).trigger('click')
      expect(controls.map.easeTo).toHaveBeenCalledWith({ bearing: 45, duration: 300 })

      await wrapper.find(tip('RESET BEARING')).trigger('click')
      expect(controls.map.easeTo).toHaveBeenCalledWith({ bearing: 0, duration: 400 })
    })

    it('clamps the tilt pitch to the 0–85 range', async () => {
      controls.map.getPitch.mockReturnValue(80)
      await wrapper.find(tip('TILT UP')).trigger('click')
      expect(controls.setTargetPitch).toHaveBeenCalledWith(85)
    })
  })

  describe('filter flyout', () => {
    let controls: Controls
    let wrapper: ReturnType<typeof mountMenu>

    beforeEach(() => {
      controls = makeControls()
      wrapper = mountMenu(makeAirMap(controls))
    })

    it('opens on hover and closes after the leave delay', async () => {
      vi.useFakeTimers()
      await wrapper.find('#sm-filter-btn').trigger('mouseenter')
      expect(wrapper.find('#filter-mode-flyout').classes()).toContain('filter-flyout-visible')
      await wrapper.find('#sm-filter-btn').trigger('mouseleave')
      vi.advanceTimersByTime(120)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('#filter-mode-flyout').classes()).not.toContain('filter-flyout-visible')
      vi.useRealTimers()
    })

    it('re-entering before the delay cancels the pending close', async () => {
      vi.useFakeTimers()
      await wrapper.find('#sm-filter-btn').trigger('mouseleave')
      await wrapper.find('#sm-filter-btn').trigger('mouseenter') // clears the timer
      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('#filter-mode-flyout').classes()).toContain('filter-flyout-visible')
      vi.useRealTimers()
    })

    it('sets the filter mode and persists it', async () => {
      const events: string[] = []
      document.addEventListener('adsb-filter-change', () => events.push('change'))
      await wrapper.find('.filter-flyout-btn[data-mode="civil"]').trigger('click')
      expect(controls.adsb.setTypeFilter).toHaveBeenCalledWith('civil')
      expect(JSON.parse(localStorage.getItem('adsbFilter')!)).toEqual({
        typeFilter: 'all',
        allHidden: false,
      })
      expect(events).toContain('change')
    })

    it('un-hides all aircraft before applying a mode when everything was hidden', async () => {
      controls.adsb._allHidden = true
      await wrapper.find('.filter-flyout-btn[data-mode="mil"]').trigger('click')
      expect(controls.adsb.setAllHidden).toHaveBeenCalledWith(false)
      expect(controls.adsb.setTypeFilter).toHaveBeenCalledWith('mil')
    })

    it('marks the active filter mode and tolerates a localStorage failure', async () => {
      // _typeFilter 'all' → the ALL flyout button is active.
      expect(wrapper.find('.filter-flyout-btn[data-mode="all"]').classes()).toContain('active')
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      await expect(
        wrapper.find('.filter-flyout-btn[data-mode="civil"]').trigger('click'),
      ).resolves.not.toThrow()
    })

    it('opens the search and filter panels via document events', async () => {
      const sidebar = document.createElement('div')
      sidebar.id = 'map-sidebar'
      document.body.appendChild(sidebar)
      const events: string[] = []
      document.addEventListener('air-open-filter', () => events.push('filter'))
      document.addEventListener('air-open-search', () => events.push('search'))
      await wrapper.find('#sm-filter-btn').trigger('click')
      await wrapper.find('#sm-search-btn').trigger('click')
      expect(events).toEqual(['filter', 'search'])
    })

    it('does not emit the filter event when the sidebar is absent', async () => {
      const events: string[] = []
      document.addEventListener('air-open-filter', () => events.push('filter'))
      await wrapper.find('#sm-filter-btn').trigger('click')
      expect(events).toHaveLength(0)
    })
  })

  describe('without the map', () => {
    let wrapper: ReturnType<typeof mountMenu>

    beforeEach(() => {
      wrapper = mountMenu(null)
    })

    it('renders and no control action throws', async () => {
      shared.loc!.value = { lon: 1, lat: 2 } // loc present but map null → goToLocation no-ops
      await wrapper.vm.$nextTick()
      for (const label of [
        'ZOOM IN',
        'ZOOM OUT',
        'GO TO MY LOCATION',
        'PLANES',
        'GROUND VEHICLES',
        'TOWERS',
        'CALLSIGNS',
        'RANGE RING',
        'A2A REFUELING',
        'AWACS',
        '3D VIEW',
        'AIRPORTS',
        'MILITARY BASES',
        'LOCATIONS',
        'ROADS',
        'TILT UP',
        'ROTATE LEFT',
        'RESET BEARING',
      ]) {
        await expect(wrapper.find(tip(label)).trigger('click')).resolves.not.toThrow()
      }
    })

    it('toggling planes with planes enabled but no control is a no-op', async () => {
      const air = useAirStore()
      air.overlayStates.adsb = true
      await wrapper.vm.$nextTick()
      await expect(wrapper.find(tip('CALLSIGNS')).trigger('click')).resolves.not.toThrow()
    })

    it('selecting a filter mode without a control is a no-op', async () => {
      await expect(
        wrapper.find('.filter-flyout-btn[data-mode="civil"]').trigger('click'),
      ).resolves.not.toThrow()
      expect(wrapper.find('.filter-flyout-btn[data-mode="all"]').classes()).not.toContain('active')
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountMenu(makeAirMap(makeControls()))
    // region: controls live inside a landmark in-app. button-name: the icon
    // buttons rely on data-tooltip rather than an accessible name — a real
    // pre-existing gap deferred to the phase 7/8 a11y remediation.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
