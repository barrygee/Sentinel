/* eslint-disable vue/one-component-per-file, vue/require-prop-types -- this spec
   defines tiny stub components (with untyped capture props) to stand in for
   LandView's children. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useSdrStore } from '@/stores/sdr'
import { defineComponent, h, nextTick } from 'vue'
import { axe } from 'jest-axe'

// ---- Shared mock state ----------------------------------------------------
const shared = vi.hoisted(() => ({
  emit: null as null | ((event: string, ...args: unknown[]) => void),
  connectivityCb: null as null | ((online: boolean) => void),
}))

vi.mock('@/composables/useConnectivity', () => ({
  useConnectivity: (cb: (online: boolean) => void) => {
    shared.connectivityCb = cb
  },
}))

// Right-click "set my location" menu — spy on attach/detach.
const ctxMenuSpies = vi.hoisted(() => ({
  attach: vi.fn(),
  detach: vi.fn(),
  remove: vi.fn(),
  show: vi.fn(),
}))
vi.mock('@/composables/useMapContextMenu', () => ({ useMapContextMenu: () => ctxMenuSpies }))

// User location: a controllable ref + `start` spy.
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

// UserLocationMarker: spy on its map methods (a class so it can be `new`-ed).
const markerSpies = vi.hoisted(() => ({
  addTo: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setHidden: vi.fn(),
}))
vi.mock('@/components/shared/UserLocationMarker', () => ({
  UserLocationMarker: class {
    addTo = markerSpies.addTo
    update = markerSpies.update
    remove = markerSpies.remove
    // Borrowed by SentrySitesControl, which hides this marker while one of its
    // counts stands for the operator's position.
    setHidden = markerSpies.setHidden
  },
}))

// The map feature controls are initialised via onAdd; mock them so no real
// maplibre layers are touched (they have their own specs).
const ringsSpies = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  handleClickPublic: vi.fn(),
  updateCenter: vi.fn(),
  setLocationAvailable: vi.fn(),
  setOrigin: vi.fn(),
  visible: false,
}))
vi.mock('@/components/land/controls/range-rings/LandRangeRingsControl', () => ({
  LandRangeRingsControl: class {
    onAdd = ringsSpies.onAdd
    onRemove = ringsSpies.onRemove
    handleClickPublic = ringsSpies.handleClickPublic
    updateCenter = ringsSpies.updateCenter
    setLocationAvailable = ringsSpies.setLocationAvailable
    setOrigin = ringsSpies.setOrigin
    get visible() {
      return ringsSpies.visible
    }
  },
}))
const aprsSpies = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  handleClickPublic: vi.fn(),
  setVisible: vi.fn(),
}))
// The real control owns APRS visibility on the land store (so the map and the
// side panel's list can't disagree); the stub mirrors that, since the view's
// active-state prop now reads the store rather than a local ref.
vi.mock('@/components/land/controls/aprs/AprsStationsControl', () => ({
  AprsStationsControl: class {
    private _store: { aprsLayerVisible: boolean; setAprsLayerVisible: (v: boolean) => void }
    constructor(store: { aprsLayerVisible: boolean; setAprsLayerVisible: (v: boolean) => void }) {
      this._store = store
    }
    onAdd = aprsSpies.onAdd
    onRemove = aprsSpies.onRemove
    handleClickPublic = (...args: unknown[]) => {
      this._store.setAprsLayerVisible(!this._store.aprsLayerVisible)
      return aprsSpies.handleClickPublic(...args)
    }
    setVisible = (visible: boolean) => {
      this._store.setAprsLayerVisible(visible)
      return aprsSpies.setVisible(visible)
    }
  },
}))

const repeatersSpies = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  handleClickPublic: vi.fn(),
  setVisible: vi.fn(),
}))
// The UK repeater directory layer, added with the same store-owned visibility
// contract as APRS: the control writes the land store's flag so
// the map and the FILTER pane's REPEATERS list can never disagree.
vi.mock('@/components/land/controls/repeaters/RepeatersControl', () => ({
  REPEATER_LOCATE_EVENT: 'land-locate-repeater',
  RepeatersControl: class {
    private _store: {
      repeatersLayerVisible: boolean
      setRepeatersLayerVisible: (visible: boolean) => void
    }
    constructor(store: {
      repeatersLayerVisible: boolean
      setRepeatersLayerVisible: (visible: boolean) => void
    }) {
      this._store = store
    }
    onAdd = repeatersSpies.onAdd
    onRemove = repeatersSpies.onRemove
    handleClickPublic = (...args: unknown[]) => {
      this._store.setRepeatersLayerVisible(!this._store.repeatersLayerVisible)
      return repeatersSpies.handleClickPublic(...args)
    }
    setVisible = (visible: boolean) => {
      this._store.setRepeatersLayerVisible(visible)
      return repeatersSpies.setVisible(visible)
    }
  },
}))

// The shared base-map layer controls (location names / roads). Mocked for the same
// reason as the others — they own real maplibre layer visibility and have their
// own specs — but each keeps the basemap store wired up, since the side menu
// reads its active state straight off that store rather than from a prop.
const namesSpies = vi.hoisted(() => ({
  setVisible: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  handleClickPublic: vi.fn(),
  applyVisibility: vi.fn(),
}))
vi.mock('@/components/shared/controls/names/NamesToggleControl', () => ({
  NamesToggleControl: class {
    private _store: {
      setLayer: (key: string, visible: boolean) => void
      layers: { names: boolean }
    }
    constructor(store: {
      setLayer: (key: string, visible: boolean) => void
      layers: { names: boolean }
    }) {
      this._store = store
    }
    onAdd = namesSpies.onAdd
    onRemove = namesSpies.onRemove
    applyVisibility = namesSpies.applyVisibility
    setVisible = namesSpies.setVisible
    handleClickPublic = (...args: unknown[]) => {
      this._store.setLayer('names', !this._store.layers.names)
      return namesSpies.handleClickPublic(...args)
    }
  },
}))
const roadsSpies = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  handleClickPublic: vi.fn(),
  applyVisibility: vi.fn(),
}))
vi.mock('@/components/shared/controls/roads/RoadsToggleControl', () => ({
  RoadsToggleControl: class {
    private _store: {
      setLayer: (key: string, visible: boolean) => void
      layers: { roads: boolean }
    }
    constructor(store: {
      setLayer: (key: string, visible: boolean) => void
      layers: { roads: boolean }
    }) {
      this._store = store
    }
    onAdd = roadsSpies.onAdd
    onRemove = roadsSpies.onRemove
    applyVisibility = roadsSpies.applyVisibility
    handleClickPublic = (...args: unknown[]) => {
      this._store.setLayer('roads', !this._store.layers.roads)
      return roadsSpies.handleClickPublic(...args)
    }
  },
}))

// Terrain (hillshade + contours) is the third shared base-map layer.
const terrainSpies = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  initLayers: vi.fn(),
  setVisible: vi.fn(),
}))
vi.mock('@/components/shared/controls/terrain/TerrainToggleControl', () => ({
  TerrainToggleControl: class {
    onAdd = terrainSpies.onAdd
    onRemove = terrainSpies.onRemove
    initLayers = terrainSpies.initLayers
    setVisible = terrainSpies.setVisible
  },
}))

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

// Capture the props LandView passes to the side menu so the handlers can be
// invoked and the active-state props asserted.
let sideMenuProps: Record<string, unknown> | null = null
const LandSideMenuStub = defineComponent({
  name: 'LandSideMenu',
  // The data-layer and place-name toggles left the rail with the repeater
  // feature: layers are now chosen from the sidebar's FILTER sub-tabs and
  // Settings › LAND › Map Layers, so only navigation props remain.
  props: [
    'zoomIn',
    'zoomOut',
    'goToLocation',
    'toggleRangeRings',
    'rangeRingsActive',
    'locationActive',
  ],
  setup(props) {
    sideMenuProps = props as unknown as Record<string, unknown>
    return () => h('div', { class: 'land-side-menu-stub' })
  },
})

import LandView from './LandView.vue'
import { absoluteSpriteTransform } from '@/utils/mapStyle'
import { useAppStore } from '@/stores/app'
import { useLandStore } from '@/stores/land'
import { useRepeatersStore } from '@/stores/repeaters'
import { useBasemapStore } from '@/stores/basemap'

/** Every style swap carries the MapLibre 6 sprite fix — see `setMapStyle`. */
const STYLE_OPTIONS = { transformStyle: absoluteSpriteTransform }

