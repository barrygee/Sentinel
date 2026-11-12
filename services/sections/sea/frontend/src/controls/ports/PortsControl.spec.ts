import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type {
  SiteMarker,
  SiteMarkersOptions,
} from '@sentinel/map-kit/controls/site-markers/SiteMarkers'

/**
 * The Sea map's ports, drawn the way the Air map draws civil airports: the
 * shared map-kit `SiteMarkers` (whose own spec covers drawing, hover and
 * pinning). What is the ports control's own is which sites it hands over, the
 * layers it sits under, what a click opens and the store flag it follows.
 */

interface FakeSiteMarkers {
  map: unknown
  sites: readonly SiteMarker[]
  options: SiteMarkersOptions
  attach: ReturnType<typeof vi.fn>
  setVisible: ReturnType<typeof vi.fn>
}

const siteMarkers = vi.hoisted(() => ({ instances: [] as FakeSiteMarkers[] }))

vi.mock('@sentinel/map-kit/controls/site-markers/SiteMarkers', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@sentinel/map-kit/controls/site-markers/SiteMarkers')>()
  // A regular function (not an arrow) so `new SiteMarkers(...)` constructs.
  function SiteMarkers(
    this: FakeSiteMarkers,
    map: unknown,
    sites: readonly SiteMarker[],
    options: SiteMarkersOptions,
  ) {
    this.map = map
    this.sites = sites
    this.options = options
    this.attach = vi.fn(() => Promise.resolve())
    this.setVisible = vi.fn()
    siteMarkers.instances.push(this)
  }
  return { ...original, SiteMarkers }
})

import { PortsControl, PORT_LAYER_ID, PORT_OPEN_LABEL_LAYER_ID } from './PortsControl'
import { PORTS_DATA } from './portsData'
import { useSeaStore } from '../../stores/sea'

describe('PortsControl', () => {
  let store: ReturnType<typeof useSeaStore>

  beforeEach(() => {
    siteMarkers.instances.length = 0
    setActivePinia(createPinia())
    localStorage.clear()
    store = useSeaStore()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  function addControl() {
    const control = new PortsControl(store)
    const map = { name: 'fake map' }
    const container = control.onAdd(map as never)
    document.body.appendChild(container)
    return { control, map, markers: () => siteMarkers.instances[0]! }
  }

  it('describes itself with an icon and an accessible title', () => {
    const { control } = addControl()
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect(control.buttonTitle).toBe('Toggle ports')
    expect(control.button.getAttribute('aria-label')).toBe('Toggle ports')
  })

  it('hands every port to the site markers, coded by its UN/LOCODE', () => {
    const { map, markers } = addControl()
    expect(siteMarkers.instances).toHaveLength(1)
    expect(markers().map).toBe(map)
    expect(markers().sites).toHaveLength(PORTS_DATA.features.length)
    const port = PORTS_DATA.features[0]!
    expect(markers().sites[0]).toMatchObject({
      code: port.properties.locode,
      name: port.properties.name,
      coordinates: port.geometry.coordinates,
    })
    expect(markers().attach).toHaveBeenCalledOnce()
  })

  it('uses the civil airport look, beneath the vessels, which keep the pointer', () => {
    const { markers } = addControl()
    expect(markers().options).toEqual({
      dotLayerId: PORT_LAYER_ID,
      labelLayerId: PORT_OPEN_LABEL_LAYER_ID,
      colours: { closedDot: '#000000', accent: '#00aaff', block: '#002244' },
      beneathLayerId: 'sea-vessel-track-line',
      priorityLayerId: 'sea-vessel-hit',
    })
    expect(PORT_LAYER_ID).toBe('sea-ports')
    expect(PORT_OPEN_LABEL_LAYER_ID).toBe('sea-ports-open')
  })

  it("opens the clicked port's accordion in the side panel", () => {
    const { markers } = addControl()
    const opened = vi.fn()
    document.addEventListener('sea-open-port', opened)

    markers().sites[1]!.onClick()

    document.removeEventListener('sea-open-port', opened)
    expect(opened).toHaveBeenCalledOnce()
    expect((opened.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      locode: PORTS_DATA.features[1]!.properties.locode,
    })
  })

  it('shows the ports when the store flag starts on', () => {
    const { control, markers } = addControl()
    expect(markers().setVisible).toHaveBeenLastCalledWith(true)
    expect(control.button.style.opacity).toBe('1')
  })

  it('keeps the ports hidden when the store flag starts off', () => {
    store.setOverlay('ports', false)
    const { control, markers } = addControl()
    expect(markers().setVisible).toHaveBeenLastCalledWith(false)
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('toggles through the store, from the button and the side menu alike', () => {
    const { control, markers } = addControl()

    control.button.click()
    expect(store.overlayStates.ports).toBe(false)
    expect(markers().setVisible).toHaveBeenLastCalledWith(false)
    expect(control.button.style.opacity).toBe('0.3')

    control.toggle()
    expect(store.overlayStates.ports).toBe(true)
    expect(markers().setVisible).toHaveBeenLastCalledWith(true)
    expect(siteMarkers.instances).toHaveLength(1)
  })

  it('re-adds its layers after a style reload without rebuilding the markers', () => {
    const { control, markers } = addControl()
    control.initLayers()
    expect(siteMarkers.instances).toHaveLength(1)
    expect(markers().attach).toHaveBeenCalledTimes(2)
  })

  it('applies visibility safely before the markers exist', () => {
    const control = new PortsControl(store)
    expect(() => control.applyVisibility()).not.toThrow()
  })

  it('hides the ports on removal', () => {
    const { control, markers } = addControl()
    control.onRemove()
    expect(markers().setVisible).toHaveBeenLastCalledWith(false)
    expect(document.body.contains(control.button)).toBe(false)
  })

  it('removes cleanly when its layers were never built', () => {
    const control = new PortsControl(store)
    expect(() => control.onRemove()).not.toThrow()
  })
})
