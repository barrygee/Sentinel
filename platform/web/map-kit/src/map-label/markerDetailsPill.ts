import { formatLatitude, formatLongitude } from '@sentinel/map-kit/utils/locationUtils'

/** What a ⊙ marker's details pill shows. */
export interface MarkerDetails {
  /** The name on the pill's first line. */
  name: string
  latitude: number
  longitude: number
  /** Where it answers, as `host:port`; `null` leaves the address line out. */
  address: string | null
  /** Whether it is up; `null` draws the status dot grey, as an unknown. */
  reachable: boolean | null
}

/**
 * The details pill that hangs off a ⊙ marker on hover: a status dot and name,
 * then the position, then the address.
 *
 * Shared by the SDR host sites and the operator's own marker, so this machine's
 * tag reads exactly like every other site's. Styled by the
 * `sdr-manager-map-marker-*` rules in `MapLibreMap.vue`.
 *
 * `aria-hidden`, because each marker's own accessible name carries the same
 * values: a screen reader should hear them once, not twice.
 */
export function buildMarkerDetailsPill(details: MarkerDetails): HTMLElement {
  const pill = document.createElement('span')
  pill.className = 'sdr-manager-map-marker-info'
  pill.setAttribute('aria-hidden', 'true')

  // The status dot leads the name, so whether a site is up is the first thing
  // read rather than something noticed halfway down the panel.
  const name = document.createElement('span')
  name.className = 'sdr-manager-map-marker-name'
  const statusDot = document.createElement('span')
  statusDot.className = statusDotClass(details.reachable)
  name.appendChild(statusDot)
  name.appendChild(document.createTextNode(details.name))
  pill.appendChild(name)

  // Position before address: where a site is says more about the mark the
  // operator is looking at than how Sentinel reaches it.
  const coordinates = document.createElement('span')
  coordinates.className = 'sdr-manager-map-marker-coords'
  coordinates.textContent = `${formatLatitude(details.latitude)}  ${formatLongitude(details.longitude)}`
  pill.appendChild(coordinates)

  if (details.address !== null) {
    const meta = document.createElement('span')
    meta.className = 'sdr-manager-map-marker-meta'
    meta.textContent = details.address
    pill.appendChild(meta)
  }

  return pill
}

/** The status dot's classes: green online, red off air, plain grey unknown. */
function statusDotClass(reachable: boolean | null): string {
  if (reachable === null) return 'sdr-manager-map-marker-status'
  return `sdr-manager-map-marker-status sdr-manager-map-marker-status--${reachable ? 'online' : 'offair'}`
}
