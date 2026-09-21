import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'

// ---- Shared mock state ----------------------------------------------------
const shared = vi.hoisted(() => ({
  emit: null as null | ((event: string, ...args: unknown[]) => void),
  connectivityCb: null as null | ((online: boolean) => void),
  locationRef: null as { value: { lon: number; lat: number } | null } | null,
  ctx: null as null | Record<string, ReturnType<typeof vi.fn>>,
  marker: null as null | Record<string, ReturnType<typeof vi.fn>>,
  startLocation: null as null | ReturnType<typeof vi.fn>,
}))

// Every control the map builds, recorded by name so wiring can be asserted.
const controlMocks = vi.hoisted(() => {
  const instances: Record<string, Array<Record<string, unknown>>> = {}
  function make(name: string) {
    return class MockControl {
      args: unknown[]
      onAdd = vi.fn()
      onRemove = vi.fn()
      initLayers = vi.fn()
      applyVisibility = vi.fn()
      _initRings = vi.fn()
      setOrigin = vi.fn()
      setVisible = vi.fn()
      handleClickPublic = vi.fn()
      visible = false
      constructor(...args: unknown[]) {
        this.args = args
        ;(instances[name] ||= []).push(this as unknown as Record<string, unknown>)
      }
    }
  }
  return { instances, make }
})

function last(name: string): Record<string, ReturnType<typeof vi.fn>> & { visible: boolean } {
  const arr = controlMocks.instances[name]!
  return arr[arr.length - 1] as unknown as Record<string, ReturnType<typeof vi.fn>> & {
    visible: boolean
  }
}

vi.mock('@/components/shared/controls/names/NamesToggleControl', () => ({
  NamesToggleControl: controlMocks.make('names'),
}))
vi.mock('@/components/shared/controls/roads/RoadsToggleControl', () => ({
  RoadsToggleControl: controlMocks.make('roads'),
}))
vi.mock('@/components/shared/controls/terrain/TerrainToggleControl', () => ({
  TerrainToggleControl: controlMocks.make('terrain'),
}))
vi.mock('@/components/shared/controls/sentry-sites/SentrySitesControl', () => ({
  SentrySitesControl: controlMocks.make('sentrySites'),
}))
vi.mock('@/components/land/controls/range-rings/LandRangeRingsControl', () => ({
  LandRangeRingsControl: controlMocks.make('rangeRings'),
}))
vi.mock('./controls/vessels/AisVesselsControl', () => ({
  AisVesselsControl: controlMocks.make('vessels'),
}))
vi.mock('./controls/ferry-routes/FerryRoutesControl', () => ({
  FerryRoutesControl: controlMocks.make('ferries'),
}))
vi.mock('./controls/ports/PortsControl', () => ({
  PortsControl: controlMocks.make('ports'),
}))

vi.mock('@/components/shared/UserLocationMarker', () => ({
  UserLocationMarker: class {
    addTo = vi.fn()
    remove = vi.fn()
    update = vi.fn()
    setHidden = vi.fn()
    constructor() {
      shared.marker = this as unknown as Record<string, ReturnType<typeof vi.fn>>
    }
  },
}))

vi.mock('@/composables/useConnectivity', () => ({
  useConnectivity: (cb: (online: boolean) => void) => {
    shared.connectivityCb = cb
  },
}))

vi.mock('@/composables/useUserLocation', async () => {
  const { ref } = await import('vue')
  const location = ref<{ lon: number; lat: number } | null>(null)
  shared.locationRef = location as unknown as { value: { lon: number; lat: number } | null }
  const start = vi.fn()
  shared.startLocation = start
  return { useUserLocation: () => ({ location, start }) }
})

vi.mock('@/composables/useMapContextMenu', () => ({
  useMapContextMenu: () => {
    const ctx = { attach: vi.fn(), detach: vi.fn(), remove: vi.fn(), show: vi.fn() }
    shared.ctx = ctx
    return ctx
  },
}))

