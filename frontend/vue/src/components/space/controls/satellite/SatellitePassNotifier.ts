import type { useNotificationsStore } from '@/stores/notifications'
import { isPassNotifEnabled, setPassNotifEnabled } from './passNotifStore'

type NotificationsStore = ReturnType<typeof useNotificationsStore>

export interface SatellitePassNotifierContext {
    notificationsStore: NotificationsStore
    getUserLocation: () => [number, number] | null
    getActiveNoradId: () => string
    getActiveSatName: () => string
}

// Owns the on-map bell button + enabled flag for the ACTIVE satellite's pass
// notifications. The actual scheduling/firing of pass alerts is handled by the
// app-level useSpaceAlertsService (one SatellitePassScheduler per enabled
// satellite) so alerts fire regardless of which section is active. This class
// therefore only persists the enabled flag and dispatches the
// `satellite-pass-notif-changed` event the service listens to.
export class SatellitePassNotifier {
    private _ctx: SatellitePassNotifierContext

    constructor(ctx: SatellitePassNotifierContext) {
        this._ctx = ctx
    }

    get enabled(): boolean {
        return isPassNotifEnabled(this._ctx.getActiveNoradId())
    }

    // Retained for call-site compatibility; scheduling now lives in the service.
    onActivated(): void {}
    stop(): void {}

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
                ;(btn as HTMLElement).classList.toggle('iss-notif-btn--active', this.enabled)
                const existingSlash = svg.querySelector('line')
                if (this.enabled && existingSlash) existingSlash.remove()
                else if (!this.enabled && !existingSlash) {
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

    toggleEnabled(): void { this.toggle() }

    private toggle(): void {
        const { notificationsStore, getUserLocation, getActiveNoradId, getActiveSatName } = this._ctx
        const noradId = getActiveNoradId()
        const name = getActiveSatName()
        if (this.enabled) {
            setPassNotifEnabled(noradId, false)
            notificationsStore.add({ type: 'notif-off', title: name, detail: 'Pass notifications disabled' })
            document.dispatchEvent(new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: false } }))
        } else {
            const loc = getUserLocation()
            if (!loc) {
                // Defer enabling until a location is available.
                const poller = setInterval(() => {
                    if (getUserLocation()) {
                        clearInterval(poller)
                        setPassNotifEnabled(noradId, true, name)
                        document.dispatchEvent(new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: true } }))
                    }
                }, 500)
                setTimeout(() => clearInterval(poller), 30000)
                return
            }
            setPassNotifEnabled(noradId, true, name)
            document.dispatchEvent(new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: true } }))
            notificationsStore.add({
                type: 'tracking', title: name, detail: 'Pass notifications enabled',
                // Target this specific satellite (not whichever is active later).
                action: { label: 'DISABLE NOTIFICATIONS', callback: () => {
                    setPassNotifEnabled(noradId, false)
                    notificationsStore.add({ type: 'notif-off', title: name, detail: 'Pass notifications disabled' })
                    document.dispatchEvent(new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: false } }))
                } },
            })
        }
    }
}
