import {
  fetchHistorySamples,
  type HistorySample,
  type HistorySamplesChunk,
} from '@sentinel/shell-api/playback/historyApi'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'

/** One entity as it was at the replayed moment. */
export interface HistoryFrameEntity {
  /** ICAO hex, MMSI or callsign. */
  id: string
  /**
   * When this position is "from": the replayed moment itself when it was
   * interpolated between two samples, else the sample's own time (so a map
   * ages it exactly as it would have aged live).
   */
  t: number
  lat: number
  lon: number
  alt: number | null
  heading: number | null
  speed: number | null
  source: string
  extra: Record<string, unknown> | null
}

export type FetchHistoryChunk = (
  sectionId: PlaybackSectionId,
  fromMs: number,
  toMs: number,
  options: { bbox?: string | null; signal?: AbortSignal },
) => Promise<HistorySamplesChunk | null>

export interface HistoryFramePlayerOptions {
  sectionId: PlaybackSectionId
  /**
   * How long after its last sample an entity is still shown, matching the
   * section's live behaviour (Air: a minute; Sea/Land: half an hour).
   */
  holdMs: number
  /** Interpolate only between samples this close together; a longer gap is reception lost, not a straight line. */
  maxInterpolationGapMs?: number
  /** Chunk length fetched per request (the server answers at most 30 min). */
  chunkMs?: number
  /** Restricts what is fetched to an area (`"s,w,n,e"`); a change starts the cache afresh. */
  bbox?: () => string | null
  fetchChunk?: FetchHistoryChunk
}

interface CachedChunk {
  bbox: string | null
  load: Promise<HistorySamplesChunk | null>
  /** Set once `load` has resolved, so tracks can be read without waiting. */
  loaded?: HistorySamplesChunk | null
}

const DEFAULT_CHUNK_MS = 10 * 60 * 1000
const DEFAULT_MAX_INTERPOLATION_GAP_MS = 5 * 60 * 1000
/** Fetch the next chunk once the cursor is this close to the end of the current one. */
const PREFETCH_LEAD_MS = 2 * 60 * 1000
/** Chunks kept around the cursor: the current one, the next, and a couple behind for a step back. */
const MAX_CACHED_CHUNKS = 4

