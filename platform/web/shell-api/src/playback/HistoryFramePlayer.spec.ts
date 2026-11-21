import { describe, it, expect, vi } from 'vitest'
import {
  HistoryFramePlayer,
  lastSampleIndexAtOrBefore,
  type FetchHistoryChunk,
} from './HistoryFramePlayer'
import type { HistorySample, HistorySamplesChunk } from './historyApi'

const MINUTE = 60_000
const CHUNK = 10 * MINUTE

function sample(
  t: number,
  lat = 50,
  lon = 0,
  overrides: Partial<HistorySample> = {},
): HistorySample {
  return {
    t,
    lat,
    lon,
    alt: null,
    heading: null,
    speed: null,
    source: 'online',
    extra: null,
    ...overrides,
  }
}

function chunk(entities: Record<string, HistorySample[]>): HistorySamplesChunk {
  return { from: 0, to: 0, truncated: false, entities }
}

/** A fetch that answers every chunk with `entities`, recording what was asked. */
function fetchReturning(entities: Record<string, HistorySample[]>) {
  const calls: Array<{ from: number; to: number; bbox: string | null | undefined }> = []
  const fetchChunk: FetchHistoryChunk = vi.fn(async (_section, from, to, options) => {
    calls.push({ from, to, bbox: options.bbox })
    return chunk(entities)
  })
  return { fetchChunk, calls }
}

describe('lastSampleIndexAtOrBefore', () => {
  const samples = [sample(10), sample(20), sample(30)]
  it.each([
    [5, -1],
    [10, 0],
    [25, 1],
    [30, 2],
    [99, 2],
  ])('at %d is index %d', (atMs, expected) => {
    expect(lastSampleIndexAtOrBefore(samples, atMs)).toBe(expected)
  })

  it('is -1 for no samples', () => {
    expect(lastSampleIndexAtOrBefore([], 10)).toBe(-1)
  })
})

