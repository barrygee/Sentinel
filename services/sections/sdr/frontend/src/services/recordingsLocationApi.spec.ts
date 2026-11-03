import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRecordingsLocation, fetchRecordingsLocation } from './recordingsLocationApi'

function stubFetch(response: Partial<Response> | Error): ReturnType<typeof vi.fn> {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonReply(body: unknown): Partial<Response> {
  return { ok: true, json: async () => body }
}

describe('fetchRecordingsLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the SDR section where recordings are saved', async () => {
    const fetchMock = stubFetch(jsonReply({ directory: 'sdr_recordings', kind: 'volume' }))
    expect(await fetchRecordingsLocation()).toEqual({ directory: 'sdr_recordings', kind: 'volume' })
    expect(fetchMock).toHaveBeenCalledWith('/api/sdr/recordings/location')
  })

  it.each(['host', 'volume', 'local'] as const)('accepts a %s location', async (kind) => {
    stubFetch(jsonReply({ directory: '/data/recordings', kind }))
    expect(await fetchRecordingsLocation()).toEqual({ directory: '/data/recordings', kind })
  })

  it('gives up on an error reply (no endpoint on an older backend, SDR down)', async () => {
    stubFetch({ ok: false, json: async () => ({ directory: 'x', kind: 'host' }) })
    expect(await fetchRecordingsLocation()).toBeNull()
  })

  it('gives up when the request fails', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await fetchRecordingsLocation()).toBeNull()
  })

  it.each([
    ['not an object', 'sdr_recordings'],
    ['null', null],
    ['no directory', { kind: 'host' }],
    ['an empty directory', { directory: '', kind: 'host' }],
    ['a directory that is not text', { directory: 7, kind: 'host' }],
    ['an unknown kind', { directory: '/data', kind: 'cloud' }],
  ])('ignores a reply with %s', async (_description, body) => {
    stubFetch(jsonReply(body))
    expect(await fetchRecordingsLocation()).toBeNull()
  })
})

describe('describeRecordingsLocation', () => {
  it('names a Docker volume as one, since it has no path on the machine', () => {
    expect(describeRecordingsLocation({ directory: 'sdr_recordings', kind: 'volume' })).toBe(
      'sdr_recordings (Docker volume)',
    )
  })

  it.each(['host', 'local'] as const)('gives a %s folder as its path', (kind) => {
    expect(describeRecordingsLocation({ directory: '~/SentinelRecordings', kind })).toBe(
      '~/SentinelRecordings',
    )
  })
})
