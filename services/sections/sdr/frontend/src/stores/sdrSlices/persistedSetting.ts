import { ref, type Ref } from 'vue'
import { getNamespace } from '@sentinel/shell-api/services/settingsApi'

/**
 * The persistence pattern most SDR preferences share: localStorage is a
 * fast-path cache, so the first render after a load is right before the async
 * settings fetch resolves, and the `sdr` settings namespace in the database is
 * the truth the Settings controls and the config JSON editor write. Each
 * `hydrateFromDb` re-reads it, so an uploaded config reaches the live store.
 */
export interface PersistedSetting<Value> {
  value: Ref<Value>
  /** Set the value and cache it; a failed cache write is ignored. */
  set: (next: Value) => void
  /** Adopt the value stored in the `sdr` namespace, when valid and different. */
  hydrateFromDb: () => Promise<void>
}

interface PersistedFlagOptions {
  /** localStorage key of the fast-path cache. */
  storageKey: string
  /** Value when nothing (or anything unreadable) is cached. */
  defaultValue: boolean
  /** Key in the `sdr` settings namespace; omit for a flag the DB never sets. */
  settingKey?: string
  /** Runs after every set (including one made by `hydrateFromDb`). */
  afterSet?: (next: boolean) => void
}

/**
 * A boolean preference cached as `'1'` / `'0'`. A default-ON flag reads as
 * false only for an explicit `'0'`; a default-OFF flag reads as true only for
 * an explicit `'1'`, so a stray value falls back to the default either way.
 */
export function usePersistedFlag(options: PersistedFlagOptions): PersistedSetting<boolean> {
  const { storageKey, defaultValue, settingKey, afterSet } = options

  function readCached(): boolean {
    try {
      const cached = localStorage.getItem(storageKey)
      return defaultValue ? cached !== '0' : cached === '1'
    } catch {
      return defaultValue
    }
  }

  const value = ref<boolean>(readCached())

  function set(next: boolean) {
    value.value = next
    try {
      localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {}
    afterSet?.(next)
  }

  async function hydrateFromDb(): Promise<void> {
    // A flag only the store sets (APRS, which hydrateAprsFromDb reconciles) has no key.
    if (settingKey === undefined) return
    const data = await getNamespace('sdr')
    if (!data) return
    const storedValue = data[settingKey]
    if (typeof storedValue === 'boolean' && storedValue !== value.value) set(storedValue)
  }

  return { value, set, hydrateFromDb }
}

interface PersistedWholeNumberOptions {
  /** localStorage key of the fast-path cache; null for a value only the backend reads. */
  storageKey: string | null
  /** Key in the `sdr` settings namespace. */
  settingKey: string
  /** Smallest valid value; anything below (or not finite) becomes the default. */
  minimum: number
  defaultValue: number
}

/**
 * A whole-number preference (seconds, minutes) with a floor. Set values are
 * rounded down; a value below the floor, or not a number, falls back to the
 * default rather than being clamped up to it.
 */
export function usePersistedWholeNumber(
  options: PersistedWholeNumberOptions,
): PersistedSetting<number> {
  const { storageKey, settingKey, minimum, defaultValue } = options

  function readCached(): number {
    if (storageKey === null) return defaultValue
    try {
      const cached = localStorage.getItem(storageKey)
      const parsed = cached == null ? NaN : parseInt(cached, 10)
      return isFinite(parsed) && parsed >= minimum ? parsed : defaultValue
    } catch {
      return defaultValue
    }
  }

  const value = ref<number>(readCached())

  function set(next: number) {
    const clamped = isFinite(next) && next >= minimum ? Math.floor(next) : defaultValue
    value.value = clamped
    if (storageKey === null) return
    try {
      localStorage.setItem(storageKey, String(clamped))
    } catch {}
  }

  async function hydrateFromDb(): Promise<void> {
    const data = await getNamespace('sdr')
    if (!data) return
    const storedValue = data[settingKey]
    if (typeof storedValue === 'number' && storedValue >= minimum && storedValue !== value.value) {
      set(storedValue)
    }
  }

  return { value, set, hydrateFromDb }
}
