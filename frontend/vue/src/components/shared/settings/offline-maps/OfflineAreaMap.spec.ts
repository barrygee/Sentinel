import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

const mapRegistry = vi.hoisted(() => ({ instances: [] as FakeMap[], controls: [] as unknown[] }))

interface FakeMap {
  options: Record<string, unknown>
  handlers: Record<string, (event?: unknown) => void>
  scrollZoom: { disable: ReturnType<typeof vi.fn> }
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  addControl: ReturnType<typeof vi.fn>
  setStyle: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  getBounds: ReturnType<typeof vi.fn>
  sources: Map<string, { setData: ReturnType<typeof vi.fn> }>
  layers: Set<string>
  getSource: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
}

vi.mock('maplibre-gl', () => {
  // Captured before the fake constructor below shadows the global `Map` name
  // inside its own function body (a `function Map` declaration's name binds
  // inside its own scope — using the bare `Map`/`Set` identifiers there would
  // recurse into the fake constructor instead of the built-ins).
  const NativeMap = globalThis.Map
  const NativeSet = globalThis.Set
  function Map(this: FakeMap, options: Record<string, unknown>) {
    this.options = options
    this.handlers = {}
    this.scrollZoom = { disable: vi.fn() }
    this.sources = new NativeMap()
    this.layers = new NativeSet()
    this.on = vi.fn((event: string, callback: (event?: unknown) => void) => {
      this.handlers[event] = callback
    })
    this.off = vi.fn()
    this.addControl = vi.fn((control: unknown) => mapRegistry.controls.push(control))
    this.setStyle = vi.fn()
    this.resize = vi.fn()
    this.remove = vi.fn()
    this.fitBounds = vi.fn()
    this.getBounds = vi.fn(() => ({
      getWest: () => -5,
      getSouth: () => 50,
      getEast: () => 0,
      getNorth: () => 55,
    }))
    this.getSource = vi.fn((id: string) => this.sources.get(id))
    this.getLayer = vi.fn((id: string) => (this.layers.has(id) ? { id } : undefined))
    this.addSource = vi.fn((id: string) => this.sources.set(id, { setData: vi.fn() }))
    this.addLayer = vi.fn((layer: { id: string }) => this.layers.add(layer.id))
    mapRegistry.instances.push(this)
  }
  function NavigationControl(this: Record<string, unknown>, options: Record<string, unknown>) {
    this.options = options
  }
  return { Map, NavigationControl }
})

import OfflineAreaMap from './OfflineAreaMap.vue'
import { useThemeStore } from '@/stores/theme'

function currentMap(): FakeMap {
  return mapRegistry.instances[mapRegistry.instances.length - 1]!
}

const SELECTION_SOURCE = 'offline-area-selection'
const REGIONS_SOURCE = 'offline-area-regions'
const CORNERS_SOURCE = 'offline-area-corners'
const REGIONS_LAYER = 'offline-area-regions-line'

const REGION_A = { west: -2, south: 51, east: -1, north: 52 }
const REGION_B = { west: 1, south: 53, east: 2, north: 54 }

function mountMap(
  props: { selection?: typeof REGION_A | null; regions?: (typeof REGION_A)[] } = {},
) {
  return mount(OfflineAreaMap, {
    props: { selection: props.selection ?? null, regions: props.regions ?? [] },
  })
}

async function loadStyle() {
  currentMap().handlers['style.load']!()
  await Promise.resolve() // let the rAF-throttled setSelectionPreview's callback run
  vi.runAllTimers()
}

