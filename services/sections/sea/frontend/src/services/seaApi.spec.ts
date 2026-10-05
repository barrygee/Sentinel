import { describe, it, expect, afterEach, vi } from 'vitest'
import { deleteAisKey, getAisKeyStatus, getFeedStatus, putAisKey } from './seaApi'

function respond(status: number, body?: unknown, jsonThrows = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows ? async () => Promise.reject(new Error('not json')) : async () => body,
  }
}

describe('seaApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the key status and defaults to unconfigured on failure', async () => {
    const status = { configured: true, source: 'env', fingerprint: 'abc' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, status)))
    expect(await getAisKeyStatus()).toEqual(status)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500)))
    expect(await getAisKeyStatus()).toEqual({ configured: false, source: null, fingerprint: null })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getAisKeyStatus()).toEqual({ configured: false, source: null, fingerprint: null })
  })

  it('saves a key and surfaces the backend detail on rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await putAisKey('abcdefgh')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/sea/ais-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'abcdefgh' }),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(422, { detail: 'key must be…' })))
    expect(await putAisKey('bad')).toEqual({ ok: false, error: 'key must be…' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500, { detail: 42 })))
    expect(await putAisKey('x')).toEqual({ ok: false, error: 'Could not save the key (HTTP 500)' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(502, undefined, true)))
    expect(await putAisKey('x')).toEqual({ ok: false, error: 'Could not save the key (HTTP 502)' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await putAisKey('x')).toEqual({
      ok: false,
      error: 'Could not reach the Sentinel backend',
    })
  })

  it('forgets a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await deleteAisKey()).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/sea/ais-key', { method: 'DELETE' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500, {})))
    expect(await deleteAisKey()).toEqual({
      ok: false,
      error: 'Could not forget the key (HTTP 500)',
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await deleteAisKey()).toEqual({
      ok: false,
      error: 'Could not reach the Sentinel backend',
    })
  })

  it('reads the feed status, null when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { status: 'live' })))
    expect(await getFeedStatus()).toEqual({ status: 'live' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(503)))
    expect(await getFeedStatus()).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getFeedStatus()).toBeNull()
  })
})
