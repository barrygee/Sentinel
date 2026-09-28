import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import type { Map as MapLibreGlMap, LngLat } from 'maplibre-gl'
import { RectangleDrawHandler, type LngLatBounds } from './rectangleDrawHandler'

interface Toggle {
  isEnabled: Mock<() => boolean>
  enable: Mock<() => void>
  disable: Mock<() => void>
}

function makeToggle(initiallyEnabled: boolean): Toggle {
  let enabled = initiallyEnabled
  return {
    isEnabled: vi.fn(() => enabled),
    enable: vi.fn(() => {
      enabled = true
    }),
    disable: vi.fn(() => {
      enabled = false
    }),
  }
}

interface FakeCanvas {
  style: { cursor: string; touchAction: string }
  listeners: Map<string, Set<(event: never) => void>>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  setPointerCapture: ReturnType<typeof vi.fn>
  dispatch(type: string, event: Record<string, unknown>): void
}

function makeFakeCanvas(): FakeCanvas {
  const listeners = new Map<string, Set<(event: never) => void>>()
  const canvas: FakeCanvas = {
    style: { cursor: '', touchAction: '' },
    listeners,
    addEventListener: vi.fn((type: string, handler: (event: never) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
    }),
    removeEventListener: vi.fn((type: string, handler: (event: never) => void) => {
      listeners.get(type)?.delete(handler)
    }),
    setPointerCapture: vi.fn(),
    dispatch(type, event) {
      const handlers = listeners.get(type)
      if (!handlers) return
      for (const handler of [...handlers]) {
        handler({ currentTarget: canvas, ...event } as never)
      }
    },
  }
  return canvas
}

interface FakeMapBundle {
  map: MapLibreGlMap
  canvas: FakeCanvas
  dragPan: Toggle
  boxZoom: Toggle
  dragRotate: Toggle
  touchZoomRotate: Toggle
}

function makeFakeMap(): FakeMapBundle {
  const canvas = makeFakeCanvas()
  const dragPan = makeToggle(true)
  const boxZoom = makeToggle(true)
  const dragRotate = makeToggle(true)
  const touchZoomRotate = makeToggle(true)
  const map = {
    getCanvas: () => canvas as unknown as HTMLCanvasElement,
    dragPan,
    boxZoom,
    dragRotate,
    touchZoomRotate,
    // Deterministic: the "map" coordinate is simply (offsetX, offsetY) so
    // assertions can compare screen pixels to lng/lat directly.
    unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x, lat: y }) as unknown as LngLat),
  } as unknown as MapLibreGlMap
  return { map, canvas, dragPan, boxZoom, dragRotate, touchZoomRotate }
}

function pointerEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isPrimary: true,
    button: 0,
    pointerId: 1,
    offsetX: 0,
    offsetY: 0,
    clientX: 0,
    clientY: 0,
    ...overrides,
  }
}