describe('OfflineAreaMap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mapRegistry.instances.length = 0
    mapRegistry.controls.length = 0
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    // jsdom ships no matchMedia at all; default to "no reduced-motion
    // preference" so flyToBounds()'s default-duration path can be tested
    // without every test having to stub it individually.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.mapTheme
  })

  it('builds the map on the online basemap for the current theme, with scroll-zoom off and the +/- control', () => {
    mountMap()
    const map = currentMap()
    expect(map.setStyle).toHaveBeenCalledWith('/assets/fiord-online.json', expect.anything())
    expect(map.scrollZoom.disable).toHaveBeenCalled()
    expect(mapRegistry.controls).toHaveLength(1)
  })

  it('rebuilds onto the other theme basemap when the theme changes', async () => {
    const wrapper = mountMap()
    useThemeStore().setMapTheme('light')
    await wrapper.vm.$nextTick()
    expect(currentMap().setStyle).toHaveBeenLastCalledWith(
      '/assets/positron-online.json',
      expect.anything(),
    )
  })

  it('resizes once the map load event fires', () => {
    mountMap()
    const map = currentMap()
    expect(map.resize).not.toHaveBeenCalled()
    map.handlers.load!()
    expect(map.resize).toHaveBeenCalled()
  })

  describe('what the map shows', () => {
    it('starts on a single copy of the whole world', () => {
      mountMap()
      const map = currentMap()
      expect(map.options).toMatchObject({ bounds: [-180, -85, 180, 85], renderWorldCopies: false })
      map.handlers.load!()
      expect(map.fitBounds).toHaveBeenCalledWith([-180, -85, 180, 85], { padding: 0, duration: 0 })
    })

    it('opens framed on an already-selected area, in full', () => {
      mountMap({ selection: REGION_A })
      const map = currentMap()
      map.handlers.load!()
      expect(map.fitBounds).toHaveBeenCalledWith(
        [REGION_A.west, REGION_A.south, REGION_A.east, REGION_A.north],
        { padding: 32, duration: 0 },
      )
    })

    it('opens zoomed to fit every downloaded area', () => {
      mountMap({ regions: [REGION_A, REGION_B] })
      const map = currentMap()
      map.handlers.load!()
      expect(map.fitBounds).toHaveBeenCalledWith(
        [REGION_A.west, REGION_A.south, REGION_B.east, REGION_B.north],
        { padding: 32, duration: 0 },
      )
    })

    it('fits the selected area and the downloaded areas together', () => {
      const selection = { west: -6, south: 49, east: -4, north: 50 }
      mountMap({ selection, regions: [REGION_B] })
      const map = currentMap()
      map.handlers.load!()
      expect(map.fitBounds).toHaveBeenCalledWith(
        [selection.west, selection.south, REGION_B.east, REGION_B.north],
        { padding: 32, duration: 0 },
      )
    })

    it('re-frames when the downloaded areas arrive after the map has loaded', async () => {
      const wrapper = mountMap({ regions: [] })
      const map = currentMap()
      map.handlers.load!()
      expect(map.fitBounds).toHaveBeenLastCalledWith([-180, -85, 180, 85], {
        padding: 0,
        duration: 0,
      })
      await wrapper.setProps({ regions: [REGION_A] })
      expect(map.fitBounds).toHaveBeenLastCalledWith(
        [REGION_A.west, REGION_A.south, REGION_A.east, REGION_A.north],
        { padding: 32, duration: 0 },
      )
    })

    it('never re-frames once the user has panned or zoomed', async () => {
      const wrapper = mountMap({ regions: [] })
      const map = currentMap()
      map.handlers.load!()
      map.handlers.movestart!({ originalEvent: new MouseEvent('mousedown') })
      map.fitBounds.mockClear()
      await wrapper.setProps({ regions: [REGION_A] })
      expect(map.fitBounds).not.toHaveBeenCalled()
    })

    it('keeps re-framing after its own programmatic moves (no originalEvent)', async () => {
      const wrapper = mountMap({ regions: [] })
      const map = currentMap()
      map.handlers.load!()
      map.handlers.movestart!({})
      await wrapper.setProps({ regions: [REGION_A] })
      expect(map.fitBounds).toHaveBeenLastCalledWith(
        [REGION_A.west, REGION_A.south, REGION_A.east, REGION_A.north],
        { padding: 32, duration: 0 },
      )
    })

    it('re-frames when the map grows (the panel animating open), until the user moves it', () => {
      mountMap({ regions: [REGION_A] })
      const map = currentMap()
      map.handlers.load!()
      map.fitBounds.mockClear()
      map.handlers.resize!()
      expect(map.fitBounds).toHaveBeenCalledTimes(1)
      map.handlers.movestart!({ originalEvent: new MouseEvent('mousedown') })
      map.handlers.resize!()
      expect(map.fitBounds).toHaveBeenCalledTimes(1)
    })

    it('ignores a load event that arrives after the map was torn down', () => {
      const wrapper = mountMap()
      const map = currentMap()
      const lateLoad = map.handlers.load!
      wrapper.unmount()
      lateLoad()
      expect(map.fitBounds).not.toHaveBeenCalled()
    })

    it('brings a newly selected area into view when it is off-screen', async () => {
      // The fake map's view is 5°W–0°, 50–55°N; this area is well outside it.
      const wrapper = mountMap({ selection: null })
      const map = currentMap()
      await wrapper.setProps({ selection: { west: 113, south: -38, east: 153, north: -12 } })
      expect(map.fitBounds).toHaveBeenCalledWith([113, -38, 153, -12], {
        padding: 32,
        duration: 600,
      })
    })

    it('jumps rather than glides to an off-screen area when reduced motion is preferred', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const wrapper = mountMap({ selection: null })
      const map = currentMap()
      await wrapper.setProps({ selection: { west: 113, south: -38, east: 153, north: -12 } })
      expect(map.fitBounds).toHaveBeenCalledWith([113, -38, 153, -12], { padding: 32, duration: 0 })
    })

    it('leaves the view alone when the new area is already fully visible', async () => {
      const wrapper = mountMap({ selection: null })
      const map = currentMap()
      await wrapper.setProps({ selection: { west: -4, south: 51, east: -1, north: 54 } })
      expect(map.fitBounds).not.toHaveBeenCalled()
    })

    it('does not move when the selection is cleared', async () => {
      const wrapper = mountMap({ selection: REGION_A })
      const map = currentMap()
      await wrapper.setProps({ selection: null })
      expect(map.fitBounds).not.toHaveBeenCalled()
    })
  })

  it('(re)builds the selection and regions sources/layers on every style.load', async () => {
    mountMap()
    await loadStyle()
    const map = currentMap()
    expect(map.sources.has(SELECTION_SOURCE)).toBe(true)
    expect(map.sources.has(REGIONS_SOURCE)).toBe(true)

    // A second style.load (a theme swap wiping the style) must not blow up
    // trying to re-add an existing source/layer.
    map.addSource.mockClear()
    await loadStyle()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('renders the drawn/committed selection as a dashed polygon feature', async () => {
    const wrapper = mountMap({ selection: REGION_A })
    await loadStyle()
    const map = currentMap()
    const data = map.sources.get(SELECTION_SOURCE)!.setData.mock.calls.at(-1)![0]
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry.coordinates[0]).toEqual([
      [REGION_A.west, REGION_A.south],
      [REGION_A.east, REGION_A.south],
      [REGION_A.east, REGION_A.north],
      [REGION_A.west, REGION_A.north],
      [REGION_A.west, REGION_A.south],
    ])
    void wrapper
  })

  it('draws a grab handle on each of the four selection corners, and none without a selection', async () => {
    const wrapper = mountMap({ selection: REGION_A })
    await loadStyle()
    const map = currentMap()
    const cornerData = map.sources.get(CORNERS_SOURCE)!.setData.mock.calls.at(-1)![0]
    expect(
      cornerData.features.map(
        (feature: { geometry: { coordinates: number[] } }) => feature.geometry.coordinates,
      ),
    ).toEqual([
      [REGION_A.west, REGION_A.north],
      [REGION_A.east, REGION_A.north],
      [REGION_A.east, REGION_A.south],
      [REGION_A.west, REGION_A.south],
    ])
    await wrapper.setProps({ selection: null })
    expect(map.sources.get(CORNERS_SOURCE)!.setData.mock.calls.at(-1)![0].features).toEqual([])
  })

  describe('resizing the selection by its corners', () => {
    // A flat stand-in projection: 100px per degree, y growing southwards, so the
    // corners of the one-degree test region sit well apart on screen.
    const projectToScreen = ([longitude, latitude]: [number, number]) => ({
      x: longitude * 100,
      y: -latitude * 100,
    })

    function prepareMapForResize() {
      const map = currentMap()
      const canvas = document.createElement('canvas')
      Object.assign(map, {
        project: projectToScreen,
        getCanvas: () => canvas,
        dragPan: { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() },
        boxZoom: { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() },
        dragRotate: { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() },
        touchZoomRotate: { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() },
      })
      return map
    }

    function mouseDownAt(point: { x: number; y: number }) {
      return { originalEvent: { button: 0 }, point, preventDefault: vi.fn() }
    }

    it('dragging the north-east corner emits the resized area, south-west held fixed', async () => {
      const wrapper = mountMap({ selection: REGION_A })
      await loadStyle()
      const map = prepareMapForResize()
      const northEast = projectToScreen([REGION_A.east, REGION_A.north])

      const downEvent = mouseDownAt(northEast)
      map.handlers['mousedown']!(downEvent)
      expect(downEvent.preventDefault).toHaveBeenCalled()
      map.handlers['mousemove']!({
        lngLat: { lng: 1, lat: 53 },
        point: { x: 10, y: -530 },
      })
      window.dispatchEvent(new Event('mouseup'))

      expect(wrapper.emitted('draw-complete')![0]![0]).toEqual({
        west: REGION_A.west,
        south: REGION_A.south,
        east: 1,
        north: 53,
      })
    })

    it('does not start a resize while a new rectangle is being drawn', async () => {
      const wrapper = mountMap({ selection: REGION_A })
      await loadStyle()
      const map = prepareMapForResize()
      ;(wrapper.vm as unknown as { armDraw: () => void }).armDraw()

      const downEvent = mouseDownAt(projectToScreen([REGION_A.east, REGION_A.north]))
      map.handlers['mousedown']!(downEvent)
      expect(downEvent.preventDefault).not.toHaveBeenCalled()
    })
  })

  it('updates the selection preview when the selection prop changes', async () => {
    const wrapper = mountMap({ selection: null })
    await loadStyle()
    const map = currentMap()
    await wrapper.setProps({ selection: REGION_A })
    const data = map.sources.get(SELECTION_SOURCE)!.setData.mock.calls.at(-1)![0]
    expect(data.features).toHaveLength(1)
  })

  it('renders every completed region as a solid outline, rebuilt when the regions prop changes', async () => {
    const wrapper = mountMap({ regions: [REGION_A] })
    await loadStyle()
    const map = currentMap()
    expect(map.sources.get(REGIONS_SOURCE)!.setData.mock.calls.at(-1)![0].features).toHaveLength(1)
    await wrapper.setProps({ regions: [REGION_A, REGION_B] })
    expect(map.sources.get(REGIONS_SOURCE)!.setData.mock.calls.at(-1)![0].features).toHaveLength(2)
  })

  describe('exposed imperative surface', () => {
    it('armDraw()/cancelDraw() proxy to the internal RectangleDrawHandler', async () => {
      const wrapper = mountMap()
      const map = currentMap()
      // Arming disables dragPan etc. — proof the real handler was wired to the real map.
      const dragPan = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const boxZoom = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const dragRotate = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const touchZoomRotate = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      Object.assign(map, {
        dragPan,
        boxZoom,
        dragRotate,
        touchZoomRotate,
        getCanvas: () => document.createElement('canvas'),
      })
      ;(wrapper.vm as unknown as { armDraw: () => void }).armDraw()
      expect(dragPan.disable).toHaveBeenCalled()
      ;(wrapper.vm as unknown as { cancelDraw: () => void }).cancelDraw()
      expect(dragPan.enable).toHaveBeenCalled()
    })

    it('emits draw-complete once a full drag on the map canvas finishes', () => {
      const wrapper = mountMap()
      const map = currentMap()
      const canvas = document.createElement('canvas')
      // jsdom has no layout engine (offsetX/Y are always 0) and implements
      // neither setPointerCapture — stand both in so the real
      // RectangleDrawHandler wired up by OfflineAreaMap can run unmodified.
      canvas.setPointerCapture = vi.fn()
      const dragPan = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const boxZoom = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const dragRotate = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      const touchZoomRotate = { isEnabled: () => true, enable: vi.fn(), disable: vi.fn() }
      Object.assign(map, {
        dragPan,
        boxZoom,
        dragRotate,
        touchZoomRotate,
        getCanvas: () => canvas,
        unproject: ([x, y]: [number, number]) => ({ lng: x, lat: y }),
      })

      function pointerEventAt(type: string, x: number, y: number): PointerEvent {
        const event = new PointerEvent(type, { isPrimary: true, button: 0, pointerId: 1 })
        Object.defineProperty(event, 'offsetX', { value: x })
        Object.defineProperty(event, 'offsetY', { value: y })
        Object.defineProperty(event, 'clientX', { value: x })
        Object.defineProperty(event, 'clientY', { value: y })
        return event
      }

      ;(wrapper.vm as unknown as { armDraw: () => void }).armDraw()
      canvas.dispatchEvent(pointerEventAt('pointerdown', 0, 0))
      canvas.dispatchEvent(pointerEventAt('pointerup', 30, 30))

      const emitted = wrapper.emitted('draw-complete')
      expect(emitted).toHaveLength(1)
      expect(emitted![0]![0]).toEqual({ west: 0, south: 0, east: 30, north: 30 })
    })

    it('currentViewBounds() reads and clamps the map bounds to the Web Mercator limit', () => {
      const wrapper = mountMap()
      const map = currentMap()
      map.getBounds = vi.fn(() => ({
        getWest: () => -5,
        getSouth: () => -90,
        getEast: () => 0,
        getNorth: () => 90,
      }))
      const bounds = (
        wrapper.vm as unknown as { currentViewBounds: () => typeof REGION_A | null }
      ).currentViewBounds()
      expect(bounds).toEqual({
        west: -5,
        south: -85.05112877980659,
        east: 0,
        north: 85.05112877980659,
      })
    })

    it('currentViewBounds() clamps longitude to one world when zoomed out past it', () => {
      const wrapper = mountMap()
      const map = currentMap()
      map.getBounds = vi.fn(() => ({
        getWest: () => -250,
        getSouth: () => -60,
        getEast: () => 250,
        getNorth: () => 70,
      }))
      const bounds = (
        wrapper.vm as unknown as { currentViewBounds: () => typeof REGION_A | null }
      ).currentViewBounds()
      expect(bounds).toEqual({ west: -180, south: -60, east: 180, north: 70 })
    })

    it('currentViewBounds() returns null once the map has been torn down', () => {
      const wrapper = mountMap()
      const getCurrentViewBounds = (wrapper.vm as unknown as { currentViewBounds: () => unknown })
        .currentViewBounds
      wrapper.unmount()
      expect(getCurrentViewBounds()).toBeNull()
    })

    it('flyToBounds() calls fitBounds with a 600ms duration by default', () => {
      const wrapper = mountMap()
      const map = currentMap()
      ;(wrapper.vm as unknown as { flyToBounds: (bounds: typeof REGION_A) => void }).flyToBounds(
        REGION_A,
      )
      expect(map.fitBounds).toHaveBeenCalledWith(
        [REGION_A.west, REGION_A.south, REGION_A.east, REGION_A.north],
        { padding: 32, duration: 600 },
      )
    })

    it('flyToBounds() uses a 0ms duration when prefers-reduced-motion is set', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const wrapper = mountMap()
      const map = currentMap()
      ;(wrapper.vm as unknown as { flyToBounds: (bounds: typeof REGION_A) => void }).flyToBounds(
        REGION_A,
      )
      expect(map.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: 32, duration: 0 })
    })
  })

  it('tears the map down on unmount without a preview frame pending', () => {
    const wrapper = mountMap()
    const map = currentMap()
    wrapper.unmount()
    expect(map.remove).toHaveBeenCalled()
  })

  it('cancels a still-pending preview frame on unmount', async () => {
    const wrapper = mountMap()
    await loadStyle() // schedules (and, via the stub, resolves) a preview frame
    wrapper.unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('ignores a style.load that fires after the map has already been torn down', async () => {
    const wrapper = mountMap()
    const map = currentMap()
    const styleLoadHandler = map.handlers['style.load']!
    wrapper.unmount()
    // A real MapLibre instance can still fire an in-flight style.load shortly
    // after remove() races it — must be a no-op, not a crash on a null map.
    expect(() => styleLoadHandler()).not.toThrow()
  })

  it('paints the regions outline more subtly on a bright (light/colour) basemap than the dark one', async () => {
    // Goes through the theme store's own setter (not poking the dataset
    // attribute directly): the store re-applies its own dataset value the
    // moment `useThemeStore()` is instantiated (mounting the component does
    // this), which would otherwise clobber a directly-set attribute.
    useThemeStore().setMapTheme('colour')
    mountMap({ regions: [REGION_A] })
    await loadStyle()
    const brightMap = currentMap()
    const brightLayer = brightMap.addLayer.mock.calls.find(
      (call) => (call[0] as { id: string }).id === REGIONS_LAYER,
    )![0] as { paint: { 'line-opacity': number } }
    expect(brightLayer.paint['line-opacity']).toBe(0.35)

    useThemeStore().setMapTheme('dark')
    mountMap({ regions: [REGION_A] })
    await loadStyle()
    const darkMap = currentMap()
    const darkLayer = darkMap.addLayer.mock.calls.find(
      (call) => (call[0] as { id: string }).id === REGIONS_LAYER,
    )![0] as { paint: { 'line-opacity': number } }
    expect(darkLayer.paint['line-opacity']).toBe(0.45)
  })

  it('names the map region for screen readers', () => {
    const wrapper = mountMap()
    const region = wrapper.find('[role="region"]')
    expect(region.attributes('aria-label')).toContain('Map for choosing an offline download area')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountMap()
    const html = wrapper.html()
    vi.useRealTimers() // jest-axe's own internals need real timers to settle
    expect(await axe(html)).toHaveNoViolations()
  })
})
