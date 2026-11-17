import * as maplibregl from 'maplibre-gl'

/**
 * The active satellite's name label on the Space map: one MapLibre marker
 * beside the satellite icon, either plain or, while the map follows the
 * satellite, with a TRACKING badge that reads UNTRACK on hover and stops the
 * follow when clicked. `SatelliteControl` decides which form shows and where.
 */
export class SatelliteLabel {
  private marker: maplibregl.Marker | null = null

  /** `getMap` is read when a label is added, because the control gets its map after construction. */
  constructor(private readonly getMap: () => maplibregl.Map) {}

  /** Whether a label is on the map. */
  get isShown(): boolean {
    return this.marker !== null
  }

  /** Show the plain label at a position, or move the label already shown there. */
  show(longitude: number, latitude: number, name: string): void {
    if (this.marker) {
      this.marker.setLngLat([longitude, latitude])
      return
    }
    this.addMarker(buildLabelElement(name, null), longitude, latitude)
  }

  /**
   * Swap whatever label is shown for a new one: the TRACKING form when
   * `onUntrack` is given (called on click), else the plain form.
   */
  replace(longitude: number, latitude: number, name: string, onUntrack?: () => void): void {
    this.marker?.remove()
    this.addMarker(buildLabelElement(name, onUntrack ?? null), longitude, latitude)
  }

  /** Move the label shown, if any, to a new position. */
  moveTo(longitude: number, latitude: number): void {
    this.marker?.setLngLat([longitude, latitude])
  }

  /**
   * While another satellite is previewed (filter hover): move the label to it,
   * show its name and hide the TRACKING badge, which belongs to the active one.
   */
  showPreview(longitude: number, latitude: number, name: string): void {
    if (!this.marker) return
    this.marker.setLngLat([longitude, latitude])
    const spans = this.marker.getElement().querySelectorAll('span')
    /* v8 ignore start -- spans[0] (the name span) is always present in a label */
    if (spans[0]) spans[0].textContent = name
    /* v8 ignore stop */
    if (spans[1]) (spans[1] as HTMLElement).classList.add('iss-tracking-badge--hidden')
  }

  /** Undo `showPreview`'s name and badge once the preview ends; the caller moves it back. */
  restoreName(name: string): void {
    if (!this.marker) return
    const spans = this.marker.getElement().querySelectorAll('span')
    /* v8 ignore start -- the name span is always present on a label */
    if (spans[0]) spans[0].textContent = name
    /* v8 ignore stop */
    if (spans[1]) (spans[1] as HTMLElement).classList.remove('iss-tracking-badge--hidden')
  }

  /** Take the label off the map. */
  hide(): void {
    if (this.marker) {
      this.marker.remove()
      this.marker = null
    }
  }

  private addMarker(element: HTMLDivElement, longitude: number, latitude: number): void {
    // Anchored on its left edge, 26 px right of the icon so it clears the bracket.
    this.marker = new maplibregl.Marker({ element, anchor: 'left', offset: [26, 0] })
      .setLngLat([longitude, latitude])
      .addTo(this.getMap())
  }
}

/** The label's element: the name, plus the TRACKING badge when `onUntrack` is given. */
function buildLabelElement(name: string, onUntrack: (() => void) | null): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'iss-label' + (onUntrack ? ' iss-label--tracking' : '')
  const nameSpan = document.createElement('span')
  nameSpan.textContent = name
  element.appendChild(nameSpan)
  if (onUntrack) {
    const trackingBadge = document.createElement('span')
    trackingBadge.className = 'iss-tracking-badge'
    trackingBadge.textContent = 'TRACKING'
    element.addEventListener('mouseenter', () => {
      trackingBadge.textContent = 'UNTRACK'
    })
    element.addEventListener('mouseleave', () => {
      trackingBadge.textContent = 'TRACKING'
    })
    element.addEventListener('click', (event) => {
      // Keep the click off the map beneath, which would otherwise handle it too.
      event.stopPropagation()
      onUntrack()
    })
    element.appendChild(trackingBadge)
  }
  return element
}
