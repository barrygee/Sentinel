import type { Map as MapLibreGlMap, GeoJSONSource } from 'maplibre-gl'
import type { AdsbLiveControl } from './AdsbLiveControl'
import type { PlaybackAircraft, MultiSnapshot } from '@/stores/playback'

type FeatureCollection = GeoJSON.FeatureCollection
type Feature = GeoJSON.Feature

export class AirMultiPlaybackControl {
  private _map: MapLibreGlMap
  private _adsbControl: AdsbLiveControl

  constructor(map: MapLibreGlMap, adsbControl: AdsbLiveControl) {
    this._map = map
    this._adsbControl = adsbControl
    adsbControl.pauseLive()
  }

  renderAtTime(cursorMs: number, aircraft: Record<string, PlaybackAircraft>): void {
    const features: Feature[]   = []
    const trailDots: Feature[]  = []
    const trailLines: Feature[] = []
    const isolatedHex = this._adsbControl._isolatedHex

    for (const ac of Object.values(aircraft)) {
      if (!ac.snapshots.length) continue

      const everAirborne = ac.snapshots.some(s => (s.alt_baro != null && s.alt_baro > 100) || (s.gs != null && s.gs > 50))
      if (!everAirborne) continue

      const idx = this._bisectLeft(ac.snapshots, cursorMs)
      if (idx < 0) continue

      const snap = ac.snapshots[idx]
      const lastSnap = ac.snapshots[ac.snapshots.length - 1]
      if (cursorMs > lastSnap.ts) continue

      // Dead-reckon from this snapshot to the current cursor position
      const elapsedSec = (cursorMs - snap.ts) / 1000
      let coords: [number, number]
      if (snap.track != null && snap.gs != null && snap.gs > 0 && elapsedSec > 0) {
        coords = this._deadReckon(snap.lon, snap.lat, snap.track, snap.gs, elapsedSec)
      } else {
        coords = [snap.lon, snap.lat]
      }

      features.push(this._makeAircraftFeature(ac, snap, coords))

      // Only build trails for the selected aircraft (mirrors live isolation mode).
      // When nothing is selected build trails for all aircraft so they're ready.
      const acHex = ac.hex || ac.registration
      if (isolatedHex && acHex !== isolatedHex) continue

      const TRAIL_MS = 5 * 60 * 1000
      const trailCutoff = snap.ts - TRAIL_MS
      let trailStart = idx
      while (trailStart > 0 && ac.snapshots[trailStart - 1].ts >= trailCutoff) trailStart--
      const trail = ac.snapshots.slice(trailStart, idx + 1)
      trail.forEach((s, i) => {
        trailDots.push(this._makeTrailDot(acHex, s, i, trail.length))
      })
      if (trail.length > 1) {
        trailLines.push(this._makeTrailLine(trail))
      }
    }

    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
    this._setSource('adsb-live',              features.length   ? { type: 'FeatureCollection', features }               : empty)
    this._setSource('adsb-trails-source',     trailDots.length  ? { type: 'FeatureCollection', features: trailDots }    : empty)
    this._setSource('adsb-trail-line-source', trailLines.length ? { type: 'FeatureCollection', features: trailLines }   : empty)

    // Show/hide trail layers. When isolated, always show if we have data.
    // When not isolated, hide trails (nothing selected yet).
    const showTrails = !!isolatedHex && (trailDots.length > 0 || trailLines.length > 0)
    if (this._map.getLayer('adsb-trail-dots')) this._map.setLayoutProperty('adsb-trail-dots', 'visibility', (showTrails && trailDots.length)  ? 'visible' : 'none')
    if (this._map.getLayer('adsb-trail-line')) this._map.setLayoutProperty('adsb-trail-line', 'visibility', (showTrails && trailLines.length) ? 'visible' : 'none')

    // Mirror live isolation: hide all icons except the selected one.
    // _applyTypeFilter already set the layer filter on click; re-apply each tick
    // so it survives any style/source refresh that might reset it.
    if (isolatedHex) {
      const isolateFilter = ['==', ['get', 'hex'], isolatedHex]
      if (this._map.getLayer('adsb-bracket')) this._map.setFilter('adsb-bracket', isolateFilter as any)
      if (this._map.getLayer('adsb-hit'))     this._map.setFilter('adsb-hit',     isolateFilter as any)
      // Force the icon visible for the isolated aircraft even when labelsVisible hides the symbol layer
      if (this._map.getLayer('adsb-icons')) {
        this._map.setFilter('adsb-icons', isolateFilter as any)
        this._map.setLayoutProperty('adsb-icons', 'visibility', 'visible')
      }
    } else {
      // No selection — clear hit filter only; _applyTypeFilter owns icons/bracket filters
      if (this._map.getLayer('adsb-hit')) this._map.setFilter('adsb-hit', null)
    }

    this._adsbControl.setPlaybackFeatures(features)
  }

  destroy(): void {
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
    this._setSource('adsb-live', empty)
    this._setSource('adsb-trails-source', empty)
    this._setSource('adsb-trail-line-source', empty)
    this._adsbControl.resumeLive()
  }

  private _deadReckon(lon: number, lat: number, trackDeg: number, gs: number, elapsedSec: number): [number, number] {
    const distNm  = gs * (elapsedSec / 3600)
    const angDist = distNm / 3440.065
    const bearRad = trackDeg * Math.PI / 180
    const lat1    = lat * Math.PI / 180
    const lon1    = lon * Math.PI / 180
    const lat2    = Math.asin(
      Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearRad)
    )
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearRad) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    )
    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]
  }

  private _bisectLeft(snapshots: MultiSnapshot[], ts: number): number {
    let lo = 0, hi = snapshots.length - 1, result = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (snapshots[mid].ts <= ts) { result = mid; lo = mid + 1 }
      else hi = mid - 1
    }
    return result
  }

  private _makeAircraftFeature(ac: PlaybackAircraft, snap: MultiSnapshot, coords: [number, number]): Feature {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        hex:          ac.hex || ac.registration,
        flight:       ac.callsign,
        r:            ac.registration,
        t:            ac.type_code,
        alt_baro:     snap.alt_baro   ?? 0,
        alt_geom:     null,
        gs:           snap.gs         ?? 0,
        ias:          null,
        mach:         null,
        track:        snap.track      ?? 0,
        baro_rate:    snap.baro_rate  ?? 0,
        nav_altitude: null,
        nav_heading:  null,
        category:     '',
        emergency:    'none',
        squawk:       snap.squawk     ?? '',
        squawkEmerg:  0,
        rssi:         null,
        military:     false,
        stale:        0,
      },
    }
  }

  private _makeTrailDot(reg: string, snap: MultiSnapshot, i: number, total: number): Feature {
    const opacity = 0.2 + 0.8 * (i / Math.max(1, total - 1))
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [snap.lon, snap.lat] },
      properties: {
        alt:      snap.alt_baro ?? 0,
        opacity,
        emerg:    0,
        military: 0,
        hex:      reg,
      },
    }
  }

  private _makeTrailLine(trail: MultiSnapshot[]): Feature {
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: trail.map(s => [s.lon, s.lat]) },
      properties: { emerg: 0, military: 0 },
    }
  }

  private _setSource(id: string, data: FeatureCollection): void {
    (this._map.getSource(id) as GeoJSONSource | undefined)?.setData(data)
  }
}
