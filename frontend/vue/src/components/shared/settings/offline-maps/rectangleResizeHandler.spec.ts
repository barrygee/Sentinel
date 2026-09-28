import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { RectangleResizeHandler } from './rectangleResizeHandler'
import type { LngLatBounds } from './rectangleDrawHandler'

type MapEventHandler = (event: unknown) => void

/** A flat stand-in projection: 100px per degree, y growing southwards. */
function projectToScreen([longitude, latitude]: [number, number]): { x: number; y: number } {
  return { x: longitude * 100, y: -latitude * 100 }
}

function makeFakeMap() {
  const handlers = new Map<string, MapEventHandler>()
  const canvas = document.createElement('canvas')
  const map = {
    on: vi.fn((eventName: string, handler: MapEventHandler) => handlers.set(eventName, handler)),
    off: vi.fn((eventName: string) => handlers.delete(eventName)),
    project: vi.fn(projectToScreen),
    getCanvas: () => canvas,
  }
  return { map: map as unknown as MapLibreGlMap, fakeMap: map, handlers, canvas }
}

const SELECTION: LngLatBounds = { west: -3, south: 53, east: -1, north: 55 }

function mouseDown(point: { x: number; y: number }, button = 0) {
  return { originalEvent: { button }, point, preventDefault: vi.fn() }
}

function mouseMove(longitude: number, latitude: number) {
  return {
    lngLat: { lng: longitude, lat: latitude },
    point: projectToScreen([longitude, latitude]),
  }
}

function touchStart(points: { x: number; y: number }[]) {
  return { points, preventDefault: vi.fn() }
}

function touchMove(longitude: number, latitude: number) {
  return { lngLat: { lng: longitude, lat: latitude }, preventDefault: vi.fn() }
}