const MapLibreMapStub = defineComponent({
  name: 'MapLibreMap',
  props: {
    styleUrl: { type: String, default: '' },
    regionLabel: { type: String, default: '' },
    regionDescription: { type: String, default: '' },
    center: { type: Array, default: () => [] },
    zoom: { type: Number, default: 0 },
  },
  emits: ['map-created', 'style-loaded'],
  setup(_props, { emit }) {
    shared.emit = emit as (event: string, ...args: unknown[]) => void
    return () => h('div', { class: 'maplibre-stub' })
  },
})

import SeaMap from './SeaMap.vue'
import { absoluteSpriteTransform } from '@/utils/mapStyle'
import { useAppStore } from '@/stores/app'
import { useSeaStore } from '@/stores/sea'
import { useBasemapStore } from '@/stores/basemap'

/** Every style swap carries the MapLibre 6 sprite fix — see `setMapStyle`. */
const STYLE_OPTIONS = { transformStyle: absoluteSpriteTransform }

interface FakeMap {
  onceHandlers: Record<string, () => void>
  setStyle: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  getCenter: ReturnType<typeof vi.fn>
  getZoom: ReturnType<typeof vi.fn>
  getContainer: () => HTMLElement
  nativeCtrl: HTMLElement
}

function makeFakeMap(): FakeMap {
  const onceHandlers: Record<string, () => void> = {}
  const container = document.createElement('div')
  const nativeCtrl = document.createElement('div')
  nativeCtrl.className = 'maplibregl-ctrl-top-right'
  container.appendChild(nativeCtrl)
  return {
    onceHandlers,
    setStyle: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      onceHandlers[event] = cb
    }),
    getCenter: vi.fn(() => ({ lng: 1, lat: 51 })),
    getZoom: vi.fn(() => 8),
    getContainer: () => container,
    nativeCtrl,
  }
}

function mountMap() {
  return mount(SeaMap, { global: { stubs: { MapLibreMap: MapLibreMapStub } } })
}

function bringUp(map: FakeMap): void {
  shared.emit!('map-created', map)
  shared.emit!('style-loaded', map)
}

enableAutoUnmount(afterEach)

