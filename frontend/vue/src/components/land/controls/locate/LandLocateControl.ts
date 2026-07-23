import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'

/** Zoom level the map flies to when centring on the user's location. */
const LOCATE_ZOOM = 10

/**
 * "Go to my location" control for the Land map — centres/zooms the map on the
 * user's current location. The location fix itself (GPS watch + marker) is owned
 * by LandView via useUserLocation; this button just flies to it. Uses the
 * SENTINEL ⊙ logo mark, matching the app's "my location" glyph.
 */
export class LandLocateControl extends SentinelControlBase {
  private readonly _getUserLocation: () => [number, number] | null

  constructor(getUserLocation: () => [number, number] | null) {
    super()
    this._getUserLocation = getUserLocation
  }

  get buttonLabel(): string {
    return (
      '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="7.4" stroke="#ffffff" stroke-width="2.1" />' +
      '<circle cx="10" cy="10" r="2.9" fill="#ffffff" /></svg>'
    )
  }
  get buttonTitle(): string {
    return 'Go to my location'
  }

  protected onInit(): void {}

  protected handleClick(): void {
    const location = this._getUserLocation()
    // No fix yet (GPS still resolving / permission denied) — nothing to fly to;
    // the marker appears on its own once a location arrives.
    if (!location) return
    this.map.flyTo({ center: location, zoom: Math.max(this.map.getZoom(), LOCATE_ZOOM) })
  }
}