const ONLINE_STYLE = '/assets/fiord-online.json'
const OFFLINE_STYLE = '/assets/fiord.json'

function makeFakeMap() {
  const container = document.createElement('div')
  return {
    setStyle: vi.fn(),
    getContainer: () => container,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn(() => 6),
    // Map-movement hooks + projection: the APRS and Sentry-site controls
    // regroup their markers whenever a movement settles.
    on: vi.fn(),
    off: vi.fn(),
    project: vi.fn(() => ({ x: 0, y: 0 })),
    easeTo: vi.fn(),
    // The shared location-names/roads controls query and restyle base-map layers.
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    getLayer: vi.fn(() => undefined),
    setLayoutProperty: vi.fn(),
    // The repeaters control reads the viewport bounds on every render.
    getBounds: vi.fn(() => ({
      getWest: () => -2,
      getSouth: () => 53,
      getEast: () => -1,
      getNorth: () => 55,
      getSouthWest: () => ({ lng: -2, lat: 53 }),
      getNorthEast: () => ({ lng: -1, lat: 55 }),
    })),
    _container: container,
  }
}

const LandFilterStub = defineComponent({
  name: 'LandFilterStub',
  setup: () => () => h('div', { class: 'land-filter-stub' }),
})

/** Stand in for the sidebar pane MapSidebar owns, which LandView teleports into. */
function teleportTarget(): void {
  const searchPane = document.createElement('div')
  searchPane.id = 'msb-pane-search'
  document.body.append(searchPane)
}