describe('HistoryFramePlayer', () => {
  it('fetches the chunk containing the moment for its section', async () => {
    const { fetchChunk, calls } = fetchReturning({})
    const player = new HistoryFramePlayer({ sectionId: 'sea', holdMs: MINUTE, fetchChunk })
    await player.frameAt(3 * CHUNK + MINUTE)
    expect(calls).toEqual([{ from: 3 * CHUNK, to: 4 * CHUNK, bbox: null }])
    expect(vi.mocked(fetchChunk).mock.calls[0]![0]).toBe('sea')
  })

  it('reuses a loaded chunk', async () => {
    const { fetchChunk, calls } = fetchReturning({})
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    await player.frameAt(CHUNK + MINUTE)
    await player.frameAt(CHUNK + 2 * MINUTE)
    expect(calls).toHaveLength(1)
  })

  it('prefetches the next chunk near the end of the current one', async () => {
    const { fetchChunk, calls } = fetchReturning({})
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    await player.frameAt(CHUNK + 9 * MINUTE)
    expect(calls.map((call) => call.from)).toEqual([CHUNK, 2 * CHUNK])
  })

  it('returns the last sample within the hold, and drops entities held too long or not yet seen', async () => {
    const at = CHUNK + 5 * MINUTE
    const { fetchChunk } = fetchReturning({
      fresh: [sample(at - 30_000, 51, 1, { source: 'offgrid', extra: { flight: 'A' } })],
      stale: [sample(at - 2 * MINUTE)],
      future: [sample(at + 1000)],
    })
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    expect(await player.frameAt(at)).toEqual([
      {
        id: 'fresh',
        t: at - 30_000,
        lat: 51,
        lon: 1,
        alt: null,
        heading: null,
        speed: null,
        source: 'offgrid',
        extra: { flight: 'A' },
      },
    ])
  })

  it('interpolates between close samples and dates the result at the moment', async () => {
    const start = CHUNK + MINUTE
    const { fetchChunk } = fetchReturning({
      a: [
        sample(start, 50, 0, { alt: 1000, speed: 100, heading: 90, extra: { flight: 'OLD' } }),
        sample(start + 60_000, 51, 2, {
          alt: 3000,
          speed: 200,
          heading: 95,
          extra: { flight: 'NEW' },
        }),
      ],
    })
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: 2 * MINUTE, fetchChunk })
    const [quarter] = await player.frameAt(start + 15_000)
    expect(quarter).toMatchObject({
      t: start + 15_000,
      lat: 50.25,
      lon: 0.5,
      alt: 1500,
      speed: 125,
      heading: 90,
    })
    expect(quarter!.extra).toEqual({ flight: 'OLD' })
    const [threeQuarters] = await player.frameAt(start + 45_000)
    expect(threeQuarters!.extra).toEqual({ flight: 'NEW' })
  })

  it('fills a missing value from whichever side has it', async () => {
    const start = CHUNK + MINUTE
    const { fetchChunk } = fetchReturning({
      a: [
        sample(start, 50, 0, { alt: null, speed: 100, heading: null, extra: null }),
        sample(start + 60_000, 50, 0, {
          alt: 2000,
          speed: null,
          heading: 45,
          extra: { name: 'X' },
        }),
      ],
    })
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: 2 * MINUTE, fetchChunk })
    const [early] = await player.frameAt(start + 10_000)
    expect(early).toMatchObject({ alt: 2000, speed: 100, heading: 45, extra: { name: 'X' } })
    const [late] = await player.frameAt(start + 50_000)
    expect(late!.extra).toEqual({ name: 'X' })
  })

  it('interpolates longitude the short way across the antimeridian', async () => {
    const start = CHUNK + MINUTE
    const { fetchChunk } = fetchReturning({
      a: [sample(start, 0, 179), sample(start + 60_000, 0, -179)],
    })
    const player = new HistoryFramePlayer({ sectionId: 'sea', holdMs: 2 * MINUTE, fetchChunk })
    const [halfway] = await player.frameAt(start + 30_000)
    expect(Math.abs(halfway!.lon)).toBeCloseTo(180, 5)
    const [quarter] = await player.frameAt(start + 15_000)
    expect(quarter!.lon).toBeCloseTo(179.5, 5)
  })

  it('holds a fix instead of interpolating across a long gap', async () => {
    const start = CHUNK + MINUTE
    const { fetchChunk } = fetchReturning({
      a: [sample(start, 50, 0), sample(start + 6 * MINUTE, 55, 5)],
    })
    const player = new HistoryFramePlayer({ sectionId: 'land', holdMs: 10 * MINUTE, fetchChunk })
    const [held] = await player.frameAt(start + MINUTE)
    expect(held).toMatchObject({ t: start, lat: 50, lon: 0 })
  })

  it('a zero interpolation gap always holds', async () => {
    const start = CHUNK + MINUTE
    const { fetchChunk } = fetchReturning({
      a: [sample(start, 50, 0), sample(start + 1000, 51, 0)],
    })
    const player = new HistoryFramePlayer({
      sectionId: 'land',
      holdMs: MINUTE,
      maxInterpolationGapMs: 0,
      fetchChunk,
    })
    expect((await player.frameAt(start + 500))[0]).toMatchObject({ t: start, lat: 50 })
  })

  it('passes the area and refetches when it changes', async () => {
    const { fetchChunk, calls } = fetchReturning({})
    let area = '50,-1,52,1'
    const player = new HistoryFramePlayer({
      sectionId: 'sea',
      holdMs: MINUTE,
      fetchChunk,
      bbox: () => area,
    })
    await player.frameAt(CHUNK + MINUTE)
    await player.frameAt(CHUNK + MINUTE)
    area = '40,-1,42,1'
    await player.frameAt(CHUNK + MINUTE)
    expect(calls.map((call) => call.bbox)).toEqual(['50,-1,52,1', '40,-1,42,1'])
  })

  it('a failed chunk is asked for again next frame', async () => {
    const fetchChunk: FetchHistoryChunk = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(chunk({ a: [sample(CHUNK + MINUTE)] }))
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    expect(await player.frameAt(CHUNK + MINUTE)).toEqual([])
    expect(await player.frameAt(CHUNK + MINUTE)).toEqual([])
    expect(await player.frameAt(CHUNK + MINUTE)).toHaveLength(1)
    expect(fetchChunk).toHaveBeenCalledTimes(3)
  })

  it('keeps at most four chunks, dropping the furthest from the cursor', async () => {
    const { fetchChunk, calls } = fetchReturning({})
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    for (const index of [1, 2, 3, 4, 5]) await player.frameAt(index * CHUNK + MINUTE)
    await player.frameAt(5 * CHUNK + MINUTE) // still cached
    await player.frameAt(1 * CHUNK + MINUTE) // was evicted: fetched again
    expect(calls.map((call) => call.from / CHUNK)).toEqual([1, 2, 3, 4, 5, 1])
  })

  it('reset forgets the cache and aborts loads in flight', async () => {
    const signals: AbortSignal[] = []
    const fetchChunk: FetchHistoryChunk = vi.fn(async (_section, _from, _to, options) => {
      signals.push(options.signal!)
      return chunk({})
    })
    const player = new HistoryFramePlayer({ sectionId: 'air', holdMs: MINUTE, fetchChunk })
    await player.frameAt(CHUNK + MINUTE)
    player.reset()
    expect(signals[0]!.aborted).toBe(true)
    await player.frameAt(CHUNK + MINUTE)
    expect(fetchChunk).toHaveBeenCalledTimes(2)
    expect(signals[1]!.aborted).toBe(false)
    player.reset()
    player.reset() // twice is harmless
  })

  it('trackUntil gathers one entity across loaded chunks, oldest first, up to the moment', async () => {
    const fetchChunk: FetchHistoryChunk = vi.fn(async (_section, from) =>
      chunk({
        a: [sample(from + MINUTE), sample(from + 5 * MINUTE)],
        b: [sample(from + 2 * MINUTE)],
      }),
    )
    const player = new HistoryFramePlayer({ sectionId: 'sea', holdMs: CHUNK, fetchChunk })
    await player.frameAt(CHUNK + 9 * MINUTE) // loads chunk 1, prefetches chunk 2
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const track = player.trackUntil('a', 2 * CHUNK + 2 * MINUTE)
    expect(track.map((point) => point.t)).toEqual([
      CHUNK + MINUTE,
      CHUNK + 5 * MINUTE,
      2 * CHUNK + MINUTE,
    ])
    expect(player.trackUntil('nobody', 3 * CHUNK)).toEqual([])
  })

  it('trackUntil ignores chunks still loading', () => {
    const fetchChunk: FetchHistoryChunk = vi.fn(
      () => new Promise<HistorySamplesChunk | null>(() => {}),
    )
    const player = new HistoryFramePlayer({ sectionId: 'sea', holdMs: CHUNK, fetchChunk })
    void player.frameAt(CHUNK)
    expect(player.trackUntil('a', 2 * CHUNK)).toEqual([])
  })
})
