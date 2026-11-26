/**
 * Mouse, pen and touch input on the globe canvas: drag to turn, wheel to zoom
 * toward the cursor, pinch to zoom, hover (which slows the auto-spin and
 * finds the object under the pointer) and tap (which picks one).
 */
import type { CameraController } from './cameraController'
import type { LatLon } from './geo'
import type { GlobeProjector } from './globeProjector'

/** Pixels a pointer may move and still count as a click, not a drag. */
const DRAG_THRESHOLD_PX = 4

/** What the caller hears about besides camera moves. */
export interface PointerCallbacks {
  /** A click or tap that didn't drag, at canvas CSS pixel (x, y). */
  onTap?: (x: number, y: number, isTouch: boolean) => void
  /** The pointer moved over the canvas without dragging (null = it left). */
  onHover?: (point: { x: number; y: number } | null) => void
}

interface DragStart {
  x: number
  y: number
  goal: LatLon
  isTouch: boolean
}

/**
 * Wires pointer input on `canvas` to the camera.
 *
 * @returns a function that removes every listener it added.
 */
export function attachPointerControls(
  canvas: HTMLCanvasElement,
  controller: CameraController,
  projector: GlobeProjector,
  callbacks: PointerCallbacks = {},
): () => void {
  let drag: DragStart | null = null
  let movedPx = 0
  const touches = new Map<number, { x: number; y: number }>()
  let pinchDistance = 0

  const canvasPoint = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const bounds = canvas.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const touchSpread = (): number => {
    const [first, second] = [...touches.values()]
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0
  }
  const endDrag = (): void => {
    drag = null
    controller.dragging = touches.size > 0
    canvas.classList.remove('globe-canvas--dragging')
  }

  const onPointerDown = (event: PointerEvent): void => {
    const isTouch = event.pointerType === 'touch'
    if (isTouch) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size === 2) {
        // A second finger turns the drag into a pinch.
        pinchDistance = touchSpread()
        drag = null
        return
      }
      if (touches.size > 2) return
    }
    drag = {
      x: event.clientX,
      y: event.clientY,
      goal: { lat: controller.goal.lat, lon: controller.goal.lon },
      isTouch,
    }
    movedPx = 0
    controller.dragging = true
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('globe-canvas--dragging')
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size === 2 && pinchDistance) {
        const spread = touchSpread()
        controller.zoomBy(Math.pow(pinchDistance / spread, 1.8))
        controller.view.distance += (controller.goal.distance - controller.view.distance) * 0.6
        pinchDistance = spread
        return
      }
    }
    if (drag) {
      const deltaX = event.clientX - drag.x
      const deltaY = event.clientY - drag.y
      movedPx = Math.max(movedPx, Math.abs(deltaX) + Math.abs(deltaY))
      if (movedPx > DRAG_THRESHOLD_PX) controller.stopSpin()
      controller.dragTo(drag.goal, deltaX, deltaY, drag.isTouch)
      return
    }
    const point = canvasPoint(event)
    controller.hovering = projector.latLonAt(point.x, point.y) !== null
    // Touch has no hover: a finger resting there is the start of a drag or tap.
    if (event.pointerType !== 'touch') callbacks.onHover?.(point)
  }

  const onPointerUp = (event: PointerEvent): void => {
    // A press that never moved past the threshold (and wasn't a pinch) is a tap.
    if (drag && movedPx <= DRAG_THRESHOLD_PX && event.type === 'pointerup') {
      const point = canvasPoint(event)
      callbacks.onTap?.(point.x, point.y, drag.isTouch)
    }
    touches.delete(event.pointerId)
    if (touches.size < 2) pinchDistance = 0
    endDrag()
  }

  const onPointerLeave = (): void => {
    if (!drag) controller.hovering = false
    callbacks.onHover?.(null)
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    // Line-mode wheels (Firefox) report far smaller deltas than pixel-mode ones.
    const factor = Math.exp(event.deltaY * (event.deltaMode ? 0.05 : 0.0015))
    const point = canvasPoint(event)
    controller.zoomBy(factor, projector.latLonAt(point.x, point.y))
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('wheel', onWheel)
  }
}