function mountView() {
  return mount(LandView, {
    global: {
      stubs: {
        MapLibreMap: MapLibreMapStub,
        NoUrlOverlay: InertStub,
        LandSideMenu: LandSideMenuStub,
        LandFilter: LandFilterStub,
      },
    },
  })
}

enableAutoUnmount(afterEach)

describe('LandView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // The APRS layer only runs when an SDR has been chosen as the APRS radio,
    // so the map-control cases start from a configured receiver; the gating
    // itself is exercised in its own cases below.
    useSdrStore().setAprsRadioId(1)
    // The repeater filters hydrate from the config database on mount; stub the
    // request so no test depends on a backend (asserted in its own case below).
    vi.spyOn(useRepeatersStore(), 'hydrateFiltersFromDb').mockResolvedValue()
    vi.clearAllMocks()
    shared.emit = null
    shared.connectivityCb = null
    sideMenuProps = null
    ringsSpies.visible = false
    if (locationState.location) locationState.location.value = null
    localStorage.clear()
    document.body.innerHTML = ''
  })

  describe('teleport target', () => {
    it('teleports the APRS filter pane into the sidebar once it exists', () => {
      teleportTarget()
      mountView()
      // useSidebarPaneTarget('search') resolves synchronously when the pane is
      // already present, so the Teleport is active on first render.
      expect(document.querySelector('#msb-pane-search .land-filter-stub')).not.toBeNull()
    })

    it('does not teleport until the sidebar panes appear', () => {
      // No teleportTarget(): MapSidebar hasn't rendered its panes, so the
      // Teleport stays gated off and LandFilter never mounts.
      expect(() => mountView()).not.toThrow()
      expect(document.querySelector('.land-filter-stub')).toBeNull()
    })
  })

  describe('style selection', () => {
    it('seeds the UK-centred view with the online style when online', () => {
      const wrapper = mountView()
      const props = wrapper.findComponent(MapLibreMapStub).props()
      expect(props.styleUrl).toBe(ONLINE_STYLE)
      expect(props.center).toEqual([-2, 54])
      expect(props.zoom).toBe(6)
    })

    it('uses the offline style when offline', () => {
      const app = useAppStore()
      app.isOnline = false
      const wrapper = mountView()
      expect(wrapper.findComponent(MapLibreMapStub).props('styleUrl')).toBe(OFFLINE_STYLE)
    })
  })

  describe('style reconciliation on load', () => {
    it('reloads the style when connectivity flipped between create and load', async () => {
      const app = useAppStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      app.isOnline = false
      await nextTick()
      shared.emit!('style-loaded', map)
      expect(map.setStyle).toHaveBeenCalledWith(OFFLINE_STYLE, STYLE_OPTIONS)
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
      shared.emit!('style-loaded', map)
      expect(map.setStyle).not.toHaveBeenCalled()
    })
  })

  describe('connectivity changes', () => {
    it('switches the style when connectivity drops after load', async () => {
      const app = useAppStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      // useConnectivity sets the store before it calls back, so the spec does
      // too — the style the map wants is derived from the store, not the arg.
      app.isOnline = false
      await nextTick()
      shared.connectivityCb!(false)
      expect(map.setStyle).toHaveBeenCalledWith(OFFLINE_STYLE, STYLE_OPTIONS)
      app.isOnline = true
      await nextTick()
      shared.connectivityCb!(true)
      expect(map.setStyle).toHaveBeenCalledWith(ONLINE_STYLE, STYLE_OPTIONS)
    })

    it('does nothing when the map is not yet created', () => {
      mountView()
      expect(() => shared.connectivityCb!(false)).not.toThrow()
    })
  })

  describe('map controls', () => {
    it('initialises the range-rings and APRS controls and hides the native corner', () => {
      const map = makeFakeMap()
      const native = document.createElement('div')
      native.className = 'maplibregl-ctrl-top-right'
      map._container.appendChild(native)
      mountView()
      shared.emit!('map-created', map)
      expect(ringsSpies.onAdd).toHaveBeenCalledWith(map)
      expect(aprsSpies.onAdd).toHaveBeenCalledWith(map)
      expect(repeatersSpies.onAdd).toHaveBeenCalledWith(map)
      expect(native.style.display).toBe('none') // native controls hidden
      expect(locationState.start).toHaveBeenCalledOnce()
      expect(markerSpies.addTo).toHaveBeenCalledWith(map)
      expect(ctxMenuSpies.attach).toHaveBeenCalledWith(map) // right-click set-location enabled
    })

    it('detaches the right-click location menu on unmount', () => {
      const map = makeFakeMap()
      const wrapper = mountView()
      shared.emit!('map-created', map)
      wrapper.unmount()
      expect(ctxMenuSpies.detach).toHaveBeenCalledWith(map)
    })

    it('seeds the range-rings active state from the control', async () => {
      ringsSpies.visible = true
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      await nextTick()
      expect(sideMenuProps!.rangeRingsActive).toBe(true)
    })

    it('follows a place-names change made on another map or in Settings', async () => {
      const basemapStore = useBasemapStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      await nextTick()

      basemapStore.setLayer('names', true)
      await nextTick()

      // Names are shared across domains, so this map follows the store rather
      // than only its own rail button.
      expect(namesSpies.setVisible).toHaveBeenCalledWith(true)
    })

    it('follows a terrain change made on another map or in Settings', async () => {
      const basemapStore = useBasemapStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      await nextTick()

      basemapStore.setLayer('terrain', true)
      await nextTick()
      expect(terrainSpies.setVisible).toHaveBeenCalledWith(true)
    })

    it('shows only the layer land.defaultLayers names, off by default', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      // The shipped default is ["repeaters"], and exactly one layer is ever
      // drawn — so APRS is explicitly switched off.
      expect(repeatersSpies.setVisible).toHaveBeenCalledWith(true)
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
    })

    it('shows the APRS layer when the config names it, with a receiver present', () => {
      const land = useLandStore()
      vi.spyOn(land, 'hydrateDefaultLayers').mockResolvedValue()
      land.defaultLayers = ['aprs']
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(true)
      expect(repeatersSpies.setVisible).toHaveBeenCalledWith(false)
    })

    it('loads the default-layers config and the repeater filters on mount', () => {
      const land = useLandStore()
      const layersSpy = vi.spyOn(land, 'hydrateDefaultLayers').mockResolvedValue()
      const filtersSpy = vi.spyOn(useRepeatersStore(), 'hydrateFiltersFromDb').mockResolvedValue()
      mountView()
      expect(layersSpy).toHaveBeenCalledOnce()
      expect(filtersSpy).toHaveBeenCalledOnce()
    })

    it('applies a later defaultLayers change to the APRS layer', async () => {
      const land = useLandStore()
      vi.spyOn(land, 'hydrateDefaultLayers').mockResolvedValue()
      land.defaultLayers = ['aprs']
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      aprsSpies.setVisible.mockClear()
      land.defaultLayers = [] // config now names no layer at all
      await nextTick()
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
    })

    it('applies a later defaultLayers change to the repeater layer', async () => {
      const land = useLandStore()
      vi.spyOn(land, 'hydrateDefaultLayers').mockResolvedValue()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      repeatersSpies.setVisible.mockClear()
      land.defaultLayers = ['aprs'] // the config swaps repeaters for APRS
      await nextTick()
      expect(repeatersSpies.setVisible).toHaveBeenCalledWith(false)
    })

    it('zoom buttons drive the map', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      ;(sideMenuProps!.zoomIn as () => void)()
      ;(sideMenuProps!.zoomOut as () => void)()
      expect(map.zoomIn).toHaveBeenCalledOnce()
      expect(map.zoomOut).toHaveBeenCalledOnce()
    })

    it('go-to-location flies to the user location, zooming in to at least the locate zoom', () => {
      locationState.location!.value = { lat: 55, lon: -1.5, accuracy: 10 }
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      ;(sideMenuProps!.goToLocation as () => void)()
      expect(map.flyTo).toHaveBeenCalledWith({ center: [-1.5, 55], zoom: 10 })
    })

    it('go-to-location does nothing without a fix', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      ;(sideMenuProps!.goToLocation as () => void)()
      expect(map.flyTo).not.toHaveBeenCalled()
    })

    it('toggling range rings drives the control and flips its active state', async () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      expect(sideMenuProps!.rangeRingsActive).toBe(false)
      ;(sideMenuProps!.toggleRangeRings as () => void)()
      await nextTick()
      expect(ringsSpies.handleClickPublic).toHaveBeenCalledOnce()
      expect(sideMenuProps!.rangeRingsActive).toBe(true)
    })

    // The rail no longer carries the data-layer buttons: the sidebar's FILTER
    // sub-tabs and Settings › LAND › Map Layers flip the store flags directly,
    // and the view drives each control off its flag. These replace the old
    // "toggling APRS from the rail" cases.
    it('follows an APRS layer switch made on the store', async () => {
      const land = useLandStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      aprsSpies.setVisible.mockClear()

      land.selectLayer('aprs')
      await nextTick()
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(true)

      aprsSpies.setVisible.mockClear()
      land.setAprsLayerVisible(false)
      await nextTick()
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
    })

    it('keeps the APRS layer off when its flag goes on with no receiver', async () => {
      const land = useLandStore()
      useSdrStore().setAprsRadioId(null)
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      aprsSpies.setVisible.mockClear()

      land.setAprsLayerVisible(true)
      await nextTick()
      // Nothing is decoding, so the flag alone must not light the layer.
      expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
      expect(aprsSpies.setVisible).not.toHaveBeenCalledWith(true)
    })

    it('follows a repeaters layer switch made on the store', async () => {
      const land = useLandStore()
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      // Let the watcher settle on the config-driven "on" before switching it
      // off, so the assertion below reads the switch and not the initial state.
      await nextTick()
      repeatersSpies.setVisible.mockClear()

      land.setRepeatersLayerVisible(false)
      await nextTick()
      expect(repeatersSpies.setVisible).toHaveBeenCalledWith(false)

      repeatersSpies.setVisible.mockClear()
      land.selectLayer('repeaters')
      await nextTick()
      expect(repeatersSpies.setVisible).toHaveBeenCalledWith(true)
    })

    it('initialises the shared location-names and roads controls on the map', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      expect(namesSpies.onAdd).toHaveBeenCalledWith(map)
      expect(roadsSpies.onAdd).toHaveBeenCalledWith(map)
      expect(terrainSpies.onAdd).toHaveBeenCalledWith(map)
    })

    // LOCATION NAMES left the rail for Settings, so the view no longer passes a
    // toggle down — it only follows the shared basemap store (covered by
    // "follows a place-names change made on another map or in Settings" above).
    // What still needs proving is that a store change arriving before the map
    // exists is harmless, since the control is null until map-created.
    it('does nothing when a base-map layer changes before the map exists', async () => {
      const basemapStore = useBasemapStore()
      mountView()
      basemapStore.setLayer('names', true)
      basemapStore.setLayer('terrain', true)
      await nextTick()
      expect(namesSpies.setVisible).not.toHaveBeenCalled()
      expect(terrainSpies.setVisible).not.toHaveBeenCalled()
    })

    it('does nothing when a data layer changes before the map exists', async () => {
      const land = useLandStore()
      mountView()
      land.selectLayer('aprs')
      await nextTick()
      expect(aprsSpies.setVisible).not.toHaveBeenCalled()
    })

    it('re-asserts the base-map layer visibility on every style load', () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      namesSpies.applyVisibility.mockClear()
      roadsSpies.applyVisibility.mockClear()
      terrainSpies.initLayers.mockClear()
      // A fresh style ships its own layer visibilities (and drops the terrain
      // overlay's sources/layers), so all three must reapply.
      shared.emit!('style-loaded', map)
      expect(namesSpies.applyVisibility).toHaveBeenCalledOnce()
      expect(roadsSpies.applyVisibility).toHaveBeenCalledOnce()
      expect(terrainSpies.initLayers).toHaveBeenCalledOnce()
      shared.emit!('style-loaded', map)
      expect(namesSpies.applyVisibility).toHaveBeenCalledTimes(2)
      expect(roadsSpies.applyVisibility).toHaveBeenCalledTimes(2)
      expect(terrainSpies.initLayers).toHaveBeenCalledTimes(2)
    })

    it('updates the marker + range-rings centre when a location fix arrives', async () => {
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map) // controls now exist
      // A GPS fix arrives after the map + controls are ready (real-world order).
      locationState.location!.value = { lat: 55, lon: -1.5, accuracy: 10 }
      await nextTick()
      expect(markerSpies.update).toHaveBeenCalledWith(-1.5, 55)
      // The rings follow the ring origin, which defaults to the operator.
      expect(ringsSpies.setOrigin).toHaveBeenCalledWith(
        expect.objectContaining({ longitude: -1.5, latitude: 55, kind: 'user' }),
      )
    })

    it('removes the marker when the location is cleared', async () => {
      locationState.location!.value = { lat: 55, lon: -1.5, accuracy: 10 }
      const map = makeFakeMap()
      mountView()
      shared.emit!('map-created', map)
      markerSpies.remove.mockClear()
      locationState.location!.value = null
      await nextTick()
      expect(markerSpies.remove).toHaveBeenCalled()
      expect(ringsSpies.setOrigin).toHaveBeenCalledWith(null)
    })

    it('tears down the controls and marker on unmount', () => {
      const map = makeFakeMap()
      const wrapper = mountView()
      shared.emit!('map-created', map)
      wrapper.unmount()
      expect(ringsSpies.onRemove).toHaveBeenCalledOnce()
      expect(aprsSpies.onRemove).toHaveBeenCalledOnce()
      expect(repeatersSpies.onRemove).toHaveBeenCalledOnce()
      expect(namesSpies.onRemove).toHaveBeenCalledOnce()
      expect(terrainSpies.onRemove).toHaveBeenCalledOnce()
      expect(roadsSpies.onRemove).toHaveBeenCalledOnce()
      expect(markerSpies.remove).toHaveBeenCalled()
    })

    it('unmounts cleanly when no map was ever created', () => {
      const wrapper = mountView()
      expect(() => wrapper.unmount()).not.toThrow()
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
})

