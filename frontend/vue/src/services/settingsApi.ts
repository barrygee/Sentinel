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

export async function getNamespace(ns: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/${ns}`)
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function put(ns: string, key: string, value: unknown): Promise<void> {
  try {
    await fetch(`${BASE}/${ns}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    notifySettingsChanged()
  } catch {}
}

export async function del(ns: string, key: string): Promise<void> {
  try {
    await fetch(`${BASE}/${ns}/${key}`, { method: 'DELETE' })
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
