import { describe, it, expect, afterEach, vi } from 'vitest'
import { FULL_APP_MODE, fetchAppMode, getAppMode, isOfferedInAppMode, setAppMode } from './appMode'

const LOCAL_ONLY = { mode: 'sdr-manager-local-only', landingPath: '/settings/sdr-manager' } as const

function stubModeResponse(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

describe('shell/appMode', () => {
  afterEach(() => {
    setAppMode(FULL_APP_MODE)
    vi.unstubAllGlobals()
  })

  describe('fetchAppMode', () => {
    it("asks core's /api/app/mode and returns a valid reply as it is", async () => {
      const fetchStub = stubModeResponse(LOCAL_ONLY)

      await expect(fetchAppMode()).resolves.toEqual(LOCAL_ONLY)
      expect(fetchStub).toHaveBeenCalledWith('/api/app/mode')
    })

    it('accepts the full mode', async () => {
      stubModeResponse({ mode: 'full', landingPath: '/' })

      await expect(fetchAppMode()).resolves.toEqual({ mode: 'full', landingPath: '/' })
    })

    it('is the full app when core answers with an error status', async () => {
      stubModeResponse(LOCAL_ONLY, 404)

      await expect(fetchAppMode()).resolves.toBe(FULL_APP_MODE)
    })

    it('is the full app when core is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      await expect(fetchAppMode()).resolves.toBe(FULL_APP_MODE)
    })

    it('is the full app when the reply is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))

      await expect(fetchAppMode()).resolves.toBe(FULL_APP_MODE)
    })

    it.each([
      ['null', null],
      ['a string', 'sdr-manager-local-only'],
      ['an unknown mode', { mode: 'radio-only', landingPath: '/' }],
      ['no mode', { landingPath: '/' }],
      ['no landing path', { mode: 'sdr-manager-local-only' }],
      ['a landing path that is not a string', { mode: 'full', landingPath: 7 }],
      ['a landing path off the site', { mode: 'full', landingPath: 'https://example.com/' }],
    ])('is the full app when the reply has %s', async (_case, body) => {
      stubModeResponse(body)

      await expect(fetchAppMode()).resolves.toBe(FULL_APP_MODE)
    })
  })

  describe('the mode this page booted in', () => {
    it('is the full app until boot sets one', () => {
      expect(getAppMode()).toBe(FULL_APP_MODE)
    })

    it('is what boot set', () => {
      setAppMode(LOCAL_ONLY)

      expect(getAppMode()).toBe(LOCAL_ONLY)
    })
  })

  describe('isOfferedInAppMode', () => {
    it('offers a setting with no modes in every mode', () => {
      expect(isOfferedInAppMode({})).toBe(true)
      setAppMode(LOCAL_ONLY)
      expect(isOfferedInAppMode({})).toBe(true)
    })

    it('offers a setting only in the modes it names', () => {
      const fullOnly = { modes: ['full'] as const }

      expect(isOfferedInAppMode(fullOnly)).toBe(true)
      setAppMode(LOCAL_ONLY)
      expect(isOfferedInAppMode(fullOnly)).toBe(false)
    })

    it('offers nothing for an empty modes list', () => {
      expect(isOfferedInAppMode({ modes: [] })).toBe(false)
    })
  })
})
