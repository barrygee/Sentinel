/**
 * Keeps the ADS-B map's tracked and isolated aircraft across visits.
 *
 * The followed aircraft is saved to `localStorage` (`adsbTracking`) and to the
 * backend (`/api/air/tracking`), so it survives a reload and other sections see
 * it; the isolated aircraft lives in the Air store. On the way back both are
 * restored once, but only when the aircraft is in the feed again — until then
 * every poll retries.
 *
 * `AdsbLiveControl` owns one instance and calls it after each poll and whenever
 * the follow state changes. Applying a restore (selection, tag, alerts, camera)
 * stays the control's, through {@link AdsbTrackingPersistenceHost}.
 */
import type { AircraftGeoFeature } from './adsbFeature'

/** The `localStorage` key holding `{ hex }` of the followed aircraft. */
const TRACKING_STORAGE_KEY = 'adsbTracking'

/** What the persistence reads from, and asks of, the control that owns it. */
export interface AdsbTrackingPersistenceHost {
  /** The aircraft whose selected tag is pinned, or null. */
  taggedHex(): string | null
  selectedHex(): string | null
  /** True while the selected aircraft is being followed. */
  isFollowing(): boolean
  /** The aircraft currently known, as map features. */
  features(): AircraftGeoFeature[]
  /** The aircraft isolated on the map before the last visit ended, or '' for none. */
  savedIsolatedHex(): string
  /** Isolate this aircraft again; it is in the feed. */
  applyIsolation(hex: string): void
  /** Select and follow this aircraft again; it is in the feed. May throw, which reports the restore failed. */
  applyTracking(feature: AircraftGeoFeature): void
}

/** The hex saved in `localStorage`, or null when none is saved or it can't be read. */
function readSavedHex(): string | null {
  try {
    return JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || '{}').hex
  } catch {
    return null
  }
}

/** Ask the backend to stop tracking an aircraft; a failure is ignored (best effort). */
function deleteTracked(hex: string): void {
  fetch(`/api/air/tracking/${encodeURIComponent(hex)}`, { method: 'DELETE' }).catch(() => {})
}

export class AdsbTrackingPersistence {
  /** True once the followed aircraft has been restored (or there was none to restore). */
  trackingRestored = false
  /** True once the isolated aircraft has been restored (or there was none to restore). */
  isolationRestored = false

  constructor(private readonly host: AdsbTrackingPersistenceHost) {}

  /**
   * Save who is followed now, or clear the saved aircraft when nothing is. When
   * the followed aircraft changes, the backend forgets the previous one first.
   */
  save(): void {
    try {
      const activeHex =
        this.host.taggedHex() || (this.host.isFollowing() ? this.host.selectedHex() : null)
      if (activeHex && this.host.isFollowing()) {
        const previousHex = readSavedHex()
        if (previousHex && previousHex !== activeHex) deleteTracked(previousHex)
        localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ hex: activeHex }))
        const feature = this.host.features().find((item) => item.properties.hex === activeHex)
        const callsign = feature
          ? (feature.properties.flight || '').trim() || (feature.properties.r || '').trim() || ''
          : ''
        fetch('/api/air/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: activeHex, callsign, follow: true }),
        }).catch(() => {})
      } else {
        const previousHex = readSavedHex()
        localStorage.removeItem(TRACKING_STORAGE_KEY)
        if (previousHex) deleteTracked(previousHex)
      }
    } catch {}
  }

  /**
   * Re-isolate the aircraft the user had isolated on the map (map-click "show only
   * this one") before leaving the Air section. Runs once per control instance, but
   * waits until the aircraft is actually in the feed so the isolate filter has a
   * feature to show — retrying on later polls until then. A following/tracked
   * aircraft restores via its own path, so isolation defers to it.
   */
  restoreIsolation(): void {
    if (this.isolationRestored) return
    const hex = this.host.savedIsolatedHex()
    if (!hex || this.host.isFollowing()) {
      this.isolationRestored = true
      return
    }
    const present = this.host.features().some((feature) => feature.properties.hex === hex)
    if (!present) return
    this.isolationRestored = true
    this.host.applyIsolation(hex)
  }

  /**
   * Restore the followed aircraft once: the backend's record wins over this
   * browser's (another browser may have changed it), then {@link applySaved}
   * runs. If the aircraft isn't in the feed yet, the next poll tries again.
   */
  restoreTracking(): void {
    if (this.trackingRestored) return
    this.trackingRestored = true
    fetch('/api/air/tracking')
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: { hex: string; follow: boolean }[]) => {
        const tracked = rows.find((row) => row.follow)
        if (tracked)
          localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ hex: tracked.hex }))
        if (!this.applySaved()) this.trackingRestored = false
      })
      .catch(() => {
        if (!this.applySaved()) this.trackingRestored = false
      })
  }

  /**
   * Follow the saved aircraft again.
   *
   * @returns true when done or there is nothing saved; false when the aircraft
   *   is not in the feed yet, or the saved entry or the restore failed.
   */
  applySaved(): boolean {
    try {
      const saved = localStorage.getItem(TRACKING_STORAGE_KEY)
      if (!saved) return true
      const { hex } = JSON.parse(saved)
      if (!hex) return true
      const aircraftFeature = this.host.features().find((feature) => feature.properties.hex === hex)
      if (!aircraftFeature) return false
      this.host.applyTracking(aircraftFeature)
      return true
    } catch {
      return false
    }
  }
}
