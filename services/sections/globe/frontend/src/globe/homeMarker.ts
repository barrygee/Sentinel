/**
 * The operator's location on the globe: the flat maps' ⊙ marker (a white ring
 * round a lime dot), as an HTML overlay that hides on the far side.
 */
import { Vector3 } from 'three'
import type { ScreenBox } from './countryLabels'
import { latLonToVector, type LatLon } from './geo'
import type { GlobeProjector } from './globeProjector'

const MARKER_SVG =
  '<svg width="60" height="60" viewBox="0 0 60 60" overflow="visible" aria-hidden="true">' +
  '<circle cx="30" cy="30" r="13.1" fill="none" stroke="#fff" stroke-width="2.2"/>' +
  '<circle cx="30" cy="30" r="5.2" fill="#c8ff00"/></svg>'

/** Half the space the marker keeps clear of labels, in CSS pixels. */
const CLEARANCE = 20

/** The home marker overlay. */
export class HomeMarker {
  private readonly element = document.createElement('div')
  private readonly position = new Vector3()
  private placed = false

  constructor(container: HTMLElement) {
    this.element.className = 'globe-home-marker globe-overlay--hidden'
    this.element.innerHTML = MARKER_SVG
    container.appendChild(this.element)
  }

  /** Moves the marker; null hides it (no known location). */
  setLocation(location: LatLon | null): void {
    this.placed = location !== null
    if (location) latLonToVector(location.lat, location.lon, 0.03, this.position)
  }

  /**
   * Places the marker for this frame.
   *
   * @returns the box it occupies (for labels to avoid), or null when hidden.
   */
  update(projector: GlobeProjector): ScreenBox | null {
    const visible = this.placed && projector.isFacing(this.position)
    this.element.classList.toggle('globe-overlay--hidden', !visible)
    if (!visible) return null
    const { x, y } = projector.toScreen(this.position)
    this.element.style.transform = `translate(${x}px, ${y}px)`
    return [x - CLEARANCE, y - CLEARANCE, x + CLEARANCE, y + CLEARANCE]
  }

  /** Removes the element. */
  dispose(): void {
    this.element.remove()
  }
}
