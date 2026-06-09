import type { NotificationsStore } from '../types'
import type { useAirNotifStore } from '@/stores/airNotif'
import { AIRPORTS_DATA, type AirportProperties } from '../airports/AirportsControl'
import type { ParsedAircraft } from './adsbParse'

type AirNotifStore = ReturnType<typeof useAirNotifStore>

// Detects aircraft landing/departure transitions from a stream of position
// snapshots and emits the corresponding notifications. Pure detection — no map
// or rendering. Owned by the app-level background alerts service so the alerts
// fire regardless of which section the user is viewing.
//
// "Departure" fires for an opt-in aircraft that was seen on the ground and is
// now airborne with ground speed. "Landed" fires for an opt-in aircraft whose
// altitude transitioned from >0 to 0. Both were previously inline in
// AdsbLiveControl._fetch().
export class AircraftEventDetector {
  private _notifications: NotificationsStore
  private _notif: AirNotifStore
  private _prevAlt: Record<string, number> = {}
  private _hasDeparted: Record<string, boolean> = {}
  private _seenOnGround: Record<string, boolean> = {}

  constructor(notifications: NotificationsStore, notifStore: AirNotifStore) {
    this._notifications = notifications
    this._notif = notifStore
  }

  // Process one batch of parsed aircraft. `seen` lets us prune transition
  // state for aircraft that have dropped out of the feed.
  process(list: ParsedAircraft[]): void {
    const seen = new Set<string>()
    for (const a of list) {
      const hex = a.hex
      if (!hex) continue
      seen.add(hex)

      const optedIn = this._notif.isEnabled(hex)
      const prevAlt = this._prevAlt[hex]
      const justLanded = prevAlt !== undefined && prevAlt > 0 && a.alt === 0
      if (a.alt === 0 && optedIn) this._seenOnGround[hex] = true
      const justDeparted =
        a.alt > 0 && a.gs > 0 && !this._hasDeparted[hex] && this._seenOnGround[hex] && optedIn
      this._prevAlt[hex] = a.alt
      if (a.alt === 0) this._hasDeparted[hex] = false

      if (justDeparted) {
        this._hasDeparted[hex] = true
        const callsign = a.flight || a.r.trim() || this._notif.callsignFor(hex)
        const apt = this._nearestAirport(a.lat, a.lon)
        this._notifications.add({
          type: 'departure',
          title: callsign,
          ...(apt ? { detail: `${apt.name} (${apt.icao})` } : {}),
        })
      }

      if (justLanded && optedIn) {
        const callsign = a.flight || a.r.trim() || this._notif.callsignFor(hex)
        const apt = this._nearestAirport(a.lat, a.lon)
        this._notifications.add({
          type: 'flight',
          title: callsign,
          ...(apt ? { detail: `${apt.name} (${apt.icao})` } : {}),
        })
      }
    }

    // Prune transition state for aircraft no longer in the feed.
    for (const hex of Object.keys(this._prevAlt)) {
      if (!seen.has(hex)) delete this._prevAlt[hex]
    }
    for (const hex of Object.keys(this._hasDeparted)) {
      if (!seen.has(hex)) delete this._hasDeparted[hex]
    }
    for (const hex of Object.keys(this._seenOnGround)) {
      if (!seen.has(hex)) delete this._seenOnGround[hex]
    }
  }

  private _nearestAirport(aLat: number, aLon: number): AirportProperties | null {
    let best: AirportProperties | null = null,
      bestDist = Infinity
    for (const f of AIRPORTS_DATA.features) {
      const [fLon, fLat] = f.geometry.coordinates
      const dLat = ((aLat - fLat) * Math.PI) / 180
      const dLon = ((aLon - fLon) * Math.PI) / 180
      const a2 =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((fLat * Math.PI) / 180) *
          Math.cos((aLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2
      const dist = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
      if (dist < bestDist) {
        bestDist = dist
        best = f.properties
      }
    }
    return best
  }
}
