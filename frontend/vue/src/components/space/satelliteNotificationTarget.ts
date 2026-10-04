import type { NotificationItem } from '@/stores/notifications'
import type { NotificationTarget } from '@/shell/notificationRegistry'
import { isAutoTuneEnabled, setAutoTuneEnabled } from './controls/satellite/passNotifStore'

/**
 * Space's notification behaviours (F8 — these used to live in the core
 * notifications store and the shared alerts panel):
 *  - an alert carrying a satellite `noradId` focuses that satellite on the
 *    Space map, routing there first when Space isn't showing;
 *  - closing an `autotune` card cancels auto-tune for its satellite, not just
 *    the card.
 */
let satelliteClickHandler: ((noradId: string, name: string) => void) | null = null
let pendingSatelliteTarget: { noradId: string; name: string } | null = null

/** Called by SpaceMap on mount. Drains a target stashed while Space wasn't showing. */
export function registerSatelliteClickHandler(
  handler: (noradId: string, name: string) => void,
): void {
  satelliteClickHandler = handler
  if (pendingSatelliteTarget) {
    const { noradId, name } = pendingSatelliteTarget
    pendingSatelliteTarget = null
    handler(noradId, name)
  }
}

/** The mounted SpaceMap's handler, if Space is showing. */
export function getSatelliteClickHandler(): ((noradId: string, name: string) => void) | null {
  return satelliteClickHandler
}

/** Called by SpaceMap on unmount, so a later click routes to Space instead. */
export function clearSatelliteClickHandler(): void {
  satelliteClickHandler = null
}

/** Test seam: forget the handler and any stashed target. */
export function resetSatelliteNotificationTargetForTests(): void {
  satelliteClickHandler = null
  pendingSatelliteTarget = null
}

export const satelliteNotificationTarget: NotificationTarget = {
  sectionId: 'space',
  priority: 10,
  matches: (item) => Boolean(item.noradId),
  open(item, { router }) {
    const noradId = item.noradId!
    // The title may be decorated ("GOMX-1 PASS"); prefer the clean name.
    const name = item.satName || item.title || noradId
    if (satelliteClickHandler) {
      satelliteClickHandler(noradId, name)
      return
    }
    pendingSatelliteTarget = { noradId, name }
    void router.push('/space/')
  },
}

/**
 * Closing an auto-tune card turns auto-tune off for that satellite, and tells
 * the schedulers and Space's toggles to stand down through the event they
 * already listen to.
 */
export function cancelAutoTuneOnDismiss(item: NotificationItem): void {
  const noradId = item.noradId
  if (noradId && isAutoTuneEnabled(noradId)) {
    setAutoTuneEnabled(noradId, false)
    document.dispatchEvent(
      new CustomEvent('satellite-auto-tune-changed', { detail: { noradId, enabled: false } }),
    )
  }
}
