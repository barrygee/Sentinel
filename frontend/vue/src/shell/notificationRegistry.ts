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
 * Sections also register the alerts they let the operator switch on
 * (subscription sources), which Settings › Alerts lists and cancels.
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

/** One thing a source is set to notify the operator about. */
export interface NotificationSubscriptionEntry {
  /** Stable within its kind, e.g. an aircraft hex or a NORAD id. */
  id: string
  /** What the operator reads, e.g. "BAW123 — landing & departure". */
  label: string
}

/**
 * One kind of switched-on alert a section offers in Settings › Alerts (e.g.
 * Air's landing/departure bells, Space's pass alerts), so the Alerts card can
 * list and cancel them without importing the section.
 */
export interface NotificationSubscriptionSource {
  /** Key prefix, unique per source: entries are keyed `<kind>:<id>`. */
  kind: string
  /** List position; lower first. */
  order: number
  /** What is switched on now. Read inside a computed, so reactive reads are tracked. */
  list(): NotificationSubscriptionEntry[]
  /** Re-read state that is not reactive or lives on the backend. Optional. */
  refresh?(): void
  /** Switch off these entries (ids without the kind prefix). */
  turnOff(ids: string[]): Promise<void> | void
}

const targets: NotificationTarget[] = []
const subscriptionSources: NotificationSubscriptionSource[] = []
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

/** Adds a subscription source. Each kind once. */
export function registerNotificationSubscriptionSource(
  source: NotificationSubscriptionSource,
): void {
  if (subscriptionSources.some((existing) => existing.kind === source.kind)) {
    throw new Error(`Notification subscription kind "${source.kind}" is already registered`)
  }
  subscriptionSources.push(source)
  subscriptionSources.sort((first, second) => first.order - second.order)
}

/** Every registered subscription source, in list order. */
export function getNotificationSubscriptionSources(): readonly NotificationSubscriptionSource[] {
  return subscriptionSources
}

/** Test seam: forget every registered target, hook and subscription source. */
export function resetNotificationRegistryForTests(): void {
  targets.length = 0
  dismissHooks.clear()
  subscriptionSources.length = 0
}
