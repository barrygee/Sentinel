/* eslint-disable vue/one-component-per-file -- this spec defines tiny stub
   components to stand in for LandView's children. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { axe } from 'jest-axe'

// ---- Shared mock state ----------------------------------------------------
const shared = vi.hoisted(() => ({
  emit: null as null | ((event: string, ...args: unknown[]) => void),
  connectivityCb: null as null | ((online: boolean) => void),
}))

// Capture the connectivity callback so tests can drive online/offline flips.
vi.mock('@/composables/useConnectivity', () => ({
  useConnectivity: (cb: (online: boolean) => void) => {
    shared.connectivityCb = cb
  },
}))

// User location composable: a controllable ref + a `start` spy, so tests can
// drive the marker / range-rings watcher.
const locationState = vi.hoisted(() => ({
  location: null as null | { value: { lat: number; lon: number; accuracy: number } | null },
  start: vi.fn(),
}))
vi.mock('@/composables/useUserLocation', async () => {
  const { ref: vueRef } = await import('vue')
  locationState.location = vueRef(null)
  return {
    useUserLocation: () => ({ location: locationState.location, start: locationState.start }),
  }
})

// UserLocationMarker: spy on its map methods (its real impl builds a maplibre
// Marker, which needs a real map).
const markerSpies = vi.hoisted(() => ({ addTo: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('@/components/shared/UserLocationMarker', () => ({
  // A class (not an arrow fn) so it can be `new`-ed; all instances share the spies.
  UserLocationMarker: class {
    addTo = markerSpies.addTo
    update = markerSpies.update
    remove = markerSpies.remove
  },
}))

// MapLibreMap stub: captures `emit` so tests drive map-created / style-loaded,
// and re-renders styleUrl so the prop can be asserted.
const MapLibreMapStub = defineComponent({
  name: 'MapLibreMap',
  props: {
    styleUrl: { type: String, default: '' },
    center: { type: Array, default: () => [] },
    zoom: { type: Number, default: 0 },
  },
  emits: ['map-created', 'style-loaded'],
  setup(_props, { emit }) {
    shared.emit = emit as (event: string, ...args: unknown[]) => void
    return () => h('div', { class: 'maplibre-stub' })
  },
})

const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

import LandView from './LandView.vue'
import { useAppStore } from '@/stores/app'
import { AprsStationsControl } from '@/components/land/controls/aprs/AprsStationsControl'
import { LandZoomControl } from '@/components/land/controls/zoom/LandZoomControl'
import { LandLocateControl } from '@/components/land/controls/locate/LandLocateControl'
import { LandRangeRingsControl } from '@/components/land/controls/range-rings/LandRangeRingsControl'

const ONLINE_STYLE = '/assets/fiord-online.json'
const OFFLINE_STYLE = '/assets/fiord.json'

interface FakeMap {
  setStyle: ReturnType<typeof vi.fn>
  addControl: ReturnType<typeof vi.fn>
  removeControl: ReturnType<typeof vi.fn>
}

function makeFakeMap(): FakeMap {
  // addControl/removeControl are no-op spies: LandView now mounts the APRS
  // stations control on map-created, but these style-reconciliation tests only
  // exercise the style logic (the control has its own spec).
  return { setStyle: vi.fn(), addControl: vi.fn(), removeControl: vi.fn() }
}

function mountView() {
  return mount(LandView, {
    global: { stubs: { MapLibreMap: MapLibreMapStub, NoUrlOverlay: InertStub } },
  })
}

enableAutoUnmount(afterEach)

describe('LandView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    shared.emit = null
    shared.connectivityCb = null
    if (locationState.location) locationState.location.value = null
    localStorage.clear()
    document.body.innerHTML = ''
  })

  describe('style selection', () => {
    it('seeds the UK-centred view with the online style when online', () => {
      const wrapper = mountView()
      const props = wrapper.findComponent(MapLibreMapStub).props()
      expect(props.styleUrl).toBe(ONLINE_STYLE)
      expect(props.center).toEqual([-2, 54])
      expect(props.zoom).toBe(6)
    })

    it('uses the offline style when offline', async () => {
      const app = useAppStore()
      app.isOnline = false
      const wrapper = mountView()
      await nextTick()
      expect(wrapper.findComponent(MapLibreMapStub).props('styleUrl')).toBe(OFFLINE_STYLE)
    })
  })

  describe('style reconciliation on load', () => {
    it('reloads the style when connectivity flipped between create and load', async () => {
      const app = useAppStore()
      const map = makeFakeMap()
      mountView()
      // map-created records the initial (online) style…
      shared.emit!('map-created', map)
      // …then connectivity flips offline before the style finishes loading.
      app.isOnline = false
      await nextTick()
      shared.emit!('style-loaded', map)
      expect(map.setStyle).toHaveBeenCalledWith(OFFLINE_STYLE)
    })

    it('does not reload when connectivity was unchanged before load', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      shared.emit!('style-loaded', map)
      expect(map.setStyle).not.toHaveBeenCalled()
    })

    it('does not reload when no map-created preceded the style load', () => {
      const map = makeFakeMap()
      mountView()
      // _initialStyleUrl is still null → the reconciliation guard short-circuits.
      shared.emit!('style-loaded', map)
      expect(map.setStyle).not.toHaveBeenCalled()
    })
  })

  describe('connectivity changes', () => {
    it('switches to the offline style when connectivity drops', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      shared.connectivityCb!(false)
      expect(map.setStyle).toHaveBeenCalledWith(OFFLINE_STYLE)
    })

    it('switches to the online style when connectivity returns', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      shared.connectivityCb!(true)
      expect(map.setStyle).toHaveBeenCalledWith(ONLINE_STYLE)
    })

    it('does nothing when the map is not yet created', () => {
      mountView()
      // _map is null → the optional-chained setStyle is a no-op.
      expect(() => shared.connectivityCb!(false)).not.toThrow()
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountView()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('exposes a single screen-reader heading for the view', () => {
    const wrapper = mountView()
    const heading = wrapper.find('h1')
    expect(heading.exists()).toBe(true)
    expect(heading.classes()).toContain('sr-only')
    expect(heading.text()).toBe('Land domain')
  })

  describe('map controls', () => {
    it('adds zoom, locate, range-rings and APRS controls (top-right) on map-created', () => {
      const map = makeFakeMap()
      const wrapper = mountView()
      shared.emit!('map-created', map)
      expect(map.addControl).toHaveBeenCalledTimes(4)
      const added = map.addControl.mock.calls.map((call) => call[0])
      expect(added[0]).toBeInstanceOf(LandZoomControl)
      expect(added[1]).toBeInstanceOf(LandLocateControl)
      expect(added[2]).toBeInstanceOf(LandRangeRingsControl)
      expect(added[3]).toBeInstanceOf(AprsStationsControl)
      // All docked to the same corner.
      expect(map.addControl.mock.calls.every((call) => call[1] === 'top-right')).toBe(true)
      wrapper.unmount()
      expect(map.removeControl).toHaveBeenCalledTimes(4)
    })

    it('starts location tracking and shows the marker on map-created', () => {
      // A known fix is present, so the controls read it (getUserLocation → coords).
      locationState.location!.value = { lat: 54.5, lon: -1.5, accuracy: 10 }
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      expect(locationState.start).toHaveBeenCalledOnce()
      expect(markerSpies.addTo).toHaveBeenCalledWith(map)
    })

    it('updates the marker and range-rings centre when a location fix exists', () => {
      // A fix is present before mount → the immediate watcher applies it.
      locationState.location!.value = { lat: 55, lon: -1.5, accuracy: 10 }
      mountView()
      expect(markerSpies.update).toHaveBeenCalledWith(-1.5, 55)
    })

    it('removes the marker when the location is cleared', async () => {
      locationState.location!.value = { lat: 55, lon: -1.5, accuracy: 10 }
      mountView()
      markerSpies.remove.mockClear()
      locationState.location!.value = null
      await nextTick()
      expect(markerSpies.remove).toHaveBeenCalled()
    })

    it('unmounts cleanly when no map was ever created', () => {
      const wrapper = mountView()
      // No map-created emitted → the onUnmounted guard has no controls to remove.
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })
})
