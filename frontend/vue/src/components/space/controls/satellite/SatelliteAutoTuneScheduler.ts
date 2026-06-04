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

export interface SatelliteAutoTuneSchedulerCtx {
    noradId: string
    notificationsStore: NotificationsStore
    getUserLocation: () => [number, number] | null
    getName: () => string
    // Downlink to tune to, or null when unknown (then we never tune — the UI
    // already prevents enabling auto-tune for sats without a downlink, but the
    // cached value could be missing if the entry was hand-edited).
    getDownlink: () => { hz: number; mode: string } | null
}

// Tunes the SDR to a satellite's downlink the moment a pass begins (AOS) — the
// auto-tune counterpart to SatellitePassScheduler (which fires ~10 min BEFORE
// AOS as a heads-up). Structurally identical (fetch passes every 5 min, arm a
// timeout per pass) but the lead is zero: we fire exactly at AOS, and a pass
// already in progress fires immediately. Firing dispatches a document event the
// always-mounted SdrPanel listens to; this class owns no SDR/UI state itself.
export class SatelliteAutoTuneScheduler {
    private _ctx: SatelliteAutoTuneSchedulerCtx
    private _lastFiredAos = 0
    private _lastFiredLos = 0
    private _scheduleTimeout: ReturnType<typeof setTimeout> | null = null
    private _losTimeout: ReturnType<typeof setTimeout> | null = null
    private _refreshInterval: ReturnType<typeof setInterval> | null = null
    private _stopped = false

    constructor(ctx: SatelliteAutoTuneSchedulerCtx) {
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
        if (this._losTimeout) { clearTimeout(this._losTimeout); this._losTimeout = null }
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
        const now = Date.now()
        // A pass currently overhead (AOS already past, not yet LOS) should tune
        // immediately — the backscan AOS detection means such passes appear in
        // the list with an aos in the recent past.
        const next = passes.find(p => p.los_unix_ms > now)
        if (!next) return
        const delay = next.aos_unix_ms - now
        if (delay <= 0) {
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
        const dl = this._ctx.getDownlink()
        const name = this._ctx.getName()
        if (!dl) {
            this._ctx.notificationsStore.add({
                type: 'system', title: name,
                detail: 'Auto-tune skipped — no downlink frequency known',
            })
            return
        }
        const mhz = (dl.hz / 1e6).toFixed(3)
        // Ask the always-mounted SdrPanel to select/start the default radio (if
        // stopped) and tune to the downlink. SdrPanel adds the "AUTO-TUNED"
        // alert once it actually applies the tune (or a failure notice). The
        // event token identifies this pass so the matching LOS restore can be
        // ignored if a newer pass has taken over the radio meanwhile.
        const token = `${this._ctx.noradId}:${pass.aos_unix_ms}`
        document.dispatchEvent(new CustomEvent('sentinel:sdr-tune-external', {
            detail: { hz: dl.hz, mode: dl.mode, source: 'auto-tune', satName: name, noradId: this._ctx.noradId, token },
        }))
        // Lightweight trace in the alerts tab regardless of SDR state.
        this._ctx.notificationsStore.add({
            type: 'autotune', title: `${name} PASS`,
            detail: `Auto-tuning SDR → ${mhz} MHz ${dl.mode}`,
            noradId: this._ctx.noradId,
        })
        this._scheduleLos(pass, name, token)
    }

    // Arm a one-shot restore at LOS for the pass we just tuned for. Asks the
    // SdrPanel to undo the auto-tune — returning to whatever state it captured
    // at AOS (a prior frequency, or stopped/connected). Fires immediately if LOS
    // is already past (a pass that was overhead when we picked it up).
    private _scheduleLos(pass: IssPass, name: string, token: string): void {
        if (this._losTimeout) { clearTimeout(this._losTimeout); this._losTimeout = null }
        const fire = () => {
            if (this._lastFiredLos === pass.los_unix_ms) return
            this._lastFiredLos = pass.los_unix_ms
            document.dispatchEvent(new CustomEvent('sentinel:sdr-tune-restore', {
                detail: { source: 'auto-tune', satName: name, noradId: this._ctx.noradId, token },
            }))
        }
        const delay = pass.los_unix_ms - Date.now()
        if (delay <= 0) { fire(); return }
        this._losTimeout = setTimeout(() => { this._losTimeout = null; if (!this._stopped) fire() }, delay)
    }
}
