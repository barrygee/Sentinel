import type { Router } from 'vue-router'
import type { NotificationItem } from '@/stores/notifications'

/**
 * Notification registries (docs/plans/section-containers.md §3.6, F8).
 *
 * The alerts panel is core, but what an alert *means* belongs to the section
 * that raised it: clicking an aircraft alert focuses the plane on the Air map,
 * closing an auto-tune card cancels that satellite's auto-tune. Sections
 * register those behaviours here, so the panel holds no section knowledge and
 * an absent section's alerts simply stay inert (no click target, plain dismiss).
 *
 * Type labels are not here: the notification types are a vocabulary several
 * sections share (`autotune` comes from both SDR and Space, `tracking` from
 * both Air and Space), so they stay with the core store.
 */

/** Where clicking an alert takes the operator. */
export interface NotificationTarget {
  /** Which section registered it, for diagnostics and duplicate checks. */
  sectionId: string
  /**
   * Lower wins when an alert matches more than one target. No producer sets
   * two targets on one alert today; the order only keeps the old precedence
   * (a satellite target before an aircraft one) should one ever do.
   */
  priority: number
  /** True when this target can open the alert (e.g. it carries an aircraft hex). */
  matches(item: NotificationItem): boolean
  /** Focus the alert's subject, routing to the section first if it isn't showing. */
  open(item: NotificationItem, context: { router: Router }): void
}

/** Runs when an alert of a type is closed, before it is dismissed. */
export type NotificationDismissHook = (item: NotificationItem) => void

const targets: NotificationTarget[] = []
const dismissHooks = new Map<string, NotificationDismissHook[]>()

/** Adds a click target. One target per section — a second is a programming error. */
export function registerNotificationTarget(target: NotificationTarget): void {
  if (targets.some((existing) => existing.sectionId === target.sectionId)) {
    throw new Error(`Section "${target.sectionId}" already registered a notification target`)
  }
  targets.push(target)
  targets.sort((first, second) => first.priority - second.priority)
}

/** The target that opens `item`, or undefined when no registered section can. */
export function findNotificationTarget(item: NotificationItem): NotificationTarget | undefined {
  return targets.find((target) => target.matches(item))
}

/** Adds a hook run when an alert of `type` is closed. */
export function registerNotificationDismissHook(type: string, hook: NotificationDismissHook): void {
  dismissHooks.set(type, [...(dismissHooks.get(type) ?? []), hook])
}

/** Runs every dismiss hook registered for `item`'s type, in registration order. */
export function runNotificationDismissHooks(item: NotificationItem): void {
  for (const hook of dismissHooks.get(item.type) ?? []) hook(item)
}

/** Test seam: forget every registered target and hook. */
export function resetNotificationRegistryForTests(): void {
  targets.length = 0
  dismissHooks.clear()
}
