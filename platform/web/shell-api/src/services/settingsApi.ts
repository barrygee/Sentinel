const BASE = '/api/settings'

/**
 * Document event fired after any write that changes what the app-config JSON
 * would contain — a settings PUT/DELETE, a radio or ADS-B/APRS source change.
 * The Application Config editor listens so the JSON it shows follows the UI
 * without the panel having to be closed and reopened.
 */
export const SETTINGS_CHANGED_EVENT = 'sentinel:settings-changed'

/** Announce that persisted settings changed (see {@link SETTINGS_CHANGED_EVENT}). */
export function notifySettingsChanged(): void {
  document.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT))
}

/** Namespace reads still on the wire, so callers asking at once share one request. */
const namespaceReadsInFlight = new Map<string, Promise<Record<string, unknown> | null>>()

async function fetchNamespace(ns: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/${ns}`)
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Read one settings namespace, or null when it can't be read.
 *
 * Startup hydrates many stores in the same tick, each wanting the same
 * namespace, so callers overlapping an unfinished read share its request. A
 * read is never reused once it has finished, so nothing here goes stale. Each
 * caller gets its own copy, as some keep or change what they are given.
 */
export async function getNamespace(ns: string): Promise<Record<string, unknown> | null> {
  let namespaceRead = namespaceReadsInFlight.get(ns)
  if (!namespaceRead) {
    const startedRead = fetchNamespace(ns).finally(() => {
      if (namespaceReadsInFlight.get(ns) === startedRead) namespaceReadsInFlight.delete(ns)
    })
    namespaceReadsInFlight.set(ns, startedRead)
    namespaceRead = startedRead
  }
  const settings = await namespaceRead
  return settings && structuredClone(settings)
}

export async function put(ns: string, key: string, value: unknown): Promise<void> {
  try {
    await fetch(`${BASE}/${ns}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    // A read started before this write may not see it, so later readers start afresh.
    namespaceReadsInFlight.delete(ns)
    notifySettingsChanged()
  } catch {}
}

export async function del(ns: string, key: string): Promise<void> {
  try {
    await fetch(`${BASE}/${ns}/${key}`, { method: 'DELETE' })
    namespaceReadsInFlight.delete(ns)
    notifySettingsChanged()
  } catch {}
}

export async function getAll(): Promise<Record<string, Record<string, unknown>> | null> {
  try {
    const res = await fetch(BASE)
    if (!res.ok) return null
    return (await res.json()) as Record<string, Record<string, unknown>>
  } catch {
    return null
  }
}

/** The backend's live config file, as `GET /api/settings/config/file-status` reports it. */
export interface ConfigFileStatus {
  /** Absolute path of the live `sentinel_config.json` on the server. */
  path: string
  /** False when the backend isn't mirroring settings to the file (e.g. in tests). */
  syncing: boolean
  /** Epoch ms of the last hand-edit of the file that was applied; 0 = none since startup. */
  external_edit_at: number
}

/** Read the live config file's status, or null if the backend can't be reached. */
export async function getConfigFileStatus(): Promise<ConfigFileStatus | null> {
  try {
    const res = await fetch(`${BASE}/config/file-status`)
    if (!res.ok) return null
    const status = (await res.json()) as Partial<ConfigFileStatus>
    return typeof status.external_edit_at === 'number' ? (status as ConfigFileStatus) : null
  } catch {
    return null
  }
}
