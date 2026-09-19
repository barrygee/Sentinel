import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useAppStore } from '@/stores/app'
import { useBasemapStore } from '@/stores/basemap'

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

// ---- Fake AirMap + controls ----------------------------------------------
function makeControls() {
  // Kept (with its filter setters) purely so the specs below can prove this rail
  // no longer reaches for the ADS-B control at all — the aircraft ALL/CIVIL/
  // MILITARY filter moved to the left sidebar's FILTER sub-tabs.
  const adsb = {
    toggle: vi.fn(),
    visible: true,
    setHideGroundVehicles: vi.fn(),
    setHideTowers: vi.fn(),
    _allHidden: false,
    _typeFilter: 'all' as 'all' | 'civil' | 'mil',
    setAllHidden: vi.fn((value: boolean) => {
      adsb._allHidden = value
    }),
    setTypeFilter: vi.fn((mode: 'all' | 'civil' | 'mil') => {
      adsb._typeFilter = mode
    }),
  }
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
    adsb,
    labels: { syncToAdsb: vi.fn(), toggle: vi.fn() },
    rangeRings: { handleClickPublic: vi.fn() },
    aara: { toggle: vi.fn() },
    awacs: { toggle: vi.fn() },
    airports: { toggle: vi.fn() },
    mil: { toggle: vi.fn() },
    names: { handleClickPublic: vi.fn() },
    clear: { toggle: vi.fn(), _cleared: true },
  }
}

type Controls = ReturnType<typeof makeControls>

