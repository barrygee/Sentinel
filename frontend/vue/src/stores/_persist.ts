import { ref, watch, type Ref } from 'vue'

type Migrate<T> = (parsed: unknown) => Partial<T> | null

function readFromStorage<T extends object>(key: string, defaults: T, migrate?: Migrate<T>): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...defaults }
    }
    const migrated = migrate ? (migrate(parsed) ?? (parsed as Partial<T>)) : (parsed as Partial<T>)
    return { ...defaults, ...migrated }
  } catch {
    return { ...defaults }
  }
}

function writeToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

export function usePersistedObject<T extends object>(
  key: string,
  defaults: T,
  migrate?: Migrate<T>,
): Ref<T> {
  const state = ref(readFromStorage(key, defaults, migrate)) as Ref<T>
  // flush:'sync' — write on the mutation itself, not on the next scheduler tick.
  // A queued (pre-flush) write is dropped if the component unmounts before the
  // flush, which is exactly what happens when a state change is immediately
  // followed by navigating away — the change would never reach localStorage.
  watch(
    state,
    (next) => {
      writeToStorage(key, next)
    },
    { deep: true, flush: 'sync' },
  )
  return state
}

// Persist a single primitive ref (string | number | boolean) to localStorage so
// it survives both in-app navigation and a full page refresh. `validate` rejects
// stale/garbage values (e.g. a tab id that no longer exists), falling back to the
// default. Deep-watches aren't needed for primitives, so this is a plain watch.
export function usePersistedRef<T extends string | number | boolean>(
  key: string,
  fallback: T,
  validate?: (v: unknown) => v is T,
): Ref<T> {
  let initial = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown
      if (!validate || validate(parsed)) initial = parsed as T
    }
  } catch {}
  const state = ref(initial) as Ref<T>
  // flush:'sync' so the write lands immediately — a change made just before
  // navigating away (which unmounts the owning component) would otherwise lose
  // its queued pre-flush write. See usePersistedObject for the full rationale.
  watch(
    state,
    (next) => {
      writeToStorage(key, next)
    },
    { flush: 'sync' },
  )
  return state
}

// Persist a Set<string> (used for collapsed/active category chips) to localStorage
// as a JSON array. Reassign the ref to a new Set to trigger the watcher — the
// callers already follow that immutable-update pattern.
export function usePersistedStringSet(key: string): Ref<Set<string>> {
  let initial = new Set<string>()
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed))
        initial = new Set(parsed.filter((x): x is string => typeof x === 'string'))
    }
  } catch {}
  const state = ref(initial) as Ref<Set<string>>
  // flush:'sync' — see usePersistedObject. A chip toggled right before navigating
  // away must persist immediately or its write is dropped on unmount.
  watch(
    state,
    (next) => {
      writeToStorage(key, [...next])
    },
    { deep: true, flush: 'sync' },
  )
  return state
}
