import type { Map as MapLibreGlMap, LngLat } from 'maplibre-gl'

/** A drawn/selected area, in the same field order the backend's `AreaRequest` uses. */
export interface LngLatBounds {
  west: number
  south: number
  east: number
  north: number
}

/** Screen-pixel distance below which a pointer up/down pair counts as a tap, not a drag. */
const TAP_MOVEMENT_THRESHOLD_PX = 6

function boundsFromCorners(cornerA: LngLat, cornerB: LngLat): LngLatBounds {
  return {
    west: Math.min(cornerA.lng, cornerB.lng),
    east: Math.max(cornerA.lng, cornerB.lng),
    south: Math.min(cornerA.lat, cornerB.lat),
    north: Math.max(cornerA.lat, cornerB.lat),
  }
}

/**
 * Draws a rectangle on `OfflineAreaMap` by dragging one corner to the
 * opposite corner, OR — the WCAG 2.5.7 no-drag alternative — two separate
 * taps/clicks, one per corner. A plain class rather than a MapLibre
 * `IControl`: it has no button of its own and lives only on this one map,
 * armed externally by `AreaSelector`'s "DRAW AREA" button.
 *
 * Pointer Events (not separate mouse/touch handlers) so mouse, touch and pen
 * share one code path. While armed, `dragPan`/`boxZoom`/`dragRotate`/
 * `touchZoomRotate` are disabled so a drag draws a rectangle instead of
 * panning/zooming the map, and the canvas's `touch-action` is set to `none` —
 * without that, the browser's own touch scroll/zoom gesture recognition still
 * claims a touch drag before MapLibre's handlers ever see it, which both
 * scrolls the settings panel underneath and fires `pointercancel` mid-drag.
 * `disarm()` always restores everything, however the handler ends (finished,
 * cancelled, or the caller tearing down), so a stray unmount can never leave
 * the map stuck.
 *
 * Tracks exactly one pointer at a time (by id) so a second finger touching
 * down mid-drag (common on a phone while the first finger is still down)
 * can't be mistaken for the corner being drawn.
 */
export class RectangleDrawHandler {
  private readonly map: MapLibreGlMap
  private readonly onComplete: (bounds: LngLatBounds) => void
  private readonly onPreview: (bounds: LngLatBounds | null) => void
  private readonly onArmedChange: (armed: boolean) => void

  private armed = false
  private activePointerId: number | null = null
  private pointerDownAt: LngLat | null = null
  private pointerDownScreen: { x: number; y: number } | null = null
  private tapPendingCorner: LngLat | null = null
  private restoreHandlers: (() => void) | null = null

  constructor(
    map: MapLibreGlMap,
    callbacks: {
      /** Called once a rectangle is finished, by drag or by tap-tap. */
      onComplete: (bounds: LngLatBounds) => void
      /** Called while dragging (rAF-throttled by the caller) and with `null` when there is
       *  nothing to preview (armed with no drag/first tap yet, or after finishing/cancelling). */
      onPreview: (bounds: LngLatBounds | null) => void
      /** Called whenever `armed` changes, so the caller can reflect it in the DRAW AREA button. */
      onArmedChange: (armed: boolean) => void
    },
  ) {
    this.map = map
    this.onComplete = callbacks.onComplete
    this.onPreview = callbacks.onPreview
    this.onArmedChange = callbacks.onArmedChange
  }

  get isArmed(): boolean {
    return this.armed
  }