function makeAirMap(controls: Controls) {
  return {
    getMap: () => controls.map,
    // A spy, not a plain accessor: the rail must never consult the ADS-B control
    // any more, and the specs assert that by checking this is never called.
    getAdsbControl: vi.fn(() => controls.adsb),
    getAdsbLabels: () => controls.labels,
    getRangeRings: () => controls.rangeRings,
    getAara: () => controls.aara,
    getAwacs: () => controls.awacs,
    getAirports: () => controls.airports,
    getMilBases: () => controls.mil,
    getNamesControl: () => controls.names,
    getClearControl: () => controls.clear,
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
    let airMap: ReturnType<typeof makeAirMap>
    let wrapper: ReturnType<typeof mountMenu>

    beforeEach(() => {
      controls = makeControls()
      airMap = makeAirMap(controls)
      wrapper = mountMenu(airMap)
    })

    it('renders a rail with no expand/collapse toggle and every option always visible', () => {
      expect(wrapper.find('#side-menu').exists()).toBe(true)
      expect(wrapper.find('#side-menu-toggle').exists()).toBe(false)
      // All controls (including the ones previously hidden until "expanded") are
      // rendered as icon buttons with an accessible name + hover tooltip.
      for (const label of [
        'ZOOM IN',
        'ZOOM OUT',
        'GO TO MY LOCATION',
        'RANGE RING',
        'A2A REFUELING',
        'AWACS',
        'MAP LAYERS',
      ]) {
        const button = wrapper.find(tip(label))
        expect(button.exists()).toBe(true)
        expect(button.attributes('aria-label')).toBeTruthy()
      }
      // Callsigns is removed entirely.
      expect(wrapper.find(tip('CALLSIGNS')).exists()).toBe(false)
      // Ground vehicles, towers, location names, airports and military bases
      // are set once in Settings > Map Layers rather than mid-task, so the rail
      // no longer carries them; the three worth flipping in flight stay.
      for (const layer of ['ground', 'towers', 'names', 'airports', 'mil']) {
        expect(wrapper.find(`[data-loc="${layer}"]`).exists()).toBe(false)
      }
    })

    it('collapses the rail when the app store hides the side menu', async () => {
      const appStore = useAppStore()
      // Visible by default: no collapsed modifier. The collapsed modifier class
      // now lives on the shared IconRail shell (icon-rail--collapsed), not a
      // side-menu-specific class name (see the Phase 6a SpaceSideMenu precedent).
      expect(wrapper.find('#side-menu').classes()).not.toContain('icon-rail--collapsed')
      appStore.toggleSideMenu()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('#side-menu').classes()).toContain('icon-rail--collapsed')
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

    it('toggles the ring, refuelling and AWACS from the rail', async () => {
      await wrapper.find(tip('RANGE RING')).trigger('click')
      await wrapper.find(tip('A2A REFUELING')).trigger('click')
      await wrapper.find(tip('AWACS')).trigger('click')
      expect(controls.rangeRings.handleClickPublic).toHaveBeenCalled()
      expect(controls.aara.toggle).toHaveBeenCalled()
      expect(controls.awacs.toggle).toHaveBeenCalled()
    })

    it('toggles the shared terrain layer on the basemap store and greys out without tiles', async () => {
      const basemapStore = useBasemapStore()
      const terrain = () => wrapper.find('[aria-label="Terrain relief and contour lines"]')
      expect(terrain().classes()).not.toContain('active')
      expect(terrain().attributes('disabled')).toBeUndefined()

      await terrain().trigger('click')
      expect(basemapStore.layers.terrain).toBe(true)
      expect(terrain().classes()).toContain('active')
      await terrain().trigger('click')
      expect(basemapStore.layers.terrain).toBe(false)

      basemapStore.setTerrainAvailable(false)
      await nextTick()
      expect(terrain().attributes('disabled')).toBeDefined()
    })

    it('expands the LAYERS accordion on click and highlights the button while open', async () => {
      const button = wrapper.find('#sm-layers-btn')

      // Collapsed until clicked; the button is highlighted (active) only while
      // its panel is open. aria-expanded reflects the state.
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.classes()).not.toContain('active')

      await button.trigger('click')
      expect(button.attributes('aria-expanded')).toBe('true')
      expect(button.classes()).toContain('active')

      await button.trigger('click')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.classes()).not.toContain('active')
    })

    // ---- The aircraft filter left this rail -------------------------------
    // Replaces the five FILTER-accordion tests (open/collapse, resync-on-open,
    // set-mode-and-persist, un-hide-all-first, localStorage failure). ALL /
    // CIVIL / MILITARY are now single-select sub-tabs on the left sidebar's
    // FILTER rail, driven through `airStore.setAdsbTypeFilter` — that behaviour
    // is covered by MapSidebar.spec.ts and stores/air.spec.ts. What has to hold
    // *here* is that the rail carries none of it any more.
    it('no longer carries a FILTER accordion or any aircraft-mode buttons', () => {
      expect(wrapper.find('#sm-filter-btn').exists()).toBe(false)
      expect(wrapper.find('#filter-mode-flyout').exists()).toBe(false)
      expect(wrapper.find(tip('FILTER')).exists()).toBe(false)
      expect(wrapper.findAll('[data-mode]')).toHaveLength(0)
      for (const accessibleName of [
        'Filter aircraft',
        'Show all aircraft',
        'Civil aircraft only',
        'Military aircraft only',
      ]) {
        expect(wrapper.find(`[aria-label="${accessibleName}"]`).exists()).toBe(false)
      }
      // LAYERS is the only accordion left on the rail.
      expect(wrapper.findAll('[aria-expanded]')).toHaveLength(1)
    })

    it('never reaches for the ADS-B control, so nothing here can move the filter', async () => {
      shared.loc!.value = { lon: 1, lat: 2 } // so GO TO MY LOCATION does its work too
      await nextTick()
      // Open LAYERS first so the panel's buttons are rendered, then click every
      // button the rail offers — none of them may consult the ADS-B control.
      await wrapper.find('#sm-layers-btn').trigger('click')
      for (const button of wrapper.findAll('button')) await button.trigger('click')
      expect(wrapper.findAll('button').length).toBeGreaterThan(4)
      expect(airMap.getAdsbControl).not.toHaveBeenCalled()
      expect(controls.adsb.setTypeFilter).not.toHaveBeenCalled()
      expect(controls.adsb.setAllHidden).not.toHaveBeenCalled()
      expect(localStorage.getItem('adsbFilter')).toBeNull()
    })

    it('no longer listens for adsb-filter-change on the document', async () => {
      // The rail used to mirror the control's filter fields into local refs on
      // this event. Nothing on it depends on the filter now, so the listener is
      // gone — a reintroduced one would consult the control again here.
      document.dispatchEvent(new CustomEvent('adsb-filter-change'))
      await nextTick()
      expect(airMap.getAdsbControl).not.toHaveBeenCalled()
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
        'RANGE RING',
        'A2A REFUELING',
        'AWACS',
        'MAP LAYERS',
      ]) {
        await expect(wrapper.find(tip(label)).trigger('click')).resolves.not.toThrow()
      }
    })

    it('still toggles the shared terrain layer, which needs no map control', async () => {
      // Replaces "selecting a filter mode without a control is a no-op" (the
      // mode buttons are gone): terrain is the one rail action that goes to a
      // store rather than the map, so it works with no map attached at all.
      const basemapStore = useBasemapStore()
      await wrapper.find('[aria-label="Terrain relief and contour lines"]').trigger('click')
      expect(basemapStore.layers.terrain).toBe(true)
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountMenu(makeAirMap(makeControls()))
    // The rail is a <nav> landmark; region is disabled because the component is
    // mounted in isolation here (its surrounding app landmarks aren't present).
    // Every icon button carries an aria-label, so button-name passes.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
