import type { Map as MapLibreGlMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import type { LngLatBounds } from './rectangleDrawHandler'

/** How close (in screen pixels) a pointer must be to a corner to grab it. Touch
 *  gets a bigger target, since a fingertip covers far more than a cursor tip. */
const MOUSE_GRAB_RADIUS_PX = 10
const TOUCH_GRAB_RADIUS_PX = 22

/** Web Mercator can't show latitudes beyond this, so a corner is clamped to it. */
const MAX_MERCATOR_LATITUDE = 85.05112877980659

type CornerName = 'north-west' | 'north-east' | 'south-east' | 'south-west'

interface Corner {
  name: CornerName
  longitude: number
  latitude: number
}

/** What the handler needs from its owner: the rectangle to resize, whether
 *  resizing is currently allowed, and where to report the new shape. */
export interface RectangleResizeCallbacks {
  /** The current selection, or null when there is nothing to resize. */
  getBounds: () => LngLatBounds | null
  /** True while resizing must stay off (e.g. a new rectangle is being drawn). */
  isBlocked: () => boolean
  /** Called on every move while a corner is being dragged. */
  onPreview: (bounds: LngLatBounds) => void
  /** Called once when the drag ends, with the final shape. */
  onComplete: (bounds: LngLatBounds) => void
}

/** The cursor that tells the user which way a corner drags. */
function cursorForCorner(corner: CornerName): string {
  return corner === 'north-west' || corner === 'south-east' ? 'nwse-resize' : 'nesw-resize'
}

function cornersOf(bounds: LngLatBounds): Corner[] {
  return [
    { name: 'north-west', longitude: bounds.west, latitude: bounds.north },
    { name: 'north-east', longitude: bounds.east, latitude: bounds.north },
    { name: 'south-east', longitude: bounds.east, latitude: bounds.south },
    { name: 'south-west', longitude: bounds.west, latitude: bounds.south },
  ]
}

/** The corner diagonally opposite, which stays fixed while the other one moves. */
function oppositeCorner(bounds: LngLatBounds, corner: CornerName): Corner {
  const opposites: Record<CornerName, CornerName> = {
    'north-west': 'south-east',
    'north-east': 'south-west',
    'south-east': 'north-west',
    'south-west': 'north-east',
  }
  return cornersOf(bounds).find((candidate) => candidate.name === opposites[corner]) as Corner
}

/**
 * Lets the user resize an existing selection rectangle by dragging any of its
 * four corners, with the opposite corner held in place. Dragging a corner past
 * the fixed one simply flips the rectangle, as in most drawing tools.
 *
 * Built on MapLibre's own map events rather than raw DOM events: calling
 * `preventDefault()` on a map `mousedown`/`touchstart` is MapLibre's supported
 * way to stop that gesture panning the map, and the events carry the pointer's
 * `lngLat` already. Corners are hit-tested in screen pixels, so they are just
 * as easy to grab at any zoom.
 *
 * Keyboard and screen-reader users resize with the North/South/East/West
 * fields instead, which is the WCAG 2.5.7 non-drag alternative for this too.
 */
export class RectangleResizeHandler {
  private readonly map: MapLibreGlMap
  private readonly callbacks: RectangleResizeCallbacks
  private enabled = false
  /** The corner that stays put during the current drag, or null when not dragging. */
  private anchor: Corner | null = null
  private latestBounds: LngLatBounds | null = null
  /** True when this handler set the canvas cursor, so it only ever clears its own. */
  private cursorOwned = false

  constructor(map: MapLibreGlMap, callbacks: RectangleResizeCallbacks) {
    this.map = map
    this.callbacks = callbacks
  }

  /** True while a corner is being dragged. */
  get isResizing(): boolean {
    return this.anchor !== null
  }

  /** Start listening for corner grabs. Safe to call more than once. */
  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.map.on('mousedown', this.handleMouseDown)
    this.map.on('touchstart', this.handleTouchStart)
    this.map.on('mousemove', this.handleMouseMove)
    this.map.on('touchmove', this.handleTouchMove)
  }

  /** Stop listening, ending any drag in progress without reporting it. */
  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.map.off('mousedown', this.handleMouseDown)
    this.map.off('touchstart', this.handleTouchStart)
    this.map.off('mousemove', this.handleMouseMove)
    this.map.off('touchmove', this.handleTouchMove)
    this.stopListeningForRelease()
    this.anchor = null
    this.latestBounds = null
    this.clearCursor()
  }

  /** The nearest corner within `radius` pixels of `point`, or null. On a small
   *  rectangle several corners can be in range; the closest one wins. */
  private cornerNear(point: { x: number; y: number }, radius: number): CornerName | null {
    const bounds = this.callbacks.getBounds()
    if (!bounds || this.callbacks.isBlocked()) return null
    let nearest: { name: CornerName; distance: number } | null = null
    for (const corner of cornersOf(bounds)) {
      const cornerPoint = this.map.project([corner.longitude, corner.latitude])
      const distance = Math.hypot(cornerPoint.x - point.x, cornerPoint.y - point.y)
      if (distance <= radius && (nearest === null || distance < nearest.distance)) {
        nearest = { name: corner.name, distance }
      }
    }
    return nearest?.name ?? null
  }

  private startResize(corner: CornerName): void {
    const bounds = this.callbacks.getBounds() as LngLatBounds
    this.anchor = oppositeCorner(bounds, corner)
    this.latestBounds = bounds
    this.setCursor(cursorForCorner(corner))
    // The release may land outside the map canvas, where map events don't fire.
    window.addEventListener('mouseup', this.handleRelease)
    window.addEventListener('touchend', this.handleRelease)
    window.addEventListener('touchcancel', this.handleRelease)
  }

  private moveCornerTo(longitude: number, latitude: number): void {
    const anchor = this.anchor as Corner
    const clampedLatitude = Math.max(
      -MAX_MERCATOR_LATITUDE,
      Math.min(MAX_MERCATOR_LATITUDE, latitude),
    )
    this.latestBounds = {
      west: Math.min(anchor.longitude, longitude),
      east: Math.max(anchor.longitude, longitude),
      south: Math.min(anchor.latitude, clampedLatitude),
      north: Math.max(anchor.latitude, clampedLatitude),
    }
    this.callbacks.onPreview(this.latestBounds)
  }

  private readonly handleMouseDown = (event: MapMouseEvent): void => {
    if (event.originalEvent.button !== 0) return
    const corner = this.cornerNear(event.point, MOUSE_GRAB_RADIUS_PX)
    if (!corner) return
    event.preventDefault()
    this.startResize(corner)
  }

  private readonly handleTouchStart = (event: MapTouchEvent): void => {
    // A second finger means a pinch, which belongs to the map.
    const [touchPoint] = event.points
    if (event.points.length !== 1 || !touchPoint) return
    const corner = this.cornerNear(touchPoint, TOUCH_GRAB_RADIUS_PX)
    if (!corner) return
    event.preventDefault()
    this.startResize(corner)
  }

  private readonly handleMouseMove = (event: MapMouseEvent): void => {
    if (this.anchor) {
      this.moveCornerTo(event.lngLat.lng, event.lngLat.lat)
      return
    }
    // Not dragging: show a resize cursor while hovering a corner.
    const corner = this.cornerNear(event.point, MOUSE_GRAB_RADIUS_PX)
    if (corner) this.setCursor(cursorForCorner(corner))
    else this.clearCursor()
  }

  private readonly handleTouchMove = (event: MapTouchEvent): void => {
    if (!this.anchor) return
    event.preventDefault()
    this.moveCornerTo(event.lngLat.lng, event.lngLat.lat)
  }

  private readonly handleRelease = (): void => {
    this.stopListeningForRelease()
    // Only listened for once a drag has started, which always sets latestBounds.
    const finalBounds = this.latestBounds as LngLatBounds
    this.anchor = null
    this.latestBounds = null
    this.clearCursor()
    this.callbacks.onComplete(finalBounds)
  }

  private stopListeningForRelease(): void {
    window.removeEventListener('mouseup', this.handleRelease)
    window.removeEventListener('touchend', this.handleRelease)
    window.removeEventListener('touchcancel', this.handleRelease)
  }

  private setCursor(cursor: string): void {
    this.map.getCanvas().style.cursor = cursor
    this.cursorOwned = true
  }

  private clearCursor(): void {
    if (!this.cursorOwned) return
    this.map.getCanvas().style.cursor = ''
    this.cursorOwned = false
  }
}
