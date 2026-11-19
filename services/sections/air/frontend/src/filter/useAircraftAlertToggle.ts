/**
 * The bell button of an expanded Air FILTER aircraft row: turns per-aircraft
 * alerts on or off, keeps the "tracking" notification (with its DISABLE ALERTS
 * action) in step, and has the map rebuild the aircraft's tag so its bell
 * marker follows.
 */
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { useAirNotifStore } from '../stores/airNotif'
import type { AdsbLiveControl } from '../controls/adsb/AdsbLiveControl'

/** @param getAdsbControl The live ADS-B control, or null before the map is up. */
export function useAircraftAlertToggle(getAdsbControl: () => AdsbLiveControl | null) {
  const notificationsStore = useNotificationsStore()
  const airNotifStore = useAirNotifStore()

  // The name an alert carries: the live callsign, else the registration, else
  // the hex — or, with the aircraft out of the feed, the name it was enabled under.
  function alertName(control: AdsbLiveControl | null, hex: string): string {
    const matchedFeature = control
      ? (
          control._geojson.features as unknown as Array<{ properties: Record<string, unknown> }>
        ).find((feature) => (feature.properties.hex as string) === hex)
      : undefined
    if (!matchedFeature) return airNotifStore.callsignFor(hex)
    return (
      ((matchedFeature.properties.flight as string) || '').trim() ||
      ((matchedFeature.properties.r as string) || '').trim() ||
      hex
    )
  }

  /** Flip alerts for one aircraft. */
  function toggleAlerts(hex: string): void {
    const control = getAdsbControl()
    if (control && !control._trackingNotifIds) control._trackingNotifIds = {}
    const callsign = alertName(control, hex)
    if (airNotifStore.isEnabled(hex)) {
      airNotifStore.disable(hex)
      if (control?._trackingNotifIds?.[hex]) {
        notificationsStore.dismiss(control._trackingNotifIds[hex])
        delete control._trackingNotifIds[hex]
      }
      notificationsStore.add({ type: 'notif-off', title: callsign })
    } else {
      airNotifStore.enable(hex, callsign)
      if (control) {
        const trackingIds = control._trackingNotifIds!
        // Replace, never stack, an earlier tracking notification for this aircraft.
        if (trackingIds[hex]) notificationsStore.dismiss(trackingIds[hex])
        trackingIds[hex] = notificationsStore.add({
          type: 'tracking',
          title: callsign,
          action: {
            label: 'DISABLE ALERTS',
            callback: () => {
              airNotifStore.disable(hex)
              if (control._trackingNotifIds) delete control._trackingNotifIds[hex]
              control._rebuildTagForHex(hex)
            },
          },
        })
      } else {
        notificationsStore.add({ type: 'tracking', title: callsign })
      }
    }
    control?._rebuildTagForHex(hex)
  }

  return { toggleAlerts }
}