/** Index of the last sample at or before `atMs`, or -1. Samples are oldest first. */
export function lastSampleIndexAtOrBefore(samples: HistorySample[], atMs: number): number {
  let low = 0
  let high = samples.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (samples[middle]!.t <= atMs) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

function interpolateNumber(
  from: number | null,
  to: number | null,
  fraction: number,
): number | null {
  if (from === null) return to
  if (to === null) return from
  return from + (to - from) * fraction
}

/** Longitude interpolation the short way round, so a track crossing ±180° doesn't sweep the globe. */
function interpolateLongitude(from: number, to: number, fraction: number): number {
  const shortestDelta = ((to - from + 540) % 360) - 180
  const longitude = from + shortestDelta * fraction
  return ((longitude + 540) % 360) - 180
}

/**
 * Turns a section's recorded samples into "what was on the map at moment T".
 *
 * Loads history in chunks around the cursor (prefetching the next one as
 * playback nears it), and for each entity returns its last sample at or
 * before T — moved along the straight line to the following sample when one
 * is close enough. Plain TypeScript with no Vue or map dependency, so a map
 * control class can own one.
 */
export class HistoryFramePlayer {
  private readonly options: Required<Omit<HistoryFramePlayerOptions, 'bbox'>> &
    Pick<HistoryFramePlayerOptions, 'bbox'>
  private readonly chunks = new Map<number, CachedChunk>()
  private aborter: AbortController | null = null

  constructor(options: HistoryFramePlayerOptions) {
    this.options = {
      chunkMs: DEFAULT_CHUNK_MS,
      maxInterpolationGapMs: DEFAULT_MAX_INTERPOLATION_GAP_MS,
      fetchChunk: fetchHistorySamples,
      ...options,
    }
  }

  /** Every entity on the map at `atMs`. */
  async frameAt(atMs: number): Promise<HistoryFrameEntity[]> {
    const { chunkMs } = this.options
    const chunkStart = Math.floor(atMs / chunkMs) * chunkMs
    const chunk = await this.chunkStartingAt(chunkStart)
    if (atMs > chunkStart + chunkMs - PREFETCH_LEAD_MS)
      void this.chunkStartingAt(chunkStart + chunkMs)
    this.evictAround(chunkStart)
    return chunk ? this.entitiesAt(chunk, atMs) : []
  }

  /**
   * One entity's recorded path up to `atMs`, from the chunks already loaded
   * (roughly the last half hour around the cursor): the replayed equivalent of
   * a live "recent track". Oldest first, each time once.
   */
  trackUntil(id: string, atMs: number): HistorySample[] {
    const byTime = new Map<number, HistorySample>()
    for (const cachedChunk of this.chunks.values()) {
      for (const sample of cachedChunk.loaded?.entities[id] ?? []) {
        if (sample.t <= atMs) byTime.set(sample.t, sample)
      }
    }
    return [...byTime.values()].sort((left, right) => left.t - right.t)
  }

  /** Forget every cached chunk and cancel loads in flight (the area changed, or replay ended). */
  reset(): void {
    this.aborter?.abort()
    this.aborter = null
    this.chunks.clear()
  }

  private currentBbox(): string | null {
    return this.options.bbox ? this.options.bbox() : null
  }

  private chunkStartingAt(chunkStart: number): Promise<HistorySamplesChunk | null> {
    const bbox = this.currentBbox()
    const cached = this.chunks.get(chunkStart)
    if (cached && cached.bbox === bbox) return cached.load
    if (!this.aborter) this.aborter = new AbortController()
    const signal = this.aborter.signal
    const load = this.options
      .fetchChunk(this.options.sectionId, chunkStart, chunkStart + this.options.chunkMs, {
        bbox,
        signal,
      })
      .catch(() => null)
    const cachedChunk: CachedChunk = { bbox, load }
    this.chunks.set(chunkStart, cachedChunk)
    void load.then((result) => {
      cachedChunk.loaded = result
      // A failed load must not stick: the next frame asks again.
      if (result === null && this.chunks.get(chunkStart) === cachedChunk)
        this.chunks.delete(chunkStart)
    })
    return load
  }

  private evictAround(chunkStart: number): void {
    if (this.chunks.size <= MAX_CACHED_CHUNKS) return
    const byDistance = [...this.chunks.keys()].sort(
      (left, right) => Math.abs(right - chunkStart) - Math.abs(left - chunkStart),
    )
    for (const key of byDistance.slice(0, this.chunks.size - MAX_CACHED_CHUNKS))
      this.chunks.delete(key)
  }

  private entitiesAt(chunk: HistorySamplesChunk, atMs: number): HistoryFrameEntity[] {
    const { holdMs, maxInterpolationGapMs } = this.options
    const frame: HistoryFrameEntity[] = []
    for (const [id, samples] of Object.entries(chunk.entities)) {
      const index = lastSampleIndexAtOrBefore(samples, atMs)
      if (index < 0) continue
      const sample = samples[index]!
      if (atMs - sample.t > holdMs) continue
      const next = samples[index + 1]
      if (!next || next.t - sample.t > maxInterpolationGapMs || next.t <= sample.t) {
        frame.push({ id, ...sample })
        continue
      }
      const fraction = (atMs - sample.t) / (next.t - sample.t)
      frame.push({
        id,
        t: atMs,
        lat: sample.lat + (next.lat - sample.lat) * fraction,
        lon: interpolateLongitude(sample.lon, next.lon, fraction),
        alt: interpolateNumber(sample.alt, next.alt, fraction),
        heading: sample.heading ?? next.heading,
        speed: interpolateNumber(sample.speed, next.speed, fraction),
        source: sample.source,
        // Display fields from the newer sample once past halfway (a callsign
        // set or squawk change shows at about the time it happened).
        extra: fraction >= 0.5 ? (next.extra ?? sample.extra) : (sample.extra ?? next.extra),
      })
    }
    return frame
  }
}
