/* eslint-disable vue/one-component-per-file -- this spec defines several tiny
   stub components to stand in for SpaceView's children. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { axe } from 'jest-axe'

// useUserLocation is mocked so getUserLocation can be driven directly.
const shared = vi.hoisted(() => ({
  locationRef: null as { value: { lon: number; lat: number } | null } | null,
  satControl: null as { value: unknown } | null,
}))

vi.mock('@/composables/useUserLocation', async () => {
  const { ref: vueRef } = await import('vue')
  const location = vueRef<{ lon: number; lat: number } | null>(null)
  shared.locationRef = location as unknown as { value: { lon: number; lat: number } | null }
  return { useUserLocation: () => ({ location }) }
})

import SpaceView from './SpaceView.vue'

// SpaceMap stub exposing a reactive satelliteControlReactive the parent watches.
const SpaceMapStub = defineComponent({
  name: 'SpaceMap',
  setup(_props, { expose }) {
    const control = ref<unknown>(null)
    shared.satControl = control
    expose({
      get satelliteControlReactive() {
        return control.value
      },
    })
    return () => h('div', { class: 'space-map-stub' })
  },
})

let focusSpy: ReturnType<typeof vi.fn>
let lastGetUserLocation: (() => [number, number] | null) | undefined

const SpaceFilterStub = defineComponent({
  name: 'SpaceFilter',
  props: {
    getUserLocation: { type: Function, default: undefined },
    satelliteControl: { type: Object, default: null },
  },
  setup(props, { expose }) {
    focusSpy = vi.fn()
    lastGetUserLocation = props.getUserLocation as () => [number, number] | null
    expose({ focus: focusSpy })
    return () => h('div', { class: 'space-filter-stub' })
  },
})

// Reads props.mapRef.current so the spaceMapProxy `current` getter is exercised.
const SpaceSideMenuStub = defineComponent({
  name: 'SpaceSideMenu',
  props: { mapRef: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { class: 'side-menu-stub' }, String(!!props.mapRef.current))
  },
})

const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

function teleportTargets(): void {
  const search = document.createElement('div')
  search.id = 'msb-pane-search'
  const passes = document.createElement('div')
  passes.id = 'msb-pane-passes'
  document.body.append(search, passes)
}

function mountView() {
  return mount(SpaceView, {
    global: {
      stubs: {
        SpaceMap: SpaceMapStub,
        SpaceFilter: SpaceFilterStub,
        SpaceSideMenu: SpaceSideMenuStub,
        SpacePasses: InertStub,
        SatInfoPanel: InertStub,
        NoUrlOverlay: InertStub,
      },
    },
  })
}

enableAutoUnmount(afterEach)

describe('SpaceView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    if (shared.locationRef) shared.locationRef.value = null
    localStorage.clear()
  })

  describe('teleport readiness', () => {
    it('activates teleports immediately when the search pane already exists', () => {
      teleportTargets()
      mountView()
      expect(document.querySelector('#msb-pane-search .space-filter-stub')).not.toBeNull()
    })

    it('polls with requestAnimationFrame until the search pane appears', () => {
      const queued: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        queued.push(cb)
        return queued.length
      })
      const wrapper = mountView()
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(false)

      // First frame: pane still absent → reschedules.
      queued.shift()!(0)
      expect(queued).toHaveLength(1)
      expect((wrapper.vm as unknown as { teleportReady: boolean }).teleportReady).toBe(false)

      // Pane mounts; next frame flips teleportReady.
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
      expect(() => queued.shift()!(0)).not.toThrow()
      expect(queued).toHaveLength(0)
      vi.unstubAllGlobals()
    })
  })

  describe('satelliteControl watch', () => {
    it('adopts the control once SpaceMap exposes it, then stops watching', async () => {
      teleportTargets()
      const wrapper = mountView()
      const control = { id: 'sat' }
      shared.satControl!.value = control
      await wrapper.vm.$nextTick()
      // Passed down to SpaceFilter via the satellite-control prop (Vue wraps the
      // object in a readonly proxy, so compare by value).
      expect(wrapper.findComponent(SpaceFilterStub).props('satelliteControl')).toEqual(control)

      // Watch has stopped: a later change is not adopted.
      shared.satControl!.value = { id: 'other' }
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent(SpaceFilterStub).props('satelliteControl')).toEqual({
        id: 'sat',
      })
    })
  })

  describe('getUserLocation prop', () => {
    it('returns null when there is no fix', () => {
      teleportTargets()
      mountView()
      expect(lastGetUserLocation!()).toBeNull()
    })

    it('returns [lon, lat] when a fix is present', () => {
      teleportTargets()
      mountView()
      shared.locationRef!.value = { lon: 5, lat: 9 }
      expect(lastGetUserLocation!()).toEqual([5, 9])
    })
  })

  describe('open-space-search', () => {
    it('focuses the filter on the open-space-search event', () => {
      teleportTargets()
      mountView()
      document.dispatchEvent(new CustomEvent('open-space-search'))
      expect(focusSpy).toHaveBeenCalled()
    })

    it('does not throw when the filter is not teleported yet', () => {
      // No teleport targets → spaceFilterRef stays null; the optional call is a no-op.
      mountView()
      expect(() => document.dispatchEvent(new CustomEvent('open-space-search'))).not.toThrow()
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
    expect(heading.text()).toBe('Space — satellite tracking')
  })
})
