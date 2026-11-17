import { describe, it, expect, beforeEach } from 'vitest'
import { MIN_VISIBLE_MAP_WIDTH_PX, mapChromeInsets } from './mapChromeInsets'

// jsdom does no layout: every offset and box is zero. Each piece of chrome is
// given the laid-out position the browser would report, and the map container
// the box it fills.

/** Adds a chrome element with the layout offsets a browser would report. */
function addChrome(id: string, offsetLeft: number, offsetWidth: number, classes: string[] = []) {
  const element = document.createElement('div')
  element.id = id
  element.classList.add(...classes)
  Object.defineProperty(element, 'offsetLeft', { value: offsetLeft })
  Object.defineProperty(element, 'offsetWidth', { value: offsetWidth })
  document.body.appendChild(element)
  return element
}

/** A map container whose box spans `left`..`left + width` of the window. */
function mapContainer(left: number, width: number): HTMLElement {
  const container = document.createElement('div')
  container.getBoundingClientRect = () =>
    ({ left, right: left + width, width, top: 0, bottom: 800, height: 800 }) as DOMRect
  return container
}

const WINDOW_WIDTH = 1440

/** The desktop shell: 44px icon rail, 386px panel beside it, 44px controls rail. */
function addDesktopChrome(panelClasses: string[] = []) {
  addChrome('map-sidebar-rail', 0, 44)
  addChrome('map-sidebar', 44, 386, panelClasses)
  addChrome('side-menu', WINDOW_WIDTH - 44, 44)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('shell/mapChromeInsets', () => {
  it('reports no insets when no chrome is on the page', () => {
    expect(mapChromeInsets(mapContainer(0, WINDOW_WIDTH))).toEqual({ left: 0, right: 0 })
  })

  it('covers the icon rail and the open panel on the left, the controls rail on the right', () => {
    addDesktopChrome()
    expect(mapChromeInsets(mapContainer(0, WINDOW_WIDTH))).toEqual({ left: 430, right: 44 })
  })

  it('leaves out the panel while it is slid away', () => {
    addDesktopChrome(['msb-hidden'])
    expect(mapChromeInsets(mapContainer(0, WINDOW_WIDTH))).toEqual({ left: 44, right: 44 })
  })

  it('leaves out chrome that is not laid out (display: none)', () => {
    addChrome('map-sidebar-rail', 0, 44)
    addChrome('map-sidebar', 44, 0)
    addChrome('side-menu', WINDOW_WIDTH - 44, 0)
    expect(mapChromeInsets(mapContainer(0, WINDOW_WIDTH))).toEqual({ left: 44, right: 0 })
  })

  it.each(['space-side-menu', 'sea-side-menu'])('finds the %s controls rail', (railId) => {
    addChrome(railId, WINDOW_WIDTH - 60, 60)
    expect(mapChromeInsets(mapContainer(0, WINDOW_WIDTH))).toEqual({ left: 0, right: 60 })
  })

  it('measures against the map container, not the window', () => {
    addDesktopChrome()
    // A map starting 100px in and ending 140px short of the window's right edge.
    expect(mapChromeInsets(mapContainer(100, WINDOW_WIDTH - 240))).toEqual({
      left: 330,
      right: 0,
    })
  })

  it('treats a full-width drawer as covering nothing, so the move uses the whole map', () => {
    addChrome('map-sidebar', 0, 390)
    expect(mapChromeInsets(mapContainer(0, 390))).toEqual({ left: 0, right: 0 })
  })

  it('keeps the insets when exactly the minimum width of map stays visible', () => {
    addChrome('map-sidebar', 0, 300)
    expect(mapChromeInsets(mapContainer(0, 300 + MIN_VISIBLE_MAP_WIDTH_PX))).toEqual({
      left: 300,
      right: 0,
    })
  })

  it('drops the insets one pixel below the minimum visible width', () => {
    addChrome('map-sidebar', 0, 300)
    expect(mapChromeInsets(mapContainer(0, 300 + MIN_VISIBLE_MAP_WIDTH_PX - 1))).toEqual({
      left: 0,
      right: 0,
    })
  })
})