describe('RectangleDrawHandler', () => {
  let bundle: FakeMapBundle
  let onComplete: Mock<(bounds: LngLatBounds) => void>
  let onPreview: Mock<(bounds: LngLatBounds | null) => void>
  let onArmedChange: Mock<(armed: boolean) => void>
  let handler: RectangleDrawHandler

  beforeEach(() => {
    bundle = makeFakeMap()
    onComplete = vi.fn<(bounds: LngLatBounds) => void>()
    onPreview = vi.fn<(bounds: LngLatBounds | null) => void>()
    onArmedChange = vi.fn<(armed: boolean) => void>()
    handler = new RectangleDrawHandler(bundle.map, { onComplete, onPreview, onArmedChange })
  })

  describe('arm/disarm', () => {
    it('is unarmed until arm() is called', () => {
      expect(handler.isArmed).toBe(false)
    })

    it('arming sets the crosshair cursor, disables the map handlers, and notifies armed=true', () => {
      handler.arm()
      expect(handler.isArmed).toBe(true)
      expect(bundle.canvas.style.cursor).toBe('crosshair')
      expect(bundle.canvas.style.touchAction).toBe('none')
      expect(bundle.dragPan.disable).toHaveBeenCalled()
      expect(bundle.boxZoom.disable).toHaveBeenCalled()
      expect(bundle.dragRotate.disable).toHaveBeenCalled()
      expect(bundle.touchZoomRotate.disable).toHaveBeenCalled()
      expect(onArmedChange).toHaveBeenCalledWith(true)
    })

    it('arming twice is a no-op the second time (does not double-register listeners)', () => {
      handler.arm()
      const callsAfterFirstArm = bundle.canvas.addEventListener.mock.calls.length
      handler.arm()
      expect(bundle.canvas.addEventListener.mock.calls.length).toBe(callsAfterFirstArm)
    })

    it('disarm restores cursor/touch-action and re-enables only the handlers that were on before', () => {
      bundle.boxZoom.disable() // pretend boxZoom was already off before arming
      handler.arm()
      handler.disarm()
      expect(bundle.canvas.style.cursor).toBe('')
      expect(bundle.canvas.style.touchAction).toBe('')
      expect(bundle.dragPan.enable).toHaveBeenCalled()
      expect(bundle.dragRotate.enable).toHaveBeenCalled()
      expect(bundle.touchZoomRotate.enable).toHaveBeenCalled()
      // boxZoom was already disabled before arm(), so disarm must not turn it on.
      expect(bundle.boxZoom.enable).not.toHaveBeenCalled()
      expect(handler.isArmed).toBe(false)
      expect(onArmedChange).toHaveBeenLastCalledWith(false)
    })

    it('disarm is a no-op when never armed', () => {
      handler.disarm()
      expect(onArmedChange).not.toHaveBeenCalled()
    })

    it('cancel while armed clears the preview and disarms', () => {
      handler.arm()
      handler.cancel()
      expect(onPreview).toHaveBeenCalledWith(null)
      expect(handler.isArmed).toBe(false)
    })

    it('cancel while not armed does nothing', () => {
      handler.cancel()
      expect(onPreview).not.toHaveBeenCalled()
      expect(onArmedChange).not.toHaveBeenCalled()
    })
  })

  describe('dragging a rectangle', () => {
    it('previews the bounds on move and completes + disarms on pointerup past the tap threshold', () => {
      handler.arm()
      bundle.canvas.dispatch('pointerdown', pointerEvent({ offsetX: 10, offsetY: 20 }))
      expect(bundle.canvas.setPointerCapture).toHaveBeenCalledWith(1)

      bundle.canvas.dispatch(
        'pointermove',
        pointerEvent({ offsetX: 30, offsetY: 40, clientX: 30, clientY: 40 }),
      )
      expect(onPreview).toHaveBeenLastCalledWith({ west: 10, south: 20, east: 30, north: 40 })

      bundle.canvas.dispatch(
        'pointerup',
        pointerEvent({ offsetX: 50, offsetY: 5, clientX: 50, clientY: 5 }),
      )
      expect(onComplete).toHaveBeenCalledWith({ west: 10, south: 5, east: 50, north: 20 })
      expect(onPreview).toHaveBeenLastCalledWith(null)
      expect(handler.isArmed).toBe(false)
    })

    it('ignores a non-primary pointer down (a second simultaneous touch)', () => {
      handler.arm()
      bundle.canvas.dispatch('pointerdown', pointerEvent({ isPrimary: false }))
      expect(bundle.canvas.setPointerCapture).not.toHaveBeenCalled()
    })

    it('ignores a non-left mouse button (a right-click must not start a corner)', () => {
      handler.arm()
      bundle.canvas.dispatch('pointerdown', pointerEvent({ button: 2 }))
      expect(bundle.canvas.setPointerCapture).not.toHaveBeenCalled()
    })

    it('ignores a second pointerdown while one is already tracked', () => {
      handler.arm()
      bundle.canvas.dispatch('pointerdown', pointerEvent({ pointerId: 1, offsetX: 0, offsetY: 0 }))
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 2, offsetX: 99, offsetY: 99 }),
      )
      // Only pointer 1's move should affect the preview.
      bundle.canvas.dispatch('pointermove', pointerEvent({ pointerId: 2, offsetX: 5, offsetY: 5 }))
      expect(onPreview).not.toHaveBeenCalled()
      bundle.canvas.dispatch('pointermove', pointerEvent({ pointerId: 1, offsetX: 5, offsetY: 5 }))
      expect(onPreview).toHaveBeenCalled()
    })

    it('ignores pointermove/pointerup for an untracked pointerId', () => {
      handler.arm()
      bundle.canvas.dispatch('pointerdown', pointerEvent({ pointerId: 1 }))
      bundle.canvas.dispatch('pointermove', pointerEvent({ pointerId: 9, offsetX: 5, offsetY: 5 }))
      expect(onPreview).not.toHaveBeenCalled()
      bundle.canvas.dispatch('pointerup', pointerEvent({ pointerId: 9 }))
      expect(onComplete).not.toHaveBeenCalled()
    })
  })

  describe('tap-tap (WCAG 2.5.7 no-drag alternative)', () => {
    it('completes on the second tap, using the two tapped corners', () => {
      handler.arm()
      // First tap: down/up at the same point (movedPx = 0, below the threshold).
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10, clientX: 10, clientY: 10 }),
      )
      bundle.canvas.dispatch(
        'pointerup',
        pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10, clientX: 10, clientY: 10 }),
      )
      expect(onComplete).not.toHaveBeenCalled()
      expect(handler.isArmed).toBe(true) // still armed, awaiting the second tap

      // Second tap at the opposite corner.
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 1, offsetX: 40, offsetY: 30, clientX: 40, clientY: 30 }),
      )
      bundle.canvas.dispatch(
        'pointerup',
        pointerEvent({ pointerId: 1, offsetX: 40, offsetY: 30, clientX: 40, clientY: 30 }),
      )
      expect(onComplete).toHaveBeenCalledWith({ west: 10, south: 10, east: 40, north: 30 })
      expect(handler.isArmed).toBe(false)
    })
  })

  describe('pointercancel', () => {
    it('clears the in-progress corner so a later pointerdown does not extend a cancelled drag', () => {
      handler.arm()
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10 }),
      )
      bundle.canvas.dispatch('pointercancel', pointerEvent({ pointerId: 1 }))
      expect(onPreview).toHaveBeenLastCalledWith(null)

      // A fresh pointerdown for the same id must start a brand new corner, not
      // resume: dragging from here should measure from the new down point only.
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 1, offsetX: 100, offsetY: 100, clientX: 100, clientY: 100 }),
      )
      bundle.canvas.dispatch(
        'pointerup',
        pointerEvent({ pointerId: 1, offsetX: 120, offsetY: 100, clientX: 120, clientY: 100 }),
      )
      expect(onComplete).toHaveBeenCalledWith({ west: 100, south: 100, east: 120, north: 100 })
    })

    it('ignores a pointercancel for an untracked pointer id', () => {
      handler.arm()
      bundle.canvas.dispatch(
        'pointerdown',
        pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10 }),
      )
      bundle.canvas.dispatch('pointercancel', pointerEvent({ pointerId: 9 }))
      // The still-tracked pointer 1 can still complete a drag afterwards.
      bundle.canvas.dispatch(
        'pointerup',
        pointerEvent({ pointerId: 1, offsetX: 30, offsetY: 30, clientX: 30, clientY: 30 }),
      )
      expect(onComplete).toHaveBeenCalled()
    })
  })

  describe('Escape', () => {
    it('cancels the draw and stops the Escape reaching the Settings panel while armed', () => {
      handler.arm()
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation')
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)
      expect(handler.isArmed).toBe(false)
      expect(stopPropagationSpy).toHaveBeenCalled()
      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('does not stop propagation for an unrelated key while armed', () => {
      handler.arm()
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true })
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation')
      window.dispatchEvent(event)
      expect(stopPropagationSpy).not.toHaveBeenCalled()
      handler.disarm()
    })

    it('ignores non-Escape keys while armed', () => {
      handler.arm()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(handler.isArmed).toBe(true)
      handler.disarm()
    })

    it('does nothing once disarmed (the window listener was removed)', () => {
      handler.arm()
      handler.disarm()
      onArmedChange.mockClear()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(onArmedChange).not.toHaveBeenCalled()
    })
  })

  it('disposing mid-draw (disarm while a pointer is down) clears all in-progress state', () => {
    handler.arm()
    bundle.canvas.dispatch('pointerdown', pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10 }))
    handler.disarm()
    expect(handler.isArmed).toBe(false)
    // Restoring handlers must have happened even though a pointer was mid-drag.
    expect(bundle.dragPan.enable).toHaveBeenCalled()
  })

  it('restores only the handlers that were actually enabled before arming (dragPan/dragRotate/touchZoomRotate all off)', () => {
    bundle.dragPan.disable()
    bundle.dragRotate.disable()
    bundle.touchZoomRotate.disable()
    handler.arm()
    handler.disarm()
    expect(bundle.dragPan.enable).not.toHaveBeenCalled()
    expect(bundle.dragRotate.enable).not.toHaveBeenCalled()
    expect(bundle.touchZoomRotate.enable).not.toHaveBeenCalled()
    // boxZoom was left enabled before arming in this bundle, so it IS restored.
    expect(bundle.boxZoom.enable).toHaveBeenCalled()
  })

  it('ignores a pointerup whose down-state is already gone (defensive guard)', () => {
    // Not naturally reachable through the public pointer-event API (arm()
    // always sets pointerDownAt/pointerDownScreen together with
    // activePointerId) — reproduced directly to prove the guard holds if
    // that ever changes.
    handler.arm()
    bundle.canvas.dispatch('pointerdown', pointerEvent({ pointerId: 1, offsetX: 10, offsetY: 10 }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reaching a private field to simulate the defensive edge case
    ;(handler as any).pointerDownAt = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    ;(handler as any).pointerDownScreen = null
    bundle.canvas.dispatch('pointerup', pointerEvent({ pointerId: 1, offsetX: 20, offsetY: 20 }))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('finishing a rectangle restores the map handlers exactly like disarm()', () => {
    handler.arm()
    bundle.canvas.dispatch(
      'pointerdown',
      pointerEvent({ pointerId: 1, offsetX: 0, offsetY: 0, clientX: 0, clientY: 0 }),
    )
    bundle.canvas.dispatch(
      'pointerup',
      pointerEvent({ pointerId: 1, offsetX: 20, offsetY: 20, clientX: 20, clientY: 20 }),
    )
    expect(bundle.dragPan.enable).toHaveBeenCalled()
    expect(bundle.boxZoom.enable).toHaveBeenCalled()
    expect(bundle.dragRotate.enable).toHaveBeenCalled()
    expect(bundle.touchZoomRotate.enable).toHaveBeenCalled()
  })
})
