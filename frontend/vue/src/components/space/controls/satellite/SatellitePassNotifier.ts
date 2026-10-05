import type { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { isPassNotifEnabled, setPassNotifEnabled } from './passNotifStore'

/** The detail line of the "pass alerts on" card, which is also how it is found again to dismiss. */
const PASS_ALERTS_ENABLED_DETAIL = 'Pass alerts enabled'
/** Every wording that card has had — alerts saved before the rename still carry the old one. */
const PASS_ALERTS_ENABLED_DETAILS = [PASS_ALERTS_ENABLED_DETAIL, 'Pass notifications enabled']

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

  toggleEnabled(): void {
    this.toggle()
  }

  // Remove the persistent "Pass alerts enabled" alert for a satellite
  // when its notifications are turned off, so the alerts list stays in sync.
  private _dismissEnabledAlert(noradId: string): void {
    const { notificationsStore } = this._ctx
    const stale = notificationsStore.items
      .filter(
        (i) =>
          i.type === 'tracking' &&
          i.noradId === noradId &&
          PASS_ALERTS_ENABLED_DETAILS.includes(i.detail),
      )
      .map((i) => i.id)
    stale.forEach((id) => notificationsStore.dismiss(id))
  }

  private toggle(): void {
    const { notificationsStore, getUserLocation, getActiveNoradId, getActiveSatName } = this._ctx
    const noradId = getActiveNoradId()
    const name = getActiveSatName()
    if (this.enabled) {
      setPassNotifEnabled(noradId, false)
      this._dismissEnabledAlert(noradId)
      document.dispatchEvent(
        new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: false } }),
      )
    } else {
      const loc = getUserLocation()
      if (!loc) {
        // Defer enabling until a location is available.
        const poller = setInterval(() => {
          if (getUserLocation()) {
            clearInterval(poller)
            setPassNotifEnabled(noradId, true, name)
            document.dispatchEvent(
              new CustomEvent('satellite-pass-notif-changed', {
                detail: { noradId, enabled: true },
              }),
            )
          }
        }, 500)
        setTimeout(() => clearInterval(poller), 30000)
        return
      }
      setPassNotifEnabled(noradId, true, name)
      document.dispatchEvent(
        new CustomEvent('satellite-pass-notif-changed', { detail: { noradId, enabled: true } }),
      )
      notificationsStore.add({
        type: 'tracking',
        title: name,
        detail: PASS_ALERTS_ENABLED_DETAIL,
        noradId,
        // Target this specific satellite (not whichever is active later).
        action: {
          label: 'DISABLE ALERTS',
          callback: () => {
            setPassNotifEnabled(noradId, false)
            this._dismissEnabledAlert(noradId)
            document.dispatchEvent(
              new CustomEvent('satellite-pass-notif-changed', {
                detail: { noradId, enabled: false },
              }),
            )
          },
        },
      })
    }
  }
}
