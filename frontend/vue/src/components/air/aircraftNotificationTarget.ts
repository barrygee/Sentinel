import type { NotificationTarget } from '@sentinel/shell-api/shell/notificationRegistry'

/**
 * Air's notification click target: an alert carrying an aircraft `hex` focuses
 * that aircraft on the Air map (F8 — this used to live in the core
 * notifications store).
 *
 * While AirMap is mounted it registers a handler that selects the plane. From
 * any other section there is no handler, so the target routes to /air/ and
 * stashes the hex; AirMap drains it when it registers.
 */
let aircraftClickHandler: ((hex: string) => void) | null = null
let pendingAircraftTarget: string | null = null

/** Called by AirMap on mount. Drains a target stashed while Air wasn't showing. */
export function registerAircraftClickHandler(handler: (hex: string) => void): void {
  aircraftClickHandler = handler
  if (pendingAircraftTarget) {
    const hex = pendingAircraftTarget
    pendingAircraftTarget = null
    handler(hex)
  }
}

/** The mounted AirMap's handler, if Air is showing. */
export function getAircraftClickHandler(): ((hex: string) => void) | null {
  return aircraftClickHandler
}

/**
 * Called by AirMap on unmount, so an aircraft alert clicked from another
 * section routes to Air rather than calling a torn-down handler that no-ops.
 */
export function clearAircraftClickHandler(): void {
  aircraftClickHandler = null
}

/** Test seam: forget the handler and any stashed target. */
export function resetAircraftNotificationTargetForTests(): void {
  aircraftClickHandler = null
  pendingAircraftTarget = null
}

export const aircraftNotificationTarget: NotificationTarget = {
  sectionId: 'air',
  priority: 20,
  matches: (item) => Boolean(item.hex),
  open(item, { router }) {
    const hex = item.hex!
    if (aircraftClickHandler) {
      aircraftClickHandler(hex)
      return
    }
    pendingAircraftTarget = hex
    void router.push('/air/')
  },
}
