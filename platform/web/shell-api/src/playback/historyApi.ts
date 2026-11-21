/**
 * Reads a section's recorded movement (`GET /api/<section>/history/*`).
 *
 * The backend serves these from the section's own database, never from an
 * upstream feed, so they work the same off grid and with no internet.
 */
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'

/** One recorded position, as the samples endpoint sends it. */
export interface HistorySample {
  /** When it was observed (Unix ms). */
  t: number
  lat: number
  lon: number
  alt: number | null
  heading: number | null
  speed: number | null
  /** Which feed heard it: 'online' or 'offgrid'. */
  source: string
  /** Section-specific display fields (callsign, vessel name, APRS symbol…). */
  extra: Record<string, unknown> | null
}

export interface HistorySamplesChunk {
  from: number
  to: number
  /** The row cap cut it short; `to` is then the last time it holds. */
  truncated: boolean
  /** Samples per entity (ICAO hex, MMSI, callsign), oldest first. */
  entities: Record<string, HistorySample[]>
}

/** `[bucketStartMs, samples, source]` — a bucket heard from both sources appears once per source. */
export type CoverageBucket = [number, number, string]

export interface HistoryCoverage {
  from: number
  to: number
  bucketMs: number
  buckets: CoverageBucket[]
}

export interface HistoryStatus {
  enabled: boolean
  retentionDays: number
  oldestMs: number | null
  newestMs: number | null
  /** Positions stored (Air/Sea/Land); Space reports `tleVersions` instead. */
  samples?: number
  tleVersions?: number
  satellites?: number
  databaseBytes: number
}

/** Largest window the samples endpoint answers in one call. */
export const HISTORY_MAX_WINDOW_MS = 30 * 60 * 1000

function historyUrl(
  sectionId: PlaybackSectionId,
  endpoint: string,
  query: Record<string, string>,
): string {
  const params = new URLSearchParams(query).toString()
  return `/api/${sectionId}/history/${endpoint}${params ? `?${params}` : ''}`
}

async function readJson<Body>(url: string, signal?: AbortSignal): Promise<Body | null> {
  try {
    const response = await fetch(url, signal ? { signal } : undefined)
    if (!response.ok) return null
    return (await response.json()) as Body
  } catch (error) {
    // An abort is the caller moving on (a seek); let it see that, not "no data".
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  }
}

/** Samples in [from, to] (at most 30 min), plus the section's lookback before `from`. */
export function fetchHistorySamples(
  sectionId: PlaybackSectionId,
  fromMs: number,
  toMs: number,
  options: { bbox?: string | null; signal?: AbortSignal } = {},
): Promise<HistorySamplesChunk | null> {
  const query: Record<string, string> = {
    from: String(Math.floor(fromMs)),
    to: String(Math.floor(toMs)),
  }
  if (options.bbox) query.bbox = options.bbox
  return readJson<HistorySamplesChunk>(historyUrl(sectionId, 'samples', query), options.signal)
}

/** Which stretches of the retention window hold data (the timeline's shading). */
export function fetchHistoryCoverage(
  sectionId: PlaybackSectionId,
): Promise<HistoryCoverage | null> {
  return readJson<HistoryCoverage>(historyUrl(sectionId, 'coverage', {}))
}

/** What is stored, for the Settings status line. */
export function fetchHistoryStatus(sectionId: PlaybackSectionId): Promise<HistoryStatus | null> {
  return readJson<HistoryStatus>(historyUrl(sectionId, 'status', {}))
}
