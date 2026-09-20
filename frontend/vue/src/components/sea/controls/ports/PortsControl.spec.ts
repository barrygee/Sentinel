import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

interface FakeMarker {
  options: { element: HTMLElement; anchor: string; offset: [number, number] }
  lngLat: [number, number] | null
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  // Regular function (not arrow) so `new Marker(...)` constructs correctly.
  function Marker(this: FakeMarker, options: FakeMarker['options']) {
    this.options = options
    this.lngLat = null
    this.addTo = vi.fn(() => this)
    this.remove = vi.fn(() => this)
    this.setLngLat = vi.fn((coordinates: [number, number]) => {
      this.lngLat = coordinates
      return this
    })
    markerRegistry.instances.push(this)
  }
  return { Marker }
})

import { PortsControl } from './PortsControl'
import { PORTS_DATA } from './portsData'
import { useSeaStore } from '@/stores/sea'

function makeFakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { getContainer: () => container }
}

describe('PortsControl', () => {
  let store: ReturnType<typeof useSeaStore>

  beforeEach(() => {
    markerRegistry.instances.length = 0
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
    const map = makeFakeMap()
    control.onAdd(map as never)
    return { control, map }
  }

  it('describes itself with an icon and an accessible title', () => {
    const { control } = addControl()
    expect(control.buttonLabel.startsWith('<svg')).toBe(true)
    expect(control.buttonTitle).toBe('Toggle ports')
    expect(control.button.getAttribute('aria-label')).toBe('Toggle ports')
  })

  it('builds one labelled marker per port and adds them all when the overlay is on', () => {
    const { control, map } = addControl()
    expect(markerRegistry.instances).toHaveLength(PORTS_DATA.features.length)
    const first = markerRegistry.instances[0]!
    const port = PORTS_DATA.features[0]!
    expect(first.lngLat).toEqual(port.geometry.coordinates)
    expect(first.options.anchor).toBe('top-left')
    expect(first.options.element.querySelector('.port-locode')?.textContent).toBe(
      port.properties.locode,
    )
    expect(first.options.element.querySelector('.port-name')?.textContent).toBe(
      port.properties.name.toUpperCase(),
    )
    for (const marker of markerRegistry.instances) {
      expect(marker.addTo).toHaveBeenCalledWith(map)
      expect(marker.remove).not.toHaveBeenCalled()
    }
    expect(control.visible).toBe(true)
    expect(control.button.style.opacity).toBe('1')
  })

  it('keeps the markers off the map when the store flag starts off', () => {
    store.setOverlay('ports', false)
    const { control } = addControl()
    for (const marker of markerRegistry.instances) {
      expect(marker.addTo).not.toHaveBeenCalled()
      expect(marker.remove).toHaveBeenCalled()
    }
    expect(control.visible).toBe(false)
  })

  it('toggles through the store and re-applies without rebuilding markers', () => {
    const { control, map } = addControl()
    const built = markerRegistry.instances.length
    control.toggle()
    expect(store.overlayStates.ports).toBe(false)
    expect(markerRegistry.instances[0]!.remove).toHaveBeenCalledOnce()
    // A style reload calls initLayers again — the DOM markers survive it.
    control.initLayers()
    expect(markerRegistry.instances).toHaveLength(built)
    // The store can also be written from elsewhere (rail / settings).
    store.setOverlay('ports', true)
    control.applyVisibility()
    expect(markerRegistry.instances[0]!.addTo).toHaveBeenCalledTimes(2)
    expect(markerRegistry.instances[0]!.addTo).toHaveBeenLastCalledWith(map)
    expect(control.visible).toBe(true)
  })

  it('applies visibility safely before the markers exist', () => {
    const control = new PortsControl(store)
    // onAdd not called — no map, no markers.
    Object.defineProperty(control, 'button', { value: document.createElement('button') })
    expect(() => control.applyVisibility()).not.toThrow()
  })

  it('announces the clicked port and swallows the click so the map does not get it', () => {
    addControl()
    const listener = vi.fn()
    document.addEventListener('sea-open-port', listener)
    const element = markerRegistry.instances[0]!.options.element
    const click = new MouseEvent('click', { bubbles: true })
    const stop = vi.spyOn(click, 'stopPropagation')
    element.dispatchEvent(click)
    expect(stop).toHaveBeenCalled()
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      locode: PORTS_DATA.features[0]!.properties.locode,
    })
    document.removeEventListener('sea-open-port', listener)
  })

  it('removes every marker on teardown and can be re-added afresh', () => {
    const { control } = addControl()
    control.onRemove()
    for (const marker of markerRegistry.instances) expect(marker.remove).toHaveBeenCalled()
    const built = markerRegistry.instances.length
    control.onAdd(makeFakeMap() as never)
    expect(markerRegistry.instances).toHaveLength(built * 2)
  })
})
