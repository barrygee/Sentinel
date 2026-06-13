/* eslint-disable vue/one-component-per-file -- this spec defines several tiny
   stub components to stand in for AirView's child components. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, onMounted } from 'vue'
import { axe } from 'jest-axe'
import AirView from './AirView.vue'

// ---- Child stubs ----------------------------------------------------------
// AirView only reaches into AirMap (control accessors) and AirFilter
// (focus/expandAirport). The remaining children are inert placeholders.

const adsbControl = { id: 'adsb' }
const airportsControl = { id: 'airports' }
const milBasesControl = { id: 'mil' }
const mapObject = { id: 'map' }

let adsbGetter: ReturnType<typeof vi.fn>
let airportsGetter: ReturnType<typeof vi.fn>
let milBasesGetter: ReturnType<typeof vi.fn>

// Full AirMap stub exposing the control accessors AirView.syncControls reads.
function makeAirMapStub() {
  adsbGetter = vi.fn(() => adsbControl)
  airportsGetter = vi.fn(() => airportsControl)
  milBasesGetter = vi.fn(() => milBasesControl)
  return defineComponent({
    name: 'AirMap',
    setup(_props, { expose }) {
      expose({
        getAdsbControl: adsbGetter,
        getAirports: airportsGetter,
        getMilBases: milBasesGetter,
        getMap: () => mapObject,
      })
      return () => h('div', { class: 'air-map-stub' })
    },
  })
}

// Bare AirMap stub: exposes no accessors, so the optional-call short-circuits to null.
const BareAirMapStub = defineComponent({
  name: 'AirMap',
  setup(_props, { expose }) {
    expose({})
    return () => h('div', { class: 'air-map-bare-stub' })
  },
})

// AirSideMenu stub reads props.mapRef.current so the airMapProxy getter is exercised.
const AirSideMenuStub = defineComponent({
  name: 'AirSideMenu',
  props: { mapRef: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { class: 'side-menu-stub' }, String(!!props.mapRef.current))
  },
})

let focusSpy: ReturnType<typeof vi.fn>
let expandAirportSpy: ReturnType<typeof vi.fn>

// Captures the result of the get-map prop arrow so line 12's accessor is exercised.
let lastGetMapResult: unknown
const AirFilterStub = defineComponent({
  name: 'AirFilter',
  props: { getMap: { type: Function, default: undefined } },
  setup(props, { expose }) {
    focusSpy = vi.fn()
    expandAirportSpy = vi.fn()
    // Resolve once mounted, by which point AirView's airMapRef is populated.
    onMounted(() => {
      lastGetMapResult = props.getMap?.()
    })
    expose({ focus: focusSpy, expandAirport: expandAirportSpy })
    return () => h('div', { class: 'air-filter-stub' })
  },
})

const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

function teleportTargets(): void {
  const search = document.createElement('div')
  search.id = 'msb-pane-search'
  const playback = document.createElement('div')
  playback.id = 'msb-pane-playback'
  document.body.append(search, playback)
}

function mountView(airMapStub = makeAirMapStub()) {
  return mount(AirView, {
    global: {
      stubs: {
        AirMap: airMapStub,
        AirSideMenu: AirSideMenuStub,
        AirFilter: AirFilterStub,
        AirReplayPanel: InertStub,
        NoUrlOverlay: InertStub,
      },
    },
  })
}

enableAutoUnmount(afterEach)

describe('AirView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  describe('teleport readiness', () => {
    it('activates teleports immediately when the search pane already exists', () => {
      teleportTargets()
      const wrapper = mountView()
      // AirFilter teleported into the existing search pane.
      expect(document.querySelector('#msb-pane-search .air-filter-stub')).not.toBeNull()
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(true)
    })

    it('polls with requestAnimationFrame until the search pane appears', async () => {
      const queued: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        queued.push(cb)
        return queued.length
      })

      const wrapper = mountView()
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(false)

      // First frame: pane still absent → reschedules another frame.
      queued.shift()!(0)
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(false)
      expect(queued).toHaveLength(1)

      // Pane mounts, next frame flips teleportReady true.
      teleportTargets()
      queued.shift()!(0)
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(true)

      vi.unstubAllGlobals()
    })

    it('stops polling after unmount via the _unmounted guard', () => {
      const queued: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        queued.push(cb)
        return queued.length
      })

      const wrapper = mountView()
      wrapper.unmount()
      teleportTargets()
      // Guard returns early: no reschedule, teleportReady stays false.
      expect(() => queued.shift()!(0)).not.toThrow()
      expect(queued).toHaveLength(0)

      vi.unstubAllGlobals()
    })
  })

  describe('syncControls', () => {
    it('pulls control instances from AirMap on adsb-data-update', async () => {
      teleportTargets()
      mountView()
      // The get-map prop resolves through AirMap.getMap().
      expect(lastGetMapResult).toBe(mapObject)
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      expect(adsbGetter).toHaveBeenCalled()
      expect(airportsGetter).toHaveBeenCalled()
      expect(milBasesGetter).toHaveBeenCalled()
    })

    it('falls back to null when AirMap exposes no accessors', () => {
      teleportTargets()
      mountView(BareAirMapStub)
      // Missing accessors short-circuit the get-map arrow to null.
      expect(lastGetMapResult).toBeNull()
      // …and the data-update handler must not throw.
      expect(() => document.dispatchEvent(new CustomEvent('adsb-data-update'))).not.toThrow()
    })
  })

  describe('keyboard + document events', () => {
    it('focuses the filter on Ctrl+F and prevents default', () => {
      teleportTargets()
      mountView()
      const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true })
      const preventSpy = vi.spyOn(event, 'preventDefault')
      document.dispatchEvent(event)
      expect(preventSpy).toHaveBeenCalled()
      expect(focusSpy).toHaveBeenCalled()
    })

    it('focuses the filter on Cmd+F', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))
      expect(focusSpy).toHaveBeenCalled()
    })

    it('ignores f without a modifier and other modified keys', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }))
      expect(focusSpy).not.toHaveBeenCalled()
    })

    it('focuses the filter on air-open-search and air-open-filter', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new CustomEvent('air-open-search'))
      document.dispatchEvent(new CustomEvent('air-open-filter'))
      expect(focusSpy).toHaveBeenCalledTimes(2)
    })

    it('expands the airport accordion on air-open-airport with an icao', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new CustomEvent('air-open-airport', { detail: { icao: 'EGLL' } }))
      expect(expandAirportSpy).toHaveBeenCalledWith('EGLL')
    })

    it('ignores air-open-airport without an icao', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new CustomEvent('air-open-airport', { detail: {} }))
      document.dispatchEvent(new CustomEvent('air-open-airport'))
      expect(expandAirportSpy).not.toHaveBeenCalled()
    })
  })

  it('has no accessibility violations', async () => {
    teleportTargets()
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
    expect(heading.text()).toBe('Air — live aircraft tracking')
  })
})