describe('RectangleResizeHandler', () => {
  let fake: ReturnType<typeof makeFakeMap>
  let selection: LngLatBounds | null
  let blocked: boolean
  let onPreview: Mock<(bounds: LngLatBounds) => void>
  let onComplete: Mock<(bounds: LngLatBounds) => void>
  let handler: RectangleResizeHandler

  function fire(eventName: string, event: unknown): void {
    fake.handlers.get(eventName)?.(event)
  }

  beforeEach(() => {
    fake = makeFakeMap()
    selection = SELECTION
    blocked = false
    onPreview = vi.fn<(bounds: LngLatBounds) => void>()
    onComplete = vi.fn<(bounds: LngLatBounds) => void>()
    handler = new RectangleResizeHandler(fake.map, {
      getBounds: () => selection,
      isBlocked: () => blocked,
      onPreview,
      onComplete,
    })
    handler.enable()
  })

  afterEach(() => {
    handler.disable()
  })

  describe('enable/disable', () => {
    it('subscribes to the four map events once, however often it is enabled', () => {
      handler.enable()
      expect(fake.fakeMap.on).toHaveBeenCalledTimes(4)
      expect([...fake.handlers.keys()].sort()).toEqual(
        ['mousedown', 'mousemove', 'touchmove', 'touchstart'].sort(),
      )
    })

    it('unsubscribes on disable, and a second disable is a no-op', () => {
      handler.disable()
      expect(fake.fakeMap.off).toHaveBeenCalledTimes(4)
      handler.disable()
      expect(fake.fakeMap.off).toHaveBeenCalledTimes(4)
    })
  })

  describe('mouse', () => {
    it('drags the south-east corner with the north-west corner held fixed', () => {
      const downEvent = mouseDown(projectToScreen([SELECTION.east, SELECTION.south]))
      fire('mousedown', downEvent)
      expect(downEvent.preventDefault).toHaveBeenCalled()
      expect(handler.isResizing).toBe(true)

      fire('mousemove', mouseMove(0, 52))
      expect(onPreview).toHaveBeenLastCalledWith({ west: -3, south: 52, east: 0, north: 55 })
      expect(onComplete).not.toHaveBeenCalled()

      window.dispatchEvent(new Event('mouseup'))
      expect(onComplete).toHaveBeenCalledWith({ west: -3, south: 52, east: 0, north: 55 })
      expect(handler.isResizing).toBe(false)
    })

    it('flips the rectangle when a corner is dragged past the fixed one', () => {
      fire('mousedown', mouseDown(projectToScreen([SELECTION.west, SELECTION.north])))
      // North-west corner dragged beyond the south-east anchor (-1, 53).
      fire('mousemove', mouseMove(1, 51))
      window.dispatchEvent(new Event('mouseup'))
      expect(onComplete).toHaveBeenCalledWith({ west: -1, south: 51, east: 1, north: 53 })
    })

    it('clamps a dragged corner to the Web Mercator latitude limit', () => {
      fire('mousedown', mouseDown(projectToScreen([SELECTION.east, SELECTION.north])))
      fire('mousemove', mouseMove(0, 89))
      window.dispatchEvent(new Event('mouseup'))
      expect(onComplete.mock.calls[0]![0].north).toBeCloseTo(85.0511287798, 8)
    })

    it('ignores a press away from every corner, so the map can pan as usual', () => {
      const downEvent = mouseDown(projectToScreen([-2, 54]))
      fire('mousedown', downEvent)
      expect(downEvent.preventDefault).not.toHaveBeenCalled()
      expect(handler.isResizing).toBe(false)
    })

    it('ignores a non-left button', () => {
      const downEvent = mouseDown(projectToScreen([SELECTION.east, SELECTION.south]), 2)
      fire('mousedown', downEvent)
      expect(downEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('does nothing when there is no selection to resize', () => {
      selection = null
      const downEvent = mouseDown(projectToScreen([SELECTION.east, SELECTION.south]))
      fire('mousedown', downEvent)
      expect(downEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('does nothing while blocked (a new rectangle is being drawn)', () => {
      blocked = true
      const downEvent = mouseDown(projectToScreen([SELECTION.east, SELECTION.south]))
      fire('mousedown', downEvent)
      expect(downEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('grabs the nearest corner when more than one is in reach', () => {
      // A tiny rectangle: both northern corners are within the 10px grab radius.
      selection = { west: -2, south: 53.98, east: -1.95, north: 54 }
      fire('mousedown', mouseDown({ x: -196, y: -5400 }))
      fire('mousemove', mouseMove(0, 55))
      window.dispatchEvent(new Event('mouseup'))
      // The north-east corner moved; the south-west one stayed put.
      expect(onComplete).toHaveBeenCalledWith({ west: -2, south: 53.98, east: 0, north: 55 })
    })

    it('stops a drag without reporting it when disabled mid-drag', () => {
      fire('mousedown', mouseDown(projectToScreen([SELECTION.east, SELECTION.south])))
      handler.disable()
      window.dispatchEvent(new Event('mouseup'))
      expect(onComplete).not.toHaveBeenCalled()
      expect(handler.isResizing).toBe(false)
      expect(fake.canvas.style.cursor).toBe('')
    })
  })

  describe('hover cursor', () => {
    it('shows the diagonal that matches each corner', () => {
      const expectedCursors: [[number, number], string][] = [
        [[SELECTION.west, SELECTION.north], 'nwse-resize'],
        [[SELECTION.east, SELECTION.south], 'nwse-resize'],
        [[SELECTION.east, SELECTION.north], 'nesw-resize'],
        [[SELECTION.west, SELECTION.south], 'nesw-resize'],
      ]
      for (const [[longitude, latitude], cursor] of expectedCursors) {
        fire('mousemove', mouseMove(longitude, latitude))
        expect(fake.canvas.style.cursor).toBe(cursor)
      }
    })

    it('clears its own cursor when the pointer leaves a corner', () => {
      fire('mousemove', mouseMove(SELECTION.west, SELECTION.north))
      fire('mousemove', mouseMove(-2, 54))
      expect(fake.canvas.style.cursor).toBe('')
    })

    it("never clears a cursor it didn't set (e.g. the draw handler's crosshair)", () => {
      fake.canvas.style.cursor = 'crosshair'
      fire('mousemove', mouseMove(-2, 54))
      expect(fake.canvas.style.cursor).toBe('crosshair')
    })
  })

  describe('touch', () => {
    it('drags a corner with one finger and completes on touchend', () => {
      const startEvent = touchStart([projectToScreen([SELECTION.west, SELECTION.south])])
      fire('touchstart', startEvent)
      expect(startEvent.preventDefault).toHaveBeenCalled()

      const moveEvent = touchMove(-4, 52)
      fire('touchmove', moveEvent)
      expect(moveEvent.preventDefault).toHaveBeenCalled()

      window.dispatchEvent(new Event('touchend'))
      expect(onComplete).toHaveBeenCalledWith({ west: -4, south: 52, east: -1, north: 55 })
    })

    it('completes on touchcancel too', () => {
      fire('touchstart', touchStart([projectToScreen([SELECTION.west, SELECTION.south])]))
      window.dispatchEvent(new Event('touchcancel'))
      expect(onComplete).toHaveBeenCalledWith(SELECTION)
    })

    it('leaves a two-finger pinch to the map', () => {
      const startEvent = touchStart([
        projectToScreen([SELECTION.west, SELECTION.south]),
        projectToScreen([SELECTION.east, SELECTION.north]),
      ])
      fire('touchstart', startEvent)
      expect(startEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('ignores a touch away from every corner', () => {
      const startEvent = touchStart([projectToScreen([-2, 54])])
      fire('touchstart', startEvent)
      expect(startEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('ignores touchmove when no corner is being dragged', () => {
      const moveEvent = touchMove(-4, 52)
      fire('touchmove', moveEvent)
      expect(moveEvent.preventDefault).not.toHaveBeenCalled()
      expect(onPreview).not.toHaveBeenCalled()
    })
  })
})