describe('SeaMap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    for (const key of Object.keys(controlMocks.instances)) delete controlMocks.instances[key]
    if (shared.locationRef) shared.locationRef.value = null
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defaultLayers: ['vessels'] }) }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the online style when online and the offline style when not', async () => {
    const app = useAppStore()
    const wrapper = mountMap()
    const stub = wrapper.findComponent(MapLibreMapStub)
    expect(stub.props('styleUrl')).toBe('/assets/fiord-online.json')
    expect(stub.props('regionLabel')).toBe('Sea domain map — live vessels')
    expect(stub.props('regionDescription')).toContain('Filter panel')
    app.isOnline = false
    await nextTick()
    expect(stub.props('styleUrl')).toBe('/assets/fiord.json')
  })

  it('opens where the operator left the map, or on the UK by default', () => {
    const wrapper = mountMap()
    expect(wrapper.findComponent(MapLibreMapStub).props('center')).toEqual([-2, 54])
    expect(wrapper.findComponent(MapLibreMapStub).props('zoom')).toBe(6)
    wrapper.unmount()
    useSeaStore().saveMapState([1, 51], 9)
    const again = mountMap()
    expect(again.findComponent(MapLibreMapStub).props('center')).toEqual([1, 51])
    expect(again.findComponent(MapLibreMapStub).props('zoom')).toBe(9)
  })

  it('wires location, marker and context menu on map-created', () => {
    const map = makeFakeMap()
    mountMap()
    shared.emit!('map-created', map)
    expect(shared.startLocation).toHaveBeenCalledOnce()
    expect(shared.marker!.addTo).toHaveBeenCalledWith(map)
    expect(shared.ctx!.attach).toHaveBeenCalledWith(map)
  })

  it('builds and adds every control once the style has loaded, ferry routes after vessels', () => {
    const map = makeFakeMap()
    mountMap()
    bringUp(map)
    for (const name of [
      'vessels',
      'ferries',
      'ports',
      'rangeRings',
      'roads',
      'names',
      'terrain',
      'sentrySites',
    ]) {
      expect(last(name).onAdd).toHaveBeenCalledWith(map)
    }
    expect(controlMocks.instances.vessels).toHaveLength(1)
    // The chart layer slots beneath the vessel layers, so vessels go first.
    const order = last('vessels').onAdd.mock.invocationCallOrder[0]!
    expect(last('ferries').onAdd.mock.invocationCallOrder[0]!).toBeGreaterThan(order)
    expect(map.nativeCtrl.style.display).toBe('none')
    // A second style-loaded (a reload) does not rebuild the controls.
    shared.emit!('style-loaded', map)
    expect(controlMocks.instances.vessels).toHaveLength(1)
  })

  it('hands the Sentry sites control the operator position and marker', () => {
    const map = makeFakeMap()
    mountMap()
    bringUp(map)
    const options = (last('sentrySites') as unknown as { args: unknown[] }).args[2] as {
      getUserLocation: () => unknown
      userMarker: unknown
    }
    expect(options.userMarker).toBe(shared.marker)
    expect(options.getUserLocation()).toBeNull()
    shared.locationRef!.value = { lon: 3, lat: 4 }
    expect(options.getUserLocation()).toEqual([3, 4])
  })

  it('tolerates a map without the native control corner', () => {
    const map = makeFakeMap()
    map.nativeCtrl.remove()
    mountMap()
    expect(() => bringUp(map)).not.toThrow()
  })

  it('exposes its controls and the map', () => {
    const map = makeFakeMap()
    const wrapper = mountMap()
    const exposed = wrapper.vm as unknown as {
      getVesselsControl: () => unknown
      getFerryRoutes: () => unknown
      getPorts: () => unknown
      getRangeRings: () => unknown
      getMap: () => unknown
    }
    expect(exposed.getVesselsControl()).toBeNull()
    expect(exposed.getMap()).toBeNull()
    bringUp(map)
    expect(exposed.getVesselsControl()).toBe(last('vessels'))
    expect(exposed.getFerryRoutes()).toBe(last('ferries'))
    expect(exposed.getPorts()).toBe(last('ports'))
    expect(exposed.getRangeRings()).toBe(last('rangeRings'))
    expect(exposed.getMap()).toBe(map)
  })

  describe('connectivity', () => {
    it('swaps the style and re-inits every layer control after the reload', () => {
      const map = makeFakeMap()
      mountMap()
      bringUp(map)
      shared.connectivityCb!(true) // already online: nothing to do
      expect(map.setStyle).not.toHaveBeenCalled()
      shared.connectivityCb!(false)
      expect(map.setStyle).toHaveBeenCalledWith('/assets/fiord.json', STYLE_OPTIONS)
      map.onceHandlers['style.load']!()
      expect(last('roads').applyVisibility).toHaveBeenCalled()
      expect(last('names').applyVisibility).toHaveBeenCalled()
      expect(last('terrain').initLayers).toHaveBeenCalled()
      expect(last('rangeRings')._initRings).toHaveBeenCalled()
      expect(last('vessels').initLayers).toHaveBeenCalled()
      expect(last('ferries').initLayers).toHaveBeenCalled()
      expect(last('ports').initLayers).toHaveBeenCalled()
      // The same style again is a no-op.
      shared.connectivityCb!(false)
      expect(map.setStyle).toHaveBeenCalledTimes(1)
    })

    it('does nothing before the map exists', () => {
      mountMap()
      expect(() => shared.connectivityCb!(false)).not.toThrow()
    })

    it('corrects a style that changed between creation and load', () => {
      const app = useAppStore()
      const map = makeFakeMap()
      mountMap()
      shared.emit!('map-created', map)
      app.isOnline = false
      shared.emit!('style-loaded', map)
      expect(map.setStyle).toHaveBeenCalledWith('/assets/fiord.json', STYLE_OPTIONS)
      map.onceHandlers['style.load']!()
      expect(last('vessels').initLayers).toHaveBeenCalled()
    })
  })

  describe('store-driven overlays', () => {
    it('keeps the range rings in step with the store flag', async () => {
      const map = makeFakeMap()
      mountMap()
      bringUp(map)
      const rings = last('rangeRings')
      useSeaStore().setOverlay('rangeRings', true)
      await nextTick()
      expect(rings.handleClickPublic).toHaveBeenCalledOnce()
      // A flag change before the map exists is simply ignored.
      const early = mountMap()
      useSeaStore().setOverlay('rangeRings', false)
      await nextTick()
      early.unmount()
      // Already in that state (the rail toggled it): no second click.
      rings.visible = true
      useSeaStore().setOverlay('rangeRings', true)
      useSeaStore().setOverlay('rangeRings', false)
      useSeaStore().setOverlay('rangeRings', true)
      await nextTick()
      expect(rings.handleClickPublic).toHaveBeenCalledOnce()
    })

    it('re-applies the ferry-routes and ports flags and keeps place names on regardless of the shared flag', async () => {
      const map = makeFakeMap()
      mountMap()
      bringUp(map)
      useSeaStore().setOverlay('ferryRoutes', false)
      await nextTick()
      expect(last('ferries').applyVisibility).toHaveBeenCalled()
      expect(last('ports').applyVisibility).not.toHaveBeenCalled()
      useSeaStore().setOverlay('ports', false)
      await nextTick()
      expect(last('ports').applyVisibility).toHaveBeenCalledOnce()
      // Names are forced on once, and the shared basemap flag is not followed.
      expect(last('names').setVisible).toHaveBeenCalledExactlyOnceWith(true)
      const basemap = useBasemapStore()
      basemap.setLayer('names', !basemap.layers.names)
      await nextTick()
      expect(last('names').setVisible).toHaveBeenCalledOnce()
      // Terrain, by contrast, does follow the shared basemap flag.
      basemap.setLayer('terrain', true)
      await nextTick()
      expect(last('terrain').setVisible).toHaveBeenCalledExactlyOnceWith(true)
    })

    it('seeds the overlays from the default-layers config on a first visit', async () => {
      mountMap()
      await flushPromises()
      const store = useSeaStore()
      expect(store.defaultLayers).toEqual(['vessels'])
      expect(store.overlayStates.vessels).toBe(true)
      expect(store.overlayStates.vesselLabels).toBe(false)
    })

    it('feeds the ring origin to the range rings', async () => {
      const map = makeFakeMap()
      mountMap()
      bringUp(map)
      shared.locationRef!.value = { lon: 1, lat: 51 }
      await flushPromises()
      expect(last('rangeRings').setOrigin).toHaveBeenCalled()
    })
  })

  describe('user location', () => {
    it('moves the marker with the fix and removes it when cleared', async () => {
      const map = makeFakeMap()
      mountMap()
      bringUp(map)
      // No fix at mount: the marker starts removed.
      const removals = shared.marker!.remove.mock.calls.length
      shared.locationRef!.value = { lon: 1, lat: 51 }
      await nextTick()
      expect(shared.marker!.update).toHaveBeenCalledWith(1, 51)
      shared.locationRef!.value = null
      await nextTick()
      expect(shared.marker!.remove).toHaveBeenCalledTimes(removals + 1)
      window.dispatchEvent(new Event('sentinel:userLocationCleared'))
      expect(shared.marker!.remove).toHaveBeenCalledTimes(removals + 2)
    })
  })

  it('saves the view and tears every control down on unmount', () => {
    const map = makeFakeMap()
    const wrapper = mountMap()
    bringUp(map)
    wrapper.unmount()
    expect(useSeaStore().mapCenter).toEqual([1, 51])
    expect(useSeaStore().mapZoom).toBe(8)
    expect(shared.ctx!.detach).toHaveBeenCalledWith(map)
    for (const name of [
      'vessels',
      'ferries',
      'ports',
      'rangeRings',
      'roads',
      'names',
      'terrain',
      'sentrySites',
    ]) {
      expect(last(name).onRemove).toHaveBeenCalledOnce()
    }
    expect(shared.marker!.remove).toHaveBeenCalled()
  })

  it('unmounts cleanly before the map was ever created', () => {
    const wrapper = mountMap()
    expect(() => wrapper.unmount()).not.toThrow()
    expect(useSeaStore().mapCenter).toBeNull()
  })
})
