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

export interface SatellitePassNotifierContext {
    notificationsStore: NotificationsStore
    getUserLocation: () => [number, number] | null
    getActiveNoradId: () => string
    getActiveSatName: () => string
}

// Handles "ping me ~10 minutes before this satellite next passes overhead".
// Owns its own enabled flag (persisted to localStorage), the next-pass timer,
// and a refresh interval that periodically re-fetches the pass list.
export class SatellitePassNotifier {
    private _ctx: SatellitePassNotifierContext
    private _enabled = false
    private _lastFiredAos = 0
    private _scheduleTimeout: ReturnType<typeof setTimeout> | null = null
    private _refreshInterval: ReturnType<typeof setInterval> | null = null

    constructor(ctx: SatellitePassNotifierContext) {
        this._ctx = ctx
        this._restoreState()
    }

    get enabled(): boolean { return this._enabled }

    // Called when the controller has finished its first data fetch (i.e. has
    // a known active satellite) — if persistence said pass-notifs were on for
    // that satellite, start the polling now.
    onActivated(): void {
        if (this._enabled) this._startPolling()
    }

    stop(): void {
        if (this._scheduleTimeout) { clearTimeout(this._scheduleTimeout); this._scheduleTimeout = null }
        if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null }
    }

    // Wire the bell-button found inside a hover-tag element.
    wireButton(el: HTMLElement): void {
        const btn = el.querySelector('.iss-notif-btn')
        if (!btn) return
        btn.addEventListener('mousedown', (e) => e.stopPropagation())
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.toggle()
            const svg = btn.querySelector('svg')
            if (svg) {
                ;(btn as HTMLElement).classList.toggle('iss-notif-btn--active', this._enabled)
                const existingSlash = svg.querySelector('line')
                if (this._enabled && existingSlash) existingSlash.remove()
                else if (!this._enabled && !existingSlash) {
                    const slash = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                    slash.setAttribute('x1', '1.5'); slash.setAttribute('y1', '1.5')
                    slash.setAttribute('x2', '11.5'); slash.setAttribute('y2', '11.5')
                    slash.setAttribute('stroke', 'currentColor'); slash.setAttribute('stroke-width', '1.5')
                    slash.setAttribute('stroke-linecap', 'square')
                    svg.appendChild(slash)
                }
            }
        })
    }

    private _storageKey(): string { return `passNotifEnabled_${this._ctx.getActiveNoradId()}` }

    private _restoreState(): void {
        try { this._enabled = localStorage.getItem(this._storageKey()) === '1' } catch {}
    }

    private _saveState(): void {
        try {
            if (this._enabled) localStorage.setItem(this._storageKey(), '1')
            else localStorage.removeItem(this._storageKey())
        } catch {}
    }

    private toggle(): void {
        const { notificationsStore, getUserLocation, getActiveSatName } = this._ctx
        if (this._enabled) {
            this._enabled = false; this._lastFiredAos = 0
            this.stop()
            this._saveState()
            notificationsStore.add({ type: 'notif-off', title: getActiveSatName(), detail: 'Pass notifications disabled' })
        } else {
            const loc = getUserLocation()
            if (!loc) {
                const poller = setInterval(() => {
                    const l = getUserLocation()
                    if (l) {
                        clearInterval(poller); this._enabled = true
                        this._saveState(); this._startPolling()
                    }
                }, 500)
                setTimeout(() => clearInterval(poller), 30000)
                return
            }
            this._enabled = true; this._saveState(); this._startPolling()
            notificationsStore.add({
                type: 'tracking', title: getActiveSatName(), detail: 'Pass notifications enabled',
                action: { label: 'DISABLE NOTIFICATIONS', callback: () => {
                    this._enabled = true; this.toggle()
                }},
            })
        }
    }

    private _startPolling(): void {
        this._fetchAndSchedule()
        if (this._refreshInterval) clearInterval(this._refreshInterval)
        this._refreshInterval = setInterval(() => this._fetchAndSchedule(), 5 * 60 * 1000)
    }

    private async _fetchAndSchedule(): Promise<void> {
        const loc = this._ctx.getUserLocation()
        if (!loc) return
        const [lon, lat] = loc
        const noradId = this._ctx.getActiveNoradId()
        try {
            const endpoint = noradId === '25544'
                ? `/api/space/iss/passes?lat=${lat}&lon=${lon}&hours=24`
                : `/api/space/satellite/${noradId}/passes?lat=${lat}&lon=${lon}&hours=24`
            const resp = await fetch(endpoint)
            if (!resp.ok) return
            const data = await resp.json() as IssPassesApiResponse
            if (data.error || !data.passes) return
            this._schedule(data.passes)
        } catch {}
    }

    private _schedule(passes: IssPass[]): void {
        if (this._scheduleTimeout) { clearTimeout(this._scheduleTimeout); this._scheduleTimeout = null }
        if (!this._enabled) return
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
            if (!this._enabled) return
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
            type: 'tracking', title: `${this._ctx.getActiveSatName()} PASS`,
            detail: `AOS ~10 min — max ${pass.max_elevation_deg}° elev at ${aosTime}`,
            action: { label: 'DISABLE', callback: () => { this._enabled = true; this.toggle() } },
        })
    }
}
