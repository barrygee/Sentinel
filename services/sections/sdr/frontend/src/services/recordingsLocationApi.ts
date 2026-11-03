/**
 * Where the SDR section saves new recordings, as the operator would find the
 * folder (`GET /api/sdr/recordings/location`).
 */

/** How the recordings folder is provided. */
export type RecordingsLocationKind = 'host' | 'volume' | 'local'

/** The recordings folder: a path on the host, a Docker volume name, or a local path. */
export interface RecordingsLocation {
  directory: string
  kind: RecordingsLocationKind
}

function isRecordingsLocation(value: unknown): value is RecordingsLocation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.directory === 'string' &&
    candidate.directory !== '' &&
    (candidate.kind === 'host' || candidate.kind === 'volume' || candidate.kind === 'local')
  )
}

/**
 * Fetch the recordings folder.
 *
 * @returns The location, or `null` when the request fails or the reply is not
 *   a location (an older backend without the endpoint, or the SDR service down).
 */
export async function fetchRecordingsLocation(): Promise<RecordingsLocation | null> {
  try {
    const response = await fetch('/api/sdr/recordings/location')
    if (!response.ok) return null
    const body: unknown = await response.json()
    return isRecordingsLocation(body) ? body : null
  } catch {
    return null
  }
}

/**
 * How to name the folder in the Recordings Folder field: the path itself, or
 * for a Docker volume (reachable only through the app) its name and that it is
 * a volume.
 */
export function describeRecordingsLocation(location: RecordingsLocation): string {
  return location.kind === 'volume' ? `${location.directory} (Docker volume)` : location.directory
}
