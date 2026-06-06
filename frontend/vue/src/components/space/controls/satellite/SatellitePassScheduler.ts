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
    // Whether to fire the heads-up ("PASS in ~5 min") notification. Read live so
    // the bell toggle takes effect on the next refresh without recreating us.
    headsUpEnabled: () => boolean
    // Whether to auto-tune the SDR at AOS. Independent of headsUpEnabled.
    autoTuneEnabled: () => boolean
    // Whether to also record the pass to a recording when auto-tune fires. Read live so
    // toggling record takes effect on the next pass without recreating us. Only
    // meaningful while autoTuneEnabled is also true.
    recordOnPass: () => boolean
    // Downlink to tune to, or null when unknown (then auto-tune is skipped with a
    // notice). The UI prevents enabling auto-tune for sats without a downlink,
    // but a hand-edited entry could be missing it.
    getDownlink: () => { hz: number; mode: string } | null
}

// Heads-up lead: fire the "PASS coming" notification this far before AOS.
const HEADS_UP_LEAD_MS = 5 * 60 * 1000
const REFRESH_MS = 5 * 60 * 1000

// One scheduler per satellite, owning a single fetch + 5-min refresh loop and
// driving two independent action tracks off the same pass list:
//   - heads-up: a "PASS in ~5 min" notification, fired HEADS_UP_LEAD_MS before
//     AOS (only when the bell is on)
//   - auto-tune: retune the always-mounted SdrPanel to the downlink at AOS, plus
//     a one-shot LOS restore (only when auto-tune is on)
// The two tracks fire at different times for the same pass, so each keeps its
// own fired-guard and timeout; they merely share the fetched pass list. Pure
// scheduling — no map, no UI, no persisted flag (the service owns lifecycle).
//
// Previously these were two separate classes (SatellitePassScheduler +
// SatelliteAutoTuneScheduler) with duplicated fetch/refresh machinery.
export class SatellitePassScheduler {
    private _ctx: SatellitePassSchedulerCtx
    private _refreshInterval: ReturnType<typeof setInterval> | null = null
    private _stopped = false
    // Latest fetched pass list, retained so a mid-pass toggle (e.g. enabling
    // record while a pass is already overhead) can re-run the auto-tune track
    // without waiting for the next 5-min refresh.
    private _lastPasses: IssPass[] = []

    private _headsUp: ActionTrack
    private _autoTune: AutoTuneTrack

    constructor(ctx: SatellitePassSchedulerCtx) {
        this._ctx = ctx
        this._headsUp = new ActionTrack(
            HEADS_UP_LEAD_MS,
            () => ctx.headsUpEnabled(),
            (pass) => this._fireHeadsUp(pass),
        )
        this._autoTune = new AutoTuneTrack(ctx)
    }

    start(): void {
        this._stopped = false
        this._fetchAndSchedule()
        if (this._refreshInterval) clearInterval(this._refreshInterval)
        this._refreshInterval = setInterval(() => this._fetchAndSchedule(), REFRESH_MS)
    }

    stop(): void {
        this._stopped = true
        if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null }
        this._headsUp.stop()
        this._autoTune.stop()
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
            this._lastPasses = data.passes
            this._headsUp.schedule(data.passes)
            this._autoTune.schedule(data.passes)
        } catch {}
    }

    // Re-run the auto-tune track against the currently-overhead pass so a toggle
    // flipped on mid-pass (auto-tune or record) takes effect immediately instead
    // of waiting for the next pass. Tells the track to forget the overhead pass's
    // fired-guard, then re-schedules: if the radio is already tuned for it,
    // onExternalTune just re-applies the same tune and starts the recording that
    // wasn't armed at first fire. No-op if no pass is overhead.
    refireAutoTuneForCurrentPass(): void {
        if (this._stopped || !this._lastPasses.length) return
        this._autoTune.forgetCurrentPass(Date.now())
        this._autoTune.schedule(this._lastPasses)
    }

    private _fireHeadsUp(pass: IssPass): void {
        const aosTime = new Date(pass.aos_unix_ms).toUTCString().slice(17, 22) + ' UTC'
        const mins = Math.round(HEADS_UP_LEAD_MS / 60000)
        this._ctx.notificationsStore.add({
            type: 'tracking', title: `${this._ctx.getName()} PASS`,
            detail: `AOS ~${mins} min — max ${pass.max_elevation_deg}° elev at ${aosTime}`,
            noradId: this._ctx.noradId, satName: this._ctx.getName(),
        })
    }
}

// A single fire-once-per-pass timeline: arm a timeout `leadMs` before each AOS
// and invoke `fire(pass)` then, skipping when `enabled()` is false. Guards on the
// fired pass's LOS rather than exact AOS — AOS can drift for an in-progress pass
// across refreshes (backscan detection), but LOS is stable, so we don't re-fire
// until past it. This is what stopped the duplicate-alert-per-refresh bug.
class ActionTrack {
    protected _firedThroughLos = 0
    private _timeout: ReturnType<typeof setTimeout> | null = null

    constructor(
        private _leadMs: number,
        private _enabled: () => boolean,
        private _fire: (pass: IssPass) => void,
    ) {}

    stop(): void {
        if (this._timeout) { clearTimeout(this._timeout); this._timeout = null }
    }

