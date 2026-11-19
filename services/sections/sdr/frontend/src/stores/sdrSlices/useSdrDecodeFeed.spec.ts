import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'

const { getNamespaceMock } = vi.hoisted(() => ({ getNamespaceMock: vi.fn() }))
vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ getNamespace: getNamespaceMock }))

import { useSdrDecodeFeed } from './useSdrDecodeFeed'
import type { DecodeEvent } from './sdrTypes'

function createFeed(aprsOn = false) {
  const aprsEnabled = ref(aprsOn)
  return { aprsEnabled, feed: useSdrDecodeFeed(aprsEnabled) }
}

const callRow = (talkgroup: number, ts = 1): DecodeEvent => ({ type: 'call', talkgroup, ts })
const logLine = (line: string): DecodeEvent => ({ type: 'log', line, ts: 1 })

describe('useSdrDecodeFeed', () => {
  beforeEach(() => {
    localStorage.clear()
    getNamespaceMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts idle', () => {
    const { feed } = createFeed()
    expect(feed.digitalEnabled.value).toBe(false)
    expect(feed.muteAudioWhileDecoding.value).toBe(true)
    expect(feed.decodeEvents.value).toEqual([])
    expect(feed.decodeLogs.value).toEqual([])
    expect(feed.decodeSync.value).toBe(false)
    expect(feed.decoderReachable.value).toBe(false)
    expect(feed.decodedMode.value).toBe('')
    expect(feed.decodedAudioRate.value).toBeNull()
  })

  describe('persisted toggles', () => {
    it('caches digital decode under sdrDigitalEnabled and hydrates digitalDecodeDefault', async () => {
      localStorage.setItem('sdrDigitalEnabled', '1')
      const { feed } = createFeed()
      expect(feed.digitalEnabled.value).toBe(true)
      feed.setDigitalEnabled(false)
      expect(localStorage.getItem('sdrDigitalEnabled')).toBe('0')
      getNamespaceMock.mockResolvedValue({ digitalDecodeDefault: true })
      await feed.hydrateDigitalEnabledFromDb()
      expect(getNamespaceMock).toHaveBeenCalledWith('sdr')
      expect(feed.digitalEnabled.value).toBe(true)
    })

    it('caches muting under sdrMuteAudioWhileDecoding and hydrates its setting', async () => {
      localStorage.setItem('sdrMuteAudioWhileDecoding', '0')
      const { feed } = createFeed()
      expect(feed.muteAudioWhileDecoding.value).toBe(false)
      feed.setMuteAudioWhileDecoding(true)
      expect(localStorage.getItem('sdrMuteAudioWhileDecoding')).toBe('1')
      getNamespaceMock.mockResolvedValue({ muteAudioWhileDecoding: false })
      await feed.hydrateMuteAudioWhileDecodingFromDb()
      expect(feed.muteAudioWhileDecoding.value).toBe(false)
    })
  })

  describe('dock state', () => {
    it('shows the APRS stream while APRS decode is on, voice otherwise', () => {
      const { aprsEnabled, feed } = createFeed()
      expect(feed.decodeStreamKind.value).toBe('voice')
      aprsEnabled.value = true
      expect(feed.decodeStreamKind.value).toBe('aprs')
    })

    it('opens the dock while either decode is on', () => {
      const { aprsEnabled, feed } = createFeed()
      expect(feed.decodeDockOpen.value).toBe(false)
      feed.setDigitalEnabled(true)
      expect(feed.decodeDockOpen.value).toBe(true)
      feed.setDigitalEnabled(false)
      aprsEnabled.value = true
      expect(feed.decodeDockOpen.value).toBe(true)
    })
  })

  describe('pushDecodeEventBatch', () => {
    it('ignores an empty batch', () => {
      const { feed } = createFeed()
      const before = feed.decodeEvents.value
      feed.pushDecodeEventBatch([])
      expect(feed.decodeEvents.value).toBe(before)
    })

    it('keeps rows and logs newest first, prepended to what was there', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([callRow(1), logLine('a')])
      feed.pushDecodeEventBatch([callRow(2), callRow(3), logLine('b'), logLine('c')])
      expect(feed.decodeEvents.value.map((event) => event.talkgroup)).toEqual([3, 2, 1])
      expect(feed.decodeLogs.value).toEqual(['c', 'b', 'a'])
    })

    it('routes logs and status frames away from the call rows', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([
        logLine('line'),
        { type: 'decode_status', decoder_reachable: true, ts: 1 },
      ])
      expect(feed.decodeEvents.value).toEqual([])
      expect(feed.decodeLogs.value).toEqual(['line'])
      expect(feed.decoderReachable.value).toBe(true)
    })

    it('strips ANSI colour codes and trailing space, dropping lines left empty', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([
        logLine('\u001b[33mSync: +DMR [slot2]\u001b[0m   '),
        logLine('\u001b[0m'),
        { type: 'log', ts: 1 },
      ])
      expect(feed.decodeLogs.value).toEqual(['Sync: +DMR [slot2]'])
    })

    it('updates the live indicators from any frame, last in the batch winning', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([
        { type: 'call', sync: true, decoder_reachable: true, mode: 'P25', ts: 1 },
        { type: 'log', line: 'x', sync: false, mode: 'DMR', audio_sample_rate: 8000, ts: 1 },
      ])
      expect(feed.decodeSync.value).toBe(false)
      expect(feed.decoderReachable.value).toBe(true)
      expect(feed.decodedMode.value).toBe('DMR')
      expect(feed.decodedAudioRate.value).toBe(8000)
    })

    it('keeps the decoded mode when a frame carries none', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([{ type: 'call', mode: 'NXDN', ts: 1 }])
      feed.pushDecodeEventBatch([{ type: 'call', mode: '', ts: 1 }])
      expect(feed.decodedMode.value).toBe('NXDN')
    })

    it('stamps a row without a timestamp with the current time', () => {
      vi.spyOn(Date, 'now').mockReturnValue(4242)
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([callRow(1, 0), callRow(2, 77)])
      expect(feed.decodeEvents.value.map((event) => event.ts)).toEqual([77, 4242])
    })

    it('caps rows at 200 and log lines at 300', () => {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch(Array.from({ length: 205 }, (_, index) => callRow(index)))
      feed.pushDecodeEventBatch(Array.from({ length: 305 }, (_, index) => logLine(`l${index}`)))
      expect(feed.decodeEvents.value).toHaveLength(200)
      expect(feed.decodeEvents.value[0]!.talkgroup).toBe(204)
      expect(feed.decodeLogs.value).toHaveLength(300)
      expect(feed.decodeLogs.value[0]).toBe('l304')
    })

    it('pushDecodeEvent ingests one frame the same way', () => {
      const { feed } = createFeed()
      feed.pushDecodeEvent(callRow(9))
      expect(feed.decodeEvents.value.map((event) => event.talkgroup)).toEqual([9])
    })
  })

  it('setDecodeStatus updates only the fields it is given', () => {
    const { feed } = createFeed()
    feed.setDecodeStatus({ decoder_reachable: true })
    expect(feed.decoderReachable.value).toBe(true)
    expect(feed.decodeSync.value).toBe(false)
    feed.setDecodeStatus({ sync: true })
    expect(feed.decodeSync.value).toBe(true)
    expect(feed.decoderReachable.value).toBe(true)
    feed.setDecodeStatus({ decoder_reachable: false })
    expect(feed.decoderReachable.value).toBe(false)
    expect(feed.decodeSync.value).toBe(true)
  })

  describe('clearing', () => {
    function filledFeed() {
      const { feed } = createFeed()
      feed.pushDecodeEventBatch([
        {
          type: 'call',
          sync: true,
          decoder_reachable: true,
          mode: 'DMR',
          audio_sample_rate: 8000,
          ts: 1,
        },
        logLine('x'),
      ])
      return feed
    }

    it('clearDecode resets everything', () => {
      const feed = filledFeed()
      feed.clearDecode()
      expect(feed.decodeEvents.value).toEqual([])
      expect(feed.decodeLogs.value).toEqual([])
      expect(feed.decodeSync.value).toBe(false)
      expect(feed.decoderReachable.value).toBe(false)
      expect(feed.decodedMode.value).toBe('')
      expect(feed.decodedAudioRate.value).toBeNull()
    })

    it('clearDecodeEvents clears only the rows', () => {
      const feed = filledFeed()
      feed.clearDecodeEvents()
      expect(feed.decodeEvents.value).toEqual([])
      expect(feed.decodeLogs.value).toEqual(['x'])
      expect(feed.decodeSync.value).toBe(true)
    })

    it('clearDecodeLogs clears only the log', () => {
      const feed = filledFeed()
      feed.clearDecodeLogs()
      expect(feed.decodeLogs.value).toEqual([])
      expect(feed.decodeEvents.value).toHaveLength(1)
    })
  })
})
