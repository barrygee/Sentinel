import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchRepeaterDirectory } from './repeatersApi'
import type { RepeaterStation } from '@/types/repeaters'

function station(callsign = 'GB3NR'): RepeaterStation {
  return {
    callsign,
    latitude: 52.6,
    longitude: 1.3,
    locator: 'JO02',
    location: 'NORWICH',
    postcode: 'NR2',
    region: 'EA',
    keeper: 'G4XYZ',
    channels: [],
  }
}

/** Minimal stand-in for the parts of `Response` the service reads. */
function respond(status: number, body: unknown, jsonThrows = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows ? () => Promise.reject(new Error('not json')) : async () => body,
  }
}

function stubFetch(result: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(result)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchRepeaterDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('requests the land repeaters endpoint', async () => {
    const fetchMock = stubFetch(respond(200, { source: 'online', fetchedAt: 1, stations: [] }))
    await fetchRepeaterDirectory()
    expect(fetchMock).toHaveBeenCalledWith('/api/land/repeaters')
  })

  it('returns the normalised directory from a successful response', async () => {
    stubFetch(
      respond(200, { source: 'online', fetchedAt: 1_700_000_000_000, stations: [station()] }),
    )
    await expect(fetchRepeaterDirectory()).resolves.toEqual({
      source: 'online',
      fetchedAt: 1_700_000_000_000,
      stations: [station()],
    })
  })

  it('returns an empty directory when the backend has no stations to serve', async () => {
    stubFetch(respond(200, { source: 'bundled', fetchedAt: null, stations: [] }))
    await expect(fetchRepeaterDirectory()).resolves.toEqual({
      source: 'bundled',
      fetchedAt: null,
      stations: [],
    })
  })

  it('defaults a missing source to "cached"', async () => {
    stubFetch(respond(200, { stations: [] }))
    const directory = await fetchRepeaterDirectory()
    expect(directory?.source).toBe('cached')
  })

  it('nulls a fetchedAt that is not a number', async () => {
    stubFetch(respond(200, { source: 'cached', fetchedAt: 'yesterday', stations: [] }))
    await expect(fetchRepeaterDirectory()).resolves.toMatchObject({ fetchedAt: null })
  })

  it('returns null when the payload has no stations array', async () => {
    stubFetch(respond(200, { source: 'cached', fetchedAt: 1 }))
    await expect(fetchRepeaterDirectory()).resolves.toBeNull()
  })

  it('returns null when stations is present but not an array', async () => {
    stubFetch(respond(200, { stations: { GB3NR: station() } }))
    await expect(fetchRepeaterDirectory()).resolves.toBeNull()
  })

  it('returns null on a 503 from the backend', async () => {
    stubFetch(respond(503, { detail: 'no directory available' }))
    await expect(fetchRepeaterDirectory()).resolves.toBeNull()
  })

  it('returns null when the response body is not JSON', async () => {
    stubFetch(respond(200, null, true))
    await expect(fetchRepeaterDirectory()).resolves.toBeNull()
  })

  it('returns null when the request itself fails (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchRepeaterDirectory()).resolves.toBeNull()
  })
})