  /** Enter draw mode: crosshair cursor, map panning/zoom/rotate suspended. */
  arm(): void {
    if (this.armed) return
    this.armed = true
    this.tapPendingCorner = null
    this.activePointerId = null
    this.onArmedChange(true)

    const canvas = this.map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const previousTouchAction = canvas.style.touchAction
    // Stops the browser's own touch-scroll/pinch-zoom gesture recognizer from
    // claiming the drag before MapLibre's (disabled) handlers would have —
    // without this a touch drag scrolls the settings panel and the pointer
    // sequence ends in `pointercancel` instead of `pointerup`.
    canvas.style.touchAction = 'none'
    const wasDragPanEnabled = this.map.dragPan.isEnabled()
    const wasBoxZoomEnabled = this.map.boxZoom.isEnabled()
    const wasDragRotateEnabled = this.map.dragRotate.isEnabled()
    const wasTouchZoomRotateEnabled = this.map.touchZoomRotate.isEnabled()
    this.map.dragPan.disable()
    this.map.boxZoom.disable()
    this.map.dragRotate.disable()
    this.map.touchZoomRotate.disable()

    const handlePointerDown = (event: PointerEvent) => this.handlePointerDown(event)
    const handlePointerMove = (event: PointerEvent) => this.handlePointerMove(event)
    const handlePointerUp = (event: PointerEvent) => this.handlePointerUp(event)
    const handlePointerCancel = (event: PointerEvent) => this.handlePointerCancel(event)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Capture phase, and stop the event here: without this, Escape also
      // reaches the Settings dialog's own Escape-closes-the-panel handler
      // (bubble phase on the panel element) and closes Settings entirely
      // instead of just cancelling the in-progress draw.
      event.preventDefault()
      event.stopPropagation()
      this.cancel()
    }
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    this.restoreHandlers = () => {
      canvas.style.cursor = ''
      canvas.style.touchAction = previousTouchAction
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      if (wasDragPanEnabled) this.map.dragPan.enable()
      if (wasBoxZoomEnabled) this.map.boxZoom.enable()
      if (wasDragRotateEnabled) this.map.dragRotate.enable()
      if (wasTouchZoomRotateEnabled) this.map.touchZoomRotate.enable()
    }
  }

  /** Leave draw mode without finishing a rectangle (Escape, or the caller giving up). */
  cancel(): void {
    if (!this.armed) return
    this.onPreview(null)
    this.disarm()
  }

  /** Tear down listeners and restore map interaction — safe to call repeatedly. */
  disarm(): void {
    this.activePointerId = null
    this.pointerDownAt = null
    this.pointerDownScreen = null
    this.tapPendingCorner = null
    if (!this.armed) return
    this.armed = false
    this.restoreHandlers?.()
    this.restoreHandlers = null
    this.onArmedChange(false)
  }

  private handlePointerDown(event: PointerEvent): void {
    // Only the primary pointer, only the primary mouse button (a right-click
    // or a second simultaneous touch must not restart/hijack the corner).
    if (!event.isPrimary || event.button !== 0) return
    if (this.activePointerId !== null) return
    this.activePointerId = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const point = this.map.unproject([event.offsetX, event.offsetY])
    this.pointerDownAt = point
    this.pointerDownScreen = { x: event.clientX, y: event.clientY }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId || !this.pointerDownAt) return
    const point = this.map.unproject([event.offsetX, event.offsetY])
    this.onPreview(boundsFromCorners(this.pointerDownAt, point))
  }

  private handlePointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return
    const downAt = this.pointerDownAt
    const downScreen = this.pointerDownScreen
    this.activePointerId = null
    this.pointerDownAt = null
    this.pointerDownScreen = null
    if (!downAt || !downScreen) return

    const movedPx = Math.hypot(event.clientX - downScreen.x, event.clientY - downScreen.y)
    const point = this.map.unproject([event.offsetX, event.offsetY])

    if (movedPx > TAP_MOVEMENT_THRESHOLD_PX) {
      // A drag: the two pointer-down/up points are the opposite corners.
      this.finish(boundsFromCorners(downAt, point))
      return
    }

    // A tap: the no-drag alternative pairs two of these, one per corner.
    if (!this.tapPendingCorner) {
      this.tapPendingCorner = point
      this.onPreview(null)
      return
    }
    this.finish(boundsFromCorners(this.tapPendingCorner, point))
  }

  /**
   * The browser cancelled the pointer sequence (e.g. a system gesture took
   * over, or — before `touch-action:none` was set — a scroll started). Clear
   * the in-progress corner rather than leaving stale down-state that the next
   * pointerdown would wrongly treat as a continuing drag.
   */
  private handlePointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return
    this.activePointerId = null
    this.pointerDownAt = null
    this.pointerDownScreen = null
    this.onPreview(null)
  }

  private finish(bounds: LngLatBounds): void {
    this.onComplete(bounds)
    this.onPreview(null)
    this.disarm()
  }
}