    schedule(passes: IssPass[]): void {
        if (this._timeout) { clearTimeout(this._timeout); this._timeout = null }
        const now = Date.now()
        // Earliest pass still relevant (LOS in the future). Its fire-point is
        // AOS − lead; if that's already past we fire now (the LOS guard prevents
        // re-firing one we've handled). Then recurse for the pass after it.
        const next = passes.find(p => p.los_unix_ms > now)
        if (!next) return
        const delay = (next.aos_unix_ms - this._leadMs) - now
        if (delay <= 0) {
            // Fire-point already past. Only fire if a late fire is still useful
            // (see lateFireUntil) — e.g. a "5 min before AOS" heads-up is pointless
            // once AOS has passed, but an auto-tune mid-pass is still wanted. Either
            // way, advance past this pass so we don't reconsider it next refresh.
            this._maybeFire(next, now < this.lateFireUntil(next))
            const remaining = passes.filter(p => p.aos_unix_ms > now + 60000)
            if (remaining.length > 0) this.schedule(remaining)
            return
        }
        this._timeout = setTimeout(() => {
            this._timeout = null
            this._maybeFire(next, true)
            const remaining = passes.filter(p => p.aos_unix_ms > next.aos_unix_ms + 60000)
            if (remaining.length > 0) this.schedule(remaining)
        }, delay)
    }

    // Latest `now` at which firing for a missed fire-point is still meaningful.
    // Default: the pass's AOS (a pre-AOS heads-up is stale once the pass starts).
    protected lateFireUntil(pass: IssPass): number { return pass.aos_unix_ms }

    private _maybeFire(pass: IssPass, useful: boolean): void {
        if (Date.now() < this._firedThroughLos) return
        // Advance the guard even when not firing, so a stale/missed pass isn't
        // re-evaluated on every refresh while it's still overhead.
        this._firedThroughLos = pass.los_unix_ms
        if (useful && this._enabled()) this._fire(pass)
    }
}

// Auto-tune track: fires at AOS (zero lead) to retune the SDR, and arms a
// one-shot LOS restore for the pass it tuned for. Extends ActionTrack only for
// the AOS timeline + LOS guard; the fire body dispatches the SdrPanel events.
class AutoTuneTrack extends ActionTrack {
    private _losTimeout: ReturnType<typeof setTimeout> | null = null
    private _lastFiredLos = 0

    constructor(private _ctx: SatellitePassSchedulerCtx) {
        super(0, () => _ctx.autoTuneEnabled(), (pass) => this._fireTune(pass))
    }

    override stop(): void {
        super.stop()
        if (this._losTimeout) { clearTimeout(this._losTimeout); this._losTimeout = null }
    }

    // Clear the fired-guard for a pass currently overhead so the next schedule()
    // re-fires it. Used when a toggle (auto-tune/record) is flipped on mid-pass:
    // _firedThroughLos has already advanced past the overhead pass (the guard
    // advances even when not firing), so without this the current pass is never
    // reconsidered. Only rolls the guard back to `now` — never resurrects a pass
    // whose LOS is already behind us. Also clears the armed LOS restore so the
    // re-fire arms a fresh one.
    forgetCurrentPass(now: number): void {
        if (this._firedThroughLos > now) this._firedThroughLos = now
        this._lastFiredLos = 0
        if (this._losTimeout) { clearTimeout(this._losTimeout); this._losTimeout = null }
    }

    // Tuning is useful any time during the pass, so a pass overhead when we pick
    // it up (or when auto-tune is enabled mid-pass) still tunes — up to LOS.
    protected override lateFireUntil(pass: IssPass): number { return pass.los_unix_ms }

    private _fireTune(pass: IssPass): void {
        const dl = this._ctx.getDownlink()
        const name = this._ctx.getName()
        if (!dl) {
            this._ctx.notificationsStore.add({
                type: 'system', title: name,
                detail: 'Auto-tune skipped — no downlink frequency known',
                noradId: this._ctx.noradId, satName: name,
            })
            return
        }
        const mhz = (dl.hz / 1e6).toFixed(3)
        // Ask the always-mounted SdrPanel to select/start the default radio (if
        // stopped) and tune to the downlink. SdrPanel adds the "AUTO-TUNED" alert
        // once it actually applies the tune (or a failure notice). The token
        // identifies this pass so the matching LOS restore can be ignored if a
        // newer pass has taken over the radio meanwhile.
        const token = `${this._ctx.noradId}:${pass.aos_unix_ms}`
        const record = this._ctx.recordOnPass()
        document.dispatchEvent(new CustomEvent('sentinel:sdr-tune-external', {
            detail: { hz: dl.hz, mode: dl.mode, source: 'auto-tune', satName: name, noradId: this._ctx.noradId, token, record },
        }))
        // Lightweight trace in the alerts tab regardless of SDR state. Mirror the
        // record state in the wording (and via the "& RECORD" label) so a pass
        // firing now reads the same as an armed upcoming pass — the trace is what's
        // shown for a current pass, where there's no separate armed card.
        this._ctx.notificationsStore.add({
            type: 'autotune', title: `${name} PASS`,
            detail: record
                ? `Auto-tuning & recording SDR → ${mhz} MHz ${dl.mode}`
                : `Auto-tuning SDR → ${mhz} MHz ${dl.mode}`,
            noradId: this._ctx.noradId, satName: name,
        })
        this._scheduleLos(pass, name, token)
    }

    // Arm a one-shot restore at LOS for the pass we just tuned for. Asks the
    // SdrPanel to undo the auto-tune — returning to whatever state it captured at
    // AOS (a prior frequency, or stopped/connected). Fires immediately if LOS is
    // already past (a pass that was overhead when we picked it up).
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
        this._losTimeout = setTimeout(() => { this._losTimeout = null; fire() }, delay)
    }
}
