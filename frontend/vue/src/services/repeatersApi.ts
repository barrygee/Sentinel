/**
 * Typed fetch wrapper for `GET /api/land/repeaters` — the UK amateur-radio
 * repeater directory, cached and normalised by the backend.
 */
import type { RepeaterDirectory } from '@/types/repeaters'

const ENDPOINT = '/api/land/repeaters'

/**
 * Fetch the directory. Resolves to `null` on any failure (offline, 503 when
 * the backend has no copy at all) so the store can keep whatever it last held.
 */
export async function fetchRepeaterDirectory(): Promise<RepeaterDirectory | null> {
  try {
    const response = await fetch(ENDPOINT)
    if (!response.ok) return null
    const payload = (await response.json()) as Partial<RepeaterDirectory>
    if (!Array.isArray(payload.stations)) return null
    return {
      source: payload.source ?? 'cached',
      fetchedAt: typeof payload.fetchedAt === 'number' ? payload.fetchedAt : null,
      stations: payload.stations,
    }
  } catch {
    return null
  }
}
