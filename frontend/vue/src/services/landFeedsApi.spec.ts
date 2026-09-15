import { describe, it, expect, afterEach, vi } from 'vitest'
import * as settingsApi from './settingsApi'
import {
  clearCredential,
  clipUrl,
  getCredentialStatus,
  getFeatures,
  imageUrl,
  listFeeds,
  saveFeeds,
  setCredential,
  testFeed,
} from './landFeedsApi'
import type { FeedConfig } from '@/types/landFeeds'

vi.mock('./settingsApi', () => ({ put: vi.fn() }))

function respond(status: number, body?: unknown, jsonThrows = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows ? async () => Promise.reject(new Error('not json')) : async () => body,
  }
}

const FEED: FeedConfig = {
  id: 'durham-cc',
  name: 'Durham County Council',
  category: 'traffic-cameras',
  provider: 'durham',
  url: 'https://spatial.durham.gov.uk/example',
  enabled: false,
  refreshSeconds: 60,
  datasets: ['cameras'],
  bbox: null,
  location: null,
  auth: { type: 'none' },
}

describe('landFeedsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('listFeeds', () => {
    it('returns the feeds array from a successful response', async () => {
      const feeds = [
        {
          ...FEED,
          status: {
            lastFetchAt: null,
            lastError: null,
            featureCount: 0,
            credentialConfigured: false,
            running: false,
          },
        },
      ]
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { feeds })))
      expect(await listFeeds()).toEqual(feeds)
    })

    it('returns an empty array when the payload has no feeds array', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, {})))
      expect(await listFeeds()).toEqual([])
    })

    it('returns an empty array on a non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500)))
      expect(await listFeeds()).toEqual([])
    })

    it('returns an empty array on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await listFeeds()).toEqual([])
    })
  })

  describe('getFeatures', () => {
    it('returns the feature collection from a successful response', async () => {
      const collection = { type: 'FeatureCollection' as const, features: [] }
      const fetchMock = vi.fn().mockResolvedValue(respond(200, collection))
      vi.stubGlobal('fetch', fetchMock)
      expect(await getFeatures('durham-cc')).toEqual(collection)
      expect(fetchMock).toHaveBeenCalledWith('/api/land/feeds/durham-cc/features')
    })

    it('URL-encodes the feed id', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(respond(200, { type: 'FeatureCollection', features: [] }))
      vi.stubGlobal('fetch', fetchMock)
      await getFeatures('feed with spaces')
      expect(fetchMock).toHaveBeenCalledWith('/api/land/feeds/feed%20with%20spaces/features')
    })

    it('returns an empty collection when the payload has no features array', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, {})))
      expect(await getFeatures('durham-cc')).toEqual({ type: 'FeatureCollection', features: [] })
    })

    it('returns an empty collection on a non-OK response (disabled/unknown/not-yet-fetched feed)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(404)))
      expect(await getFeatures('unknown')).toEqual({ type: 'FeatureCollection', features: [] })
    })

    it('returns an empty collection on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await getFeatures('durham-cc')).toEqual({ type: 'FeatureCollection', features: [] })
    })
  })

  describe('imageUrl / clipUrl', () => {
    it('builds a proxied image URL, never the upstream one', () => {
      expect(imageUrl('durham-cc', 'dutmc_24')).toBe('/api/land/feeds/durham-cc/image/dutmc_24')
    })

    it('appends a cache-busting query parameter when given', () => {
      expect(imageUrl('durham-cc', 'dutmc_24', 12345)).toBe(
        '/api/land/feeds/durham-cc/image/dutmc_24?t=12345',
      )
    })

    it('URL-encodes the feed id and ref', () => {
      expect(imageUrl('a/b', 'c d')).toBe('/api/land/feeds/a%2Fb/image/c%20d')
    })

    it('builds a proxied clip URL', () => {
      expect(clipUrl('tfl-jamcams', '00002.00865')).toBe(
        '/api/land/feeds/tfl-jamcams/clip/00002.00865',
      )
    })
  })

  describe('credential status', () => {
    it('reads whether a credential is configured', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { configured: true })))
      expect(await getCredentialStatus('tfl-jamcams')).toEqual({ configured: true })
    })

    it('defaults to unconfigured on a non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(404)))
      expect(await getCredentialStatus('unknown')).toEqual({ configured: false })
    })

    it('defaults to unconfigured on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await getCredentialStatus('tfl-jamcams')).toEqual({ configured: false })
    })
  })

  describe('setCredential', () => {
    it('PUTs the credential body and returns the new status', async () => {
      const fetchMock = vi.fn().mockResolvedValue(respond(200, { configured: true }))
      vi.stubGlobal('fetch', fetchMock)
      expect(await setCredential('tfl-jamcams', { apiKey: 'abc' })).toEqual({ configured: true })
      expect(fetchMock).toHaveBeenCalledWith('/api/land/feeds/tfl-jamcams/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'abc' }),
      })
    })

    it('reports unconfigured (write rejected) on a non-OK response — a security gate, not a soft failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(respond(400, { detail: 'shape does not match auth.type' })),
      )
      expect(await setCredential('tfl-jamcams', { apiKey: '' })).toEqual({ configured: false })
    })

    it('reports unconfigured on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await setCredential('tfl-jamcams', { apiKey: 'abc' })).toEqual({ configured: false })
    })
  })

  describe('clearCredential', () => {
    it('DELETEs the credential and returns the new status', async () => {
      const fetchMock = vi.fn().mockResolvedValue(respond(200, { configured: false }))
      vi.stubGlobal('fetch', fetchMock)
      expect(await clearCredential('tfl-jamcams')).toEqual({ configured: false })
      expect(fetchMock).toHaveBeenCalledWith('/api/land/feeds/tfl-jamcams/credentials', {
        method: 'DELETE',
      })
    })

    it('reports the credential as still configured on a non-OK response — no false "cleared" state', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500)))
      expect(await clearCredential('tfl-jamcams')).toEqual({ configured: true })
    })

    it('reports still configured on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await clearCredential('tfl-jamcams')).toEqual({ configured: true })
    })
  })

  describe('testFeed', () => {
    it('POSTs the probe and returns the result', async () => {
      const result = { ok: true, message: 'Reached upstream.', featureCount: 33 }
      const fetchMock = vi.fn().mockResolvedValue(respond(200, result))
      vi.stubGlobal('fetch', fetchMock)
      expect(await testFeed('durham-cc')).toEqual(result)
      expect(fetchMock).toHaveBeenCalledWith('/api/land/feeds/durham-cc/test', { method: 'POST' })
    })

    it('reports a request failure on a non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500)))
      expect(await testFeed('durham-cc')).toEqual({
        ok: false,
        message: 'Test request failed.',
        featureCount: 0,
      })
    })

    it('reports a network error distinctly from a request failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      expect(await testFeed('durham-cc')).toEqual({
        ok: false,
        message: 'Network error.',
        featureCount: 0,
      })
    })
  })

  describe('saveFeeds', () => {
    it('writes the whole list through the generic settings API', async () => {
      await saveFeeds([FEED])
      expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('land', 'feeds', [FEED])
    })

    it('writes an empty list (removing every feed)', async () => {
      await saveFeeds([])
      expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('land', 'feeds', [])
    })
  })
})
