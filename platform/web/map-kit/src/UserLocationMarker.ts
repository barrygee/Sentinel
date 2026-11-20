import * as maplibregl from 'maplibre-gl'
import { setMarkerAccessibleName } from '@sentinel/map-kit/map-label/mapMarkerAria'
import { buildMarkerDetailsPill } from '@sentinel/map-kit/map-label/markerDetailsPill'
import { formatLatitude, formatLongitude } from '@sentinel/map-kit/utils/locationUtils'

/**
 * The dot colour of the operator's own position: the map palette's
 * `--map-location-dot` (the app lime on both map palettes).
 */
export const LOCATION_MARKER_DOT_COLOR = 'var(--map-location-dot)'

/**
 * The SENTINEL ⊙ logo mark as SVG markup (same ring/dot proportions as
 * `frontend/assets/logo.svg`): a ring in the map's overlay ink (white on
 * the dark map, near-black on the light one) and a filled dot.
 *
 * Colours are CSS custom properties set per map palette in template.css
 * (`:root[data-map-theme]`), so a marker already on the map follows a
 * palette switch without being rebuilt.
 *
 * The dasharray/dashoffset equal the ring's circumference (2π·13.1) so the
 * draw-in animation traces one full turn. The dot is deliberately static — no
 * pulse.
 *
 * Exported because the mark is not only the user's own position any more: the
 * SDR host sites plotted on every domain map (`SdrManagerSitesControl`) are the same
 * mark, built here rather than copied so the two cannot drift apart. They differ
 * only in the dot's colour (a CSS colour, typically a `var(--map-…)` token),
 * which is what `dotColor` is for — the shape says
 * "a place Sentinel knows"; the colour says whose place it is.
 */
export function buildLocationMarkerSvg(dotColor: string = LOCATION_MARKER_DOT_COLOR): string {
  return `
        <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" overflow="visible">
            <circle cx="30" cy="30" r="13.1"
                fill="none" stroke-width="2.2"
                stroke-dasharray="82.31" stroke-dashoffset="82.31"
                style="stroke: var(--map-overlay-ink); animation: marker-circle-draw 0.6s ease forwards" />
            <circle cx="30" cy="30" r="5.2" style="fill: ${dotColor}" />
        </svg>`
}

function _buildElement(cssClass: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = cssClass
  wrapper.innerHTML = buildLocationMarkerSvg()
  return wrapper
}

/**
 * What the operator marker's tag says about this machine. The position is the
 * marker's own, so it is not passed in.
 */
export interface OperatorMarkerDetails {
  /** This machine's name, e.g. `Home (This machine)`. */
  name: string
  /** Where this machine's SDR Manager answers, as `host:port`, if one reports. */
  address: string | null
  /** Whether that SDR Manager is up; `null` when there is none to ask. */
  reachable: boolean | null
}

/**
 * The operator's own ⊙ on a map: where this machine is.
 *
 * Once given its details (`setDetails`, from `SdrManagerSitesControl`), it shows
 * the same hover tag as every SDR site — name, position, address — with the
 * position following the live fix, and carries those values as its accessible
 * name.
 */
export class UserLocationMarker {
  private _marker: maplibregl.Marker | null = null
  private _map: maplibregl.Map | null = null
  private _cssClass: string
  private _position: [number, number] | null = null
  private _details: OperatorMarkerDetails | null = null
  /** The element's accessible name before a tag replaced it, while one is shown
   *  — `undefined` when no tag is shown, so a marker never tagged is untouched. */
  private _untaggedName: string | null | undefined = undefined

  constructor(cssClass = 'user-location-marker') {
    this._cssClass = cssClass
  }

  addTo(map: maplibregl.Map): void {
    this._map = map
  }

  update(lon: number, lat: number): void {
    if (!this._map) return
    this._position = [lon, lat]
    if (!this._marker) {
      const el = _buildElement(this._cssClass)
      this._marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(this._map)
    } else {
      this._marker.setLngLat([lon, lat])
    }
    // After addTo, which overwrites the element's accessible name with its own.
    this._renderDetails()
  }

  /**
   * Give the marker this machine's tag, or take it away with `null`.
   *
   * Safe before the marker exists: the next `update()` builds it with the tag.
   */
  setDetails(details: OperatorMarkerDetails | null): void {
    this._details = details
    this._renderDetails()
  }

  /** Redraw the tag and accessible name from the details and live position. */
  private _renderDetails(): void {
    const marker = this._marker
    const position = this._position
    if (!marker || !position) return
    // A marker that was never tagged is left exactly as built: the same class
    // also plots other machines (RemoteHostSiteMap), which are not "this machine".
    const untaggedName = this._untaggedName
    if (!this._details && untaggedName === undefined) return
    const element = marker.getElement()
    element.querySelector('.sdr-manager-map-marker-info')?.remove()
    if (!this._details) {
      // Tag taken away: give back the role and name the marker had before it.
      element.removeAttribute('role')
      if (untaggedName) element.setAttribute('aria-label', untaggedName)
      else element.removeAttribute('aria-label')
      this._untaggedName = undefined
      return
    }
    if (this._untaggedName === undefined) this._untaggedName = element.getAttribute('aria-label')
    const [longitude, latitude] = position
    element.setAttribute('role', 'img')
    element.appendChild(buildMarkerDetailsPill({ ...this._details, latitude, longitude }))
    setMarkerAccessibleName(marker, operatorMarkerLabel(this._details, latitude, longitude))
  }

  /**
   * Show or hide the rendered marker without discarding it.
   *
   * For a caller that borrows this marker's visibility rather than owning it —
   * `SdrManagerSitesControl` hides it while one of its counts stands for this
   * position, and shows it again when the count breaks up. Safe before the
   * marker exists: the next `update()` builds it visible.
   */
  setHidden(hidden: boolean): void {
    const element = this._marker?.getElement()
    if (element) element.style.display = hidden ? 'none' : ''
  }

  /**
   * Remove the rendered marker but keep the map reference, so a later
   * update() (e.g. a GPS fix after the config location was cleared) can
   * re-create it. Use destroy() for teardown that also drops the map.
   */
  remove(): void {
    this._marker?.remove()
    this._marker = null
    this._position = null
    // The next marker is a fresh element, with nothing of the old tag on it.
    this._untaggedName = undefined
  }

  /** Full teardown — removes the marker and releases the map reference. */
  destroy(): void {
    this.remove()
    this._map = null
  }
}

/** Everything the operator marker's tag says, as its accessible name. */
function operatorMarkerLabel(
  details: OperatorMarkerDetails,
  latitude: number,
  longitude: number,
): string {
  const parts = [`${details.name}, your location`]
  if (details.address !== null) parts.push(details.address)
  if (details.reachable !== null) parts.push(details.reachable ? 'online' : 'off air')
  return `${parts.join(', ')}, at ${formatLatitude(latitude)} ${formatLongitude(longitude)}`
}
