import maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@/components/air/controls/sentinel-control-base/SentinelControlBase'
import { aprsSymbolSvg } from '@/utils/aprsSymbols'
import type { AprsStation, useLandStore } from '@/stores/land'

type LandStore = ReturnType<typeof useLandStore>

/**
 * Land-map control that plots APRS stations heard by the SDR APRS decoder.
 *
 * Renders each station as a simple marker + callsign label (real APRS symbol
 * glyphs are a later enhancement) with a click popup, and keeps them in sync
 * with the polled station snapshot in the Land store. Because the map canvas is
 * opaque to assistive tech, it also maintains a visually-hidden data table of
 * the stations as the accessible equivalent (per accessibility-standards).
 *
 * This is the first real Land control; it follows the same SentinelControlBase
 * pattern as the air/space controls.
 */
export class AprsStationsControl extends SentinelControlBase {
  private readonly _landStore: LandStore
  private _visible = true
  private _markers = new Map<string, maplibregl.Marker>()
  private _popup: maplibregl.Popup | null = null
  private _stopWatch: WatchStopHandle | null = null
  private _a11yRegion: HTMLDivElement | null = null

  constructor(landStore: LandStore) {
    super()
    this._landStore = landStore
  }

  get buttonLabel(): string {
    // A small broadcast/beacon glyph (waves rising from a point).
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="8" cy="11" r="1.6" fill="currentColor" stroke="none" />' +
      '<path d="M5.2 8.2a4 4 0 0 1 5.6 0" /><path d="M3.4 6.4a6.6 6.6 0 0 1 9.2 0" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle APRS stations'
  }

  protected onInit(): void {
    this.setButtonActive(this._visible)
    this._ensureA11yRegion()
    // Poll the station snapshot while this control is on the map, and re-render
    // markers + the a11y table whenever the list changes.
    this._landStore.startAprsPolling()
    this._stopWatch = watch(
      () => this._landStore.aprsStations,
      (stations) => this._render(stations),
      { immediate: true, deep: true },
    )
  }

  protected handleClick(): void {
    this._visible = !this._visible
    this.setButtonActive(this._visible)
    this._render(this._landStore.aprsStations)
  }

  /** Set visibility to a specific value (e.g. from the map's default-layers
   *  config), a no-op if already in that state. */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return
    this._visible = visible
    this.setButtonActive(this._visible)
    this._render(this._landStore.aprsStations)
  }

  onRemove(): void {
    this._stopWatch?.()
    this._stopWatch = null
    this._landStore.stopAprsPolling()
    this._clearMarkers()
    this._popup?.remove()
    this._popup = null
    this._a11yRegion?.remove()
    this._a11yRegion = null
    super.onRemove()
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  private _render(stations: AprsStation[]): void {
    this._syncMarkers(this._visible ? stations : [])
    this._renderA11yTable(stations)
  }

  /** Add/update/remove markers so the on-map set matches `stations` by callsign. */
  private _syncMarkers(stations: AprsStation[]): void {
    const seen = new Set<string>()
    for (const station of stations) {
      seen.add(station.callsign)
      const coords: [number, number] = [station.longitude, station.latitude]
      const existing = this._markers.get(station.callsign)
      if (existing) {
        existing.setLngLat(coords)
        continue
      }
      const marker = new maplibregl.Marker({
        element: this._buildMarkerElement(station),
        anchor: 'top-left',
      })
        .setLngLat(coords)
        .addTo(this.map)
      this._markers.set(station.callsign, marker)
    }
    // Drop markers for stations no longer present (expired or hidden).
    for (const [callsign, marker] of this._markers) {
      if (!seen.has(callsign)) {
        marker.remove()
        this._markers.delete(callsign)
      }
    }
  }

  private _buildMarkerElement(station: AprsStation): HTMLDivElement {
    const element = document.createElement('div')
    element.style.cssText =
      'cursor:pointer;pointer-events:auto;user-select:none;display:flex;align-items:center;gap:4px'

    // The decoded APRS symbol as a line-art icon (car, digipeater, weather, …),
    // in the map's accent colour — matching the air-domain marker style. Unknown
    // symbols fall back to a generic beacon dot.
    const icon = document.createElement('span')
    icon.style.cssText =
      'display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 2px #0a0d14)'
    icon.innerHTML = aprsSymbolSvg(station.symbol, { size: 18, color: '#c8ff00' })
    element.appendChild(icon)

    const label = document.createElement('span')
    label.style.cssText =
      "color:#c8ff00;font-family:'Barlow Condensed','Barlow',monospace;font-size:10px;font-weight:700;" +
      'letter-spacing:.06em;white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #0a0d14'
    label.textContent = station.callsign
    element.appendChild(label)

    element.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      this._openPopup(station)
    })
    return element
  }

  private _openPopup(station: AprsStation): void {
    this._popup?.remove()
    this._popup = new maplibregl.Popup({ closeButton: true, offset: 12 })
      .setLngLat([station.longitude, station.latitude])
      .setHTML(this._popupHtml(station))
      .addTo(this.map)
  }

  private _popupHtml(station: AprsStation): string {
    const rows: string[] = [
      `<strong>${escapeHtml(station.callsign)}</strong>`,
      `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`,
    ]
    if (station.comment) rows.push(escapeHtml(station.comment))
    if (typeof station.course === 'number' || typeof station.speed === 'number') {
      const course = typeof station.course === 'number' ? `${Math.round(station.course)}°` : '—'
      const speed = typeof station.speed === 'number' ? `${Math.round(station.speed)} kn` : '—'
      rows.push(`Course ${course} · Speed ${speed}`)
    }
    rows.push(`Heard ${new Date(station.last_heard_ms).toLocaleTimeString([], { hour12: false })}`)
    return (
      '<div style="font-family:\'Barlow\',sans-serif;font-size:12px;line-height:1.5;color:#0a0d14">' +
      rows.join('<br>') +
      '</div>'
    )
  }

  // ── accessibility ────────────────────────────────────────────────────────────

  private _ensureA11yRegion(): void {
    /* v8 ignore start -- defensive idempotency guard: onInit calls this exactly once */
    if (this._a11yRegion) return
    /* v8 ignore stop */
    const region = document.createElement('div')
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', 'APRS stations')
    // Visually hidden but available to assistive tech (the map canvas itself is
    // opaque to screen readers, so this table is the accessible equivalent).
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    this.map.getContainer().appendChild(region)
    this._a11yRegion = region
  }

  private _renderA11yTable(stations: AprsStation[]): void {
    /* v8 ignore start -- defensive: _render only runs after onInit created the region */
    if (!this._a11yRegion) return
    /* v8 ignore stop */
    if (stations.length === 0) {
      this._a11yRegion.innerHTML = '<p>No APRS stations heard.</p>'
      return
    }
    const rows = stations
      .map((station) => {
        const position = `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`
        const comment = station.comment ? escapeHtml(station.comment) : ''
        return `<tr><td>${escapeHtml(station.callsign)}</td><td>${position}</td><td>${comment}</td></tr>`
      })
      .join('')
    this._a11yRegion.innerHTML =
      '<table><caption>APRS stations heard</caption>' +
      '<thead><tr><th scope="col">Callsign</th><th scope="col">Position</th><th scope="col">Comment</th></tr></thead>' +
      `<tbody>${rows}</tbody></table>`
  }

  private _clearMarkers(): void {
    for (const marker of this._markers.values()) marker.remove()
    this._markers.clear()
  }
}

/** Escape a string for safe interpolation into marker/popup/table HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