// The APRS layer only has data behind it when a radio is named as the APRS
// receiver in Settings → LAND. Without one the layer is forced off whatever the
// config or the Settings switch says, rather than drawing a permanently empty
// layer. (The rail no longer carries an APRS button, so there is no prop to
// report the missing receiver with — the gate is the forced-off layer itself.)
describe('LandView — APRS with no receiver', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSdrStore().setAprsRadioId(null)
    vi.spyOn(useRepeatersStore(), 'hydrateFiltersFromDb').mockResolvedValue()
    // The config names APRS, so only the missing receiver can hold it off.
    const land = useLandStore()
    vi.spyOn(land, 'hydrateDefaultLayers').mockResolvedValue()
    land.defaultLayers = ['aprs']
    vi.clearAllMocks()
    shared.emit = null
    sideMenuProps = null
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('keeps the layer off even though the config asks for it', () => {
    const map = makeFakeMap()
    mountView()
    shared.emit!('map-created', map)

    expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
    expect(aprsSpies.setVisible).not.toHaveBeenCalledWith(true)
  })

  it('brings the layer back when a receiver is chosen', async () => {
    const map = makeFakeMap()
    mountView()
    shared.emit!('map-created', map)
    aprsSpies.setVisible.mockClear()

    useSdrStore().setAprsRadioId(3)
    await nextTick()

    expect(aprsSpies.setVisible).toHaveBeenCalledWith(true)
  })

  it('drops the layer again if the receiver is cleared', async () => {
    useSdrStore().setAprsRadioId(3)
    const map = makeFakeMap()
    mountView()
    shared.emit!('map-created', map)
    aprsSpies.setVisible.mockClear()

    useSdrStore().setAprsRadioId(null)
    await nextTick()

    expect(aprsSpies.setVisible).toHaveBeenCalledWith(false)
  })

  it('reads the decoding radio back from the database on mount', () => {
    const spy = vi.spyOn(useSdrStore(), 'hydrateAprsFromDb').mockResolvedValue()
    mountView()
    expect(spy).toHaveBeenCalledOnce()
  })
})
