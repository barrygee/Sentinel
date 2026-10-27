import { onBeforeUnmount, shallowReactive, watch } from 'vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'

/** Thrown by `applyAll` when one or more records failed to save; the rest were saved. */
export class StagedEditsError<Key> extends Error {
  constructor(readonly failedKeys: Key[]) {
    super(`${failedKeys.length} staged edit(s) failed to save`)
    this.name = 'StagedEditsError'
  }
}

export interface UseStagedEditsOptions<Key, Draft> {
  /**
   * Saves one record's draft. Throws to report a failure: the consumer shows
   * the reason beside that record before throwing.
   */
  save: (key: Key, draft: Draft) => Promise<void>
  /** Hands APPLY CHANGES the closure that saves every staged draft (the control's `stage` emit). */
  stage: (apply: () => Promise<void>) => void
}

export interface StagedEdits<Key, Draft> {
  /** The unsaved draft of each edited record. */
  readonly drafts: ReadonlyMap<Key, Draft>
  /** Stages (or replaces) one record's draft for APPLY CHANGES. */
  set: (key: Key, draft: Draft) => void
  /** Drops one record's draft, e.g. when its form is cancelled. */
  discard: (key: Key) => void
  /** Saves every staged draft in turn; see `UseStagedEditsOptions.save`. */
  applyAll: () => Promise<void>
}

/**
 * `useStagedEdits` — for a Settings card that edits several records in place
 * (this machine's SDRs, the SDR hosts): each record's form drafts its edits
 * here instead of saving them, and APPLY CHANGES saves them all.
 *
 * Every Settings control stages its change for APPLY CHANGES; a form with its
 * own SAVE leaves APPLY CHANGES saying "NO CHANGES" straight after an edit.
 * Adding, deleting and other one-off actions still act at once.
 *
 * Drafts are saved one after another (two edits that swap ports land in
 * order) and each one that saves is cleared, so a failed APPLY keeps only the
 * failures staged. Like the panel's other staged changes, they are dropped
 * when the panel opens again and when the card unmounts.
 */
export function useStagedEdits<Key, Draft>(
  options: UseStagedEditsOptions<Key, Draft>,
): StagedEdits<Key, Draft> {
  const drafts = shallowReactive(new Map<Key, Draft>())

  async function applyAll(): Promise<void> {
    const failedKeys: Key[] = []
    for (const [key, draft] of [...drafts]) {
      try {
        await options.save(key, draft)
        drafts.delete(key)
      } catch {
        failedKeys.push(key)
      }
    }
    if (failedKeys.length > 0) throw new StagedEditsError(failedKeys)
  }

  function set(key: Key, draft: Draft): void {
    drafts.set(key, draft)
    options.stage(applyAll)
  }

  function discard(key: Key): void {
    drafts.delete(key)
  }

  // The panel stays mounted while closed: unapplied edits go when it reopens.
  const settingsStore = useSettingsStore()
  watch(
    () => settingsStore.open,
    (open) => {
      if (open) drafts.clear()
    },
  )
  onBeforeUnmount(() => drafts.clear())

  return { drafts, set, discard, applyAll }
}
