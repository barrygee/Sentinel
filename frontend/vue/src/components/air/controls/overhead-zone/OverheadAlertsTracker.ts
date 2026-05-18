import type { useNotificationsStore } from '../../../../stores/notifications'
import { haversineNm } from '../../../../utils/distanceUtils'
import { OVERHEAD_ZONE_RADIUS_NM } from './OverheadZoneControl'

type NotificationsStore = ReturnType<typeof useNotificationsStore>

interface AircraftFeature {
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { hex: string; flight?: string; r?: string; alt_baro?: number; gs?: number; military?: boolean }
}

interface FeatureCollection {
    features: AircraftFeature[]
}

export interface OverheadAlertsEnabled {
    civil: boolean
    mil: boolean
}

const POLL_MS = 2000

export class OverheadAlertsTracker {
    private _notifications: NotificationsStore
    private _getFeatures: () => FeatureCollection | null
    private _getUserLocation: () => { lon: number; lat: number } | null
    private _onAlertClick: ((hex: string) => void) | null
    private _tracked = new Map<string, { id: string; military: boolean }>()
    private _timer: ReturnType<typeof setInterval> | null = null
    private _civilEnabled = false
    private _milEnabled = false
    private _radiusNm: number = OVERHEAD_ZONE_RADIUS_NM

    constructor(
        notifications: NotificationsStore,
        getFeatures: () => FeatureCollection | null,
        getUserLocation: () => { lon: number; lat: number } | null,
        onAlertClick: ((hex: string) => void) | null = null,
        radiusNm: number = OVERHEAD_ZONE_RADIUS_NM,
    ) {
        this._notifications = notifications
        this._getFeatures = getFeatures
        this._getUserLocation = getUserLocation
        this._onAlertClick = onAlertClick
        this._radiusNm = radiusNm
    }

    setRadiusNm(radiusNm: number): void {
        if (!Number.isFinite(radiusNm) || radiusNm <= 0) return
        this._radiusNm = radiusNm
    }

    setEnabled(enabled: OverheadAlertsEnabled): void {
        const civil = enabled.civil
        const mil = enabled.mil
        if (civil === this._civilEnabled && mil === this._milEnabled) return
        this._civilEnabled = civil
        this._milEnabled = mil
        const anyOn = civil || mil

        // Drop notifications whose type is no longer enabled.
        for (const [hex, entry] of this._tracked) {
            const stillAllowed = entry.military ? mil : civil
            if (!stillAllowed) {
                this._notifications.dismiss(entry.id)
                this._tracked.delete(hex)
            }
        }

        if (anyOn) {
            if (!this._timer) {
                this._tick()
                this._timer = setInterval(() => this._tick(), POLL_MS)
            }
        } else {
            if (this._timer) { clearInterval(this._timer); this._timer = null }
            this._dismissAllOverhead()
        }
    }

    destroy(): void {
        if (this._timer) { clearInterval(this._timer); this._timer = null }
        this._tracked.clear()
        this._civilEnabled = false
        this._milEnabled = false
    }

    private _tick(): void {
        const loc = this._getUserLocation()
        const fc = this._getFeatures()
        if (!loc || !fc) return

        const seen = new Set<string>()
        for (const f of fc.features) {
            const coords = f.geometry?.coordinates
            const hex = f.properties?.hex
            if (!coords || !hex) continue
            const [lon, lat] = coords
            if (typeof lon !== 'number' || typeof lat !== 'number') continue
            const alt = f.properties?.alt_baro ?? 0
            if (alt <= 0) continue
            const isMil = f.properties?.military === true
            if (isMil && !this._milEnabled) continue
            if (!isMil && !this._civilEnabled) continue
            const dist = haversineNm(loc.lat, loc.lon, lat, lon)
            if (dist > this._radiusNm) continue

            seen.add(hex)
            const gs = f.properties?.gs
            const parts: string[] = [`${dist.toFixed(1)} nm`, `${Math.round(alt).toLocaleString()} ft`]
            if (typeof gs === 'number' && gs > 0) parts.push(`${Math.round(gs)} kt`)
            const detail = parts.join(' · ')
            const existing = this._tracked.get(hex)
            const title = (f.properties.flight || '').trim() || (f.properties.r || '').trim() || hex
            if (existing) {
                this._notifications.update({ id: existing.id, detail })
            } else {
                const cb = this._onAlertClick
                const id = this._notifications.add({
                    type: 'overhead', title, detail, hex,
                    clickAction: cb ? () => cb(hex) : undefined,
                })
                this._tracked.set(hex, { id, military: isMil })
            }
        }

        for (const [hex, entry] of this._tracked) {
            if (!seen.has(hex)) {
                this._notifications.dismiss(entry.id)
                this._tracked.delete(hex)
            }
        }
    }

    private _dismissAllOverhead(): void {
        const ids = this._notifications.items
            .filter(i => i.type === 'overhead')
            .map(i => i.id)
        for (const id of ids) this._notifications.dismiss(id)
        this._tracked.clear()
    }
}
