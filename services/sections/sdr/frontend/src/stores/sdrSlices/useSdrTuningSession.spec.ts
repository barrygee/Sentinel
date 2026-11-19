import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope } from 'vue'
import { useSdrTuningSession } from './useSdrTuningSession'

function createSession() {
  const scope = effectScope()
  const session = scope.run(() => useSdrTuningSession())!
  return session
}

describe('useSdrTuningSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts with the documented defaults', () => {
    const session = createSession()
    expect(session.radios.value).toEqual([])
    expect(session.currentRadioId.value).toBeNull()
    expect(session.playing.value).toBe(false)
    expect(session.connected.value).toBe(false)
    expect(session.isOwner.value).toBe(true)
    expect(session.controlAvailable.value).toBe(false)
    expect(session.locked.value).toBe(false)
    expect(session.readOnly.value).toBe(false)
    expect(session.currentFreqHz.value).toBe(100_000_000)
    expect(session.currentMode.value).toBe('WFM')
    expect(session.currentGain.value).toBe(30)
    expect(session.currentSquelch.value).toBe(-60)
    expect(session.panelOpen.value).toBe(false)
    expect(session.sampleRate.value).toBe(2_048_000)
    expect(session.activeTab.value).toBe('radio')
    expect(session.bwHz.value).toBe(10000)
    expect(session.tuningOffsetHz.value).toBe(0)
    expect(session.tuneRequest.value).toBeNull()
    expect(session.bwRequest.value).toBeNull()
    expect(session.fftSizeRequest.value).toBeNull()
  })

  describe('session restore', () => {
    it('restores the viewed radio, frequency, mode and play state', () => {
      sessionStorage.setItem('sdrLastRadioId', '4')
      sessionStorage.setItem('sdrLastFreqHz', '145500000')
      sessionStorage.setItem('sdrLastMode', 'NFM')
      sessionStorage.setItem('sdrPlaying', '1')
      const session = createSession()
      expect(session.currentRadioId.value).toBe(4)
      expect(session.currentFreqHz.value).toBe(145_500_000)
      expect(session.currentMode.value).toBe('NFM')
      expect(session.playing.value).toBe(true)
    })

    it('drops a stored frequency no tuner can reach', () => {
      sessionStorage.setItem('sdrLastFreqHz', '5')
      expect(createSession().currentFreqHz.value).toBe(100_000_000)
    })

    it('reads any play flag other than 1 as stopped', () => {
      sessionStorage.setItem('sdrPlaying', 'true')
      expect(createSession().playing.value).toBe(false)
    })

    it('keeps the defaults when sessionStorage cannot be read', () => {
      sessionStorage.setItem('sdrLastRadioId', '4')
      sessionStorage.setItem('sdrLastFreqHz', '145500000')
      vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const session = createSession()
      expect(session.currentRadioId.value).toBeNull()
      expect(session.currentFreqHz.value).toBe(100_000_000)
    })
  })

  describe('session persistence', () => {
    it('persists radio, frequency, mode and play state on each setter', () => {
      const session = createSession()
      session.setRadio(7)
      expect(session.currentRadioId.value).toBe(7)
      expect(sessionStorage.getItem('sdrLastRadioId')).toBe('7')
      session.setFrequency(433_920_000)
      expect(session.currentFreqHz.value).toBe(433_920_000)
      expect(sessionStorage.getItem('sdrLastFreqHz')).toBe('433920000')
      session.setMode('AM')
      expect(session.currentMode.value).toBe('AM')
      expect(sessionStorage.getItem('sdrLastMode')).toBe('AM')
      session.setPlaying(true)
      expect(session.playing.value).toBe(true)
      expect(sessionStorage.getItem('sdrPlaying')).toBe('1')
      session.setPlaying(false)
      expect(sessionStorage.getItem('sdrPlaying')).toBe('0')
    })

    it('stores no radio id while none is selected', () => {
      createSession().setFrequency(99_000_000)
      expect(sessionStorage.getItem('sdrLastRadioId')).toBeNull()
      expect(sessionStorage.getItem('sdrLastFreqHz')).toBe('99000000')
    })

    it('still updates the value when sessionStorage cannot be written', () => {
      const session = createSession()
      const setItem = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(() => session.setMode('USB')).not.toThrow()
      expect(setItem).toHaveBeenCalled()
      expect(session.currentMode.value).toBe('USB')
    })
  })

  describe('read-only follower', () => {
    it.each([
      { owner: false, available: true, isLocked: true, readOnly: true },
      { owner: true, available: true, isLocked: true, readOnly: false },
      { owner: false, available: false, isLocked: true, readOnly: false },
      { owner: false, available: true, isLocked: false, readOnly: false },
    ])(
      'owner=$owner available=$available locked=$isLocked → readOnly=$readOnly',
      ({ owner, available, isLocked, readOnly }) => {
        const session = createSession()
        session.setOwnership(owner, available, isLocked)
        expect(session.isOwner.value).toBe(owner)
        expect(session.controlAvailable.value).toBe(available)
        expect(session.locked.value).toBe(isLocked)
        expect(session.readOnly.value).toBe(readOnly)
      },
    )
  })

  it('mirrors connection, tab, bandwidth and tuning offset', () => {
    const session = createSession()
    session.setConnected(true)
    session.setActiveTab('recordings')
    session.setBandwidthHz(12_500)
    session.setTuningOffsetHz(-25_000)
    expect(session.connected.value).toBe(true)
    expect(session.activeTab.value).toBe('recordings')
    expect(session.bwHz.value).toBe(12_500)
    expect(session.tuningOffsetHz.value).toBe(-25_000)
  })

  describe('request channels', () => {
    it('gives every tune request a fresh nonce, even for a repeated frequency', () => {
      const session = createSession()
      session.requestTune(145_000_000)
      const first = session.tuneRequest.value
      session.requestTune(145_000_000, true)
      const second = session.tuneRequest.value
      expect(first).toEqual({ hz: 145_000_000, nonce: 1, center: false })
      expect(second).toEqual({ hz: 145_000_000, nonce: 2, center: true })
      expect(second).not.toBe(first)
    })

    it('numbers bandwidth and FFT size requests independently', () => {
      const session = createSession()
      session.requestTune(1)
      session.requestBandwidth(8_000)
      session.requestBandwidth(9_000)
      session.requestFftSize(4096)
      expect(session.bwRequest.value).toEqual({ hz: 9_000, nonce: 2 })
      expect(session.fftSizeRequest.value).toEqual({ bins: 4096, nonce: 1 })
    })
  })

  describe('loadRadios', () => {
    const radioList = [{ id: 1, name: 'Dongle', host: 'pi', port: 1234, enabled: true }]

    it('replaces the radio list from the API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => radioList })
      vi.stubGlobal('fetch', fetchMock)
      const session = createSession()
      await session.loadRadios()
      expect(fetchMock).toHaveBeenCalledWith('/api/sdr/radios')
      expect(session.radios.value).toEqual(radioList)
    })

    it('keeps the previous list on a non-OK response', async () => {
      const session = createSession()
      session.radios.value = radioList
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }))
      await session.loadRadios()
      expect(session.radios.value).toEqual(radioList)
    })

    it('keeps the previous list when the request fails', async () => {
      const session = createSession()
      session.radios.value = radioList
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      await expect(session.loadRadios()).resolves.toBeUndefined()
      expect(session.radios.value).toEqual(radioList)
    })
  })
})
