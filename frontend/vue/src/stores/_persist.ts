import { ref, watch, type Ref } from 'vue'

type Migrate<T> = (parsed: unknown) => Partial<T> | null

function readFromStorage<T extends object>(
  key: string,
  defaults: T,
  migrate?: Migrate<T>,
): T {
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
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function usePersistedObject<T extends object>(
  key: string,
  defaults: T,
  migrate?: Migrate<T>,
): Ref<T> {
  const state = ref(readFromStorage(key, defaults, migrate)) as Ref<T>
  watch(state, (next) => { writeToStorage(key, next) }, { deep: true })
  return state
}
