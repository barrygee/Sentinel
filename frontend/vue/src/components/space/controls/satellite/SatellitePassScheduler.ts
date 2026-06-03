import type { useNotificationsStore } from '@/stores/notifications'

type NotificationsStore = ReturnType<typeof useNotificationsStore>

interface IssPass {
    aos_utc: string; los_utc: string
    aos_unix_ms: number; los_unix_ms: number
    duration_s: number; max_elevation_deg: number; max_el_utc: string
}
interface IssPassesApiResponse {
    passes: IssPass[]; obs_lat: number; obs_lon: number
    lookahead_hours: number; computed_at: string; error?: string
}

export interface SatellitePassSchedulerCtx {
    noradId: string
    notificationsStore: NotificationsStore
    getUserLocation: () => [number, number] | null
    getName: () => string
}

// Fires a "~10 minutes before next pass" notification for a single satellite.
// Generalised from the former single-active-satellite SatellitePassNotifier so
// the app-level useSpaceAlertsService can run one scheduler per enabled
// satellite, independent of which section is active. Pure scheduling — no map,
// no UI, no persisted enabled flag (the service owns lifecycle).
export class SatellitePassScheduler {
    private _ctx: SatellitePassSchedulerCtx
    private _lastFiredAos = 0
    private _scheduleTimeout: ReturnType<typeof setTimeout> | null = null
    private _refreshInterval: ReturnType<typeof setInterval> | null = null
    private _stopped = false

    constructor(ctx: SatellitePassSchedulerCtx) {
        this._ctx = ctx
    }

    start(): void {
        this._stopped = false
        this._fetchAndSchedule()
        if (this._refreshInterval) clearInterval(this._refreshInterval)
        this._refreshInterval = setInterval(() => this._fetchAndSchedule(), 5 * 60 * 1000)
    }

    stop(): void {
        this._stopped = true
        if (this._scheduleTimeout) { clearTimeout(this._scheduleTimeout); this._scheduleTimeout = null }
        if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null }
    }

    private async _fetchAndSchedule(): Promise<void> {
        const loc = this._ctx.getUserLocation()
        if (!loc) return
        const [lon, lat] = loc
        const noradId = this._ctx.noradId
        try {
            const endpoint = noradId === '25544'
                ? `/api/space/iss/passes?lat=${lat}&lon=${lon}&hours=24`
                : `/api/space/satellite/${noradId}/passes?lat=${lat}&lon=${lon}&hours=24`
            const resp = await fetch(endpoint)
            if (!resp.ok || this._stopped) return
            const data = await resp.json() as IssPassesApiResponse
            if (data.error || !data.passes) return
            this._schedule(data.passes)
        } catch {}
    }

    private _schedule(passes: IssPass[]): void {
        if (this._scheduleTimeout) { clearTimeout(this._scheduleTimeout); this._scheduleTimeout = null }
        if (this._stopped) return
        const now = Date.now(); const leadMs = 10 * 60 * 1000
        const next = passes.find(p => p.aos_unix_ms > now)
        if (!next) return
        const delay = (next.aos_unix_ms - leadMs) - now
        if (delay < 0) {
            if (this._lastFiredAos !== next.aos_unix_ms) {
                this._lastFiredAos = next.aos_unix_ms; this._fire(next)
            }
            const remaining = passes.filter(p => p.aos_unix_ms > now + 60000)
            if (remaining.length > 0) this._schedule(remaining)
            return
        }
        this._scheduleTimeout = setTimeout(() => {
            this._scheduleTimeout = null
            if (this._stopped) return
            this._lastFiredAos = next.aos_unix_ms; this._fire(next)
            const remaining = passes.filter(p => p.aos_unix_ms > next.aos_unix_ms + 60000)
            if (remaining.length > 0) this._schedule(remaining)
            else this._fetchAndSchedule()
        }, delay)
    }

    private _fire(pass: IssPass): void {
        const aosDate = new Date(pass.aos_unix_ms)
        const aosTime = aosDate.toUTCString().slice(17, 22) + ' UTC'
        this._ctx.notificationsStore.add({
            type: 'tracking', title: `${this._ctx.getName()} PASS`,
            detail: `AOS ~10 min — max ${pass.max_elevation_deg}° elev at ${aosTime}`,
        })
    }
}
