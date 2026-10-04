import { computed, ref, type ComputedRef } from 'vue'
import { getNotificationSubscriptionSources } from '@/shell/notificationRegistry'

/** One thing the app is currently set to notify the operator about. */
export interface NotificationSubscription {
  /** Stable across refreshes, e.g. `aircraft:4ca7b1`, `satellite:25544`, `overhead:user:civil`. */
  key: string
  /** What the operator reads, e.g. "BAW123 — landing & departure". */
  label: string
}

/**
 * Every notification the operator has switched on, gathered from the
 * subscription sources the sections registered (shell/notificationRegistry.ts)
 * — Air's landing/departure bells and overhead alerts, Space's pass bells.
 *
 * Some sources are not reactive (Space's pass bells live in plain
 * localStorage) or live on the backend (overhead alerts), so the list is
 * re-read with `refresh()`, e.g. whenever the Settings panel opens.
 */
export function useNotificationSubscriptions(): {
  subscriptions: ComputedRef<NotificationSubscription[]>
  refresh: () => void
  turnOff: (keys: Iterable<string>) => Promise<void>
} {
  /** Bumped by `refresh()` so non-reactive sources are re-read. */
  const version = ref(0)

  const subscriptions = computed<NotificationSubscription[]>(() => {
    void version.value
    return getNotificationSubscriptionSources().flatMap((source) =>
      source.list().map((entry) => ({ key: `${source.kind}:${entry.id}`, label: entry.label })),
    )
  })

  /** Re-read every source. */
  function refresh(): void {
    version.value += 1
    for (const source of getNotificationSubscriptionSources()) source.refresh?.()
  }

  /**
   * Switch off the given subscriptions, each through the source that owns its
   * kind (a source persists what it must — e.g. overhead alerts to the backend),
   * then re-read the list.
   */
  async function turnOff(keys: Iterable<string>): Promise<void> {
    const idsByKind = new Map<string, string[]>()
    for (const key of keys) {
      const separator = key.indexOf(':')
      const kind = key.slice(0, separator)
      // The id can itself contain a colon (`sentry:3:civil`), so split once only.
      idsByKind.set(kind, [...(idsByKind.get(kind) ?? []), key.slice(separator + 1)])
    }
    for (const source of getNotificationSubscriptionSources()) {
      const ids = idsByKind.get(source.kind)
      if (ids) await source.turnOff(ids)
    }
    refresh()
  }

  return { subscriptions, refresh, turnOff }
}
