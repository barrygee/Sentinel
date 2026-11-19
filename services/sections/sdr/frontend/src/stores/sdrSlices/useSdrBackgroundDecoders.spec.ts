import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'

const { getNamespaceMock, notifySettingsChangedMock } = vi.hoisted(() => ({
  getNamespaceMock: vi.fn(),
  notifySettingsChangedMock: vi.fn(),
}))
vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  getNamespace: getNamespaceMock,
  notifySettingsChanged: notifySettingsChangedMock,
}))

import { useSdrBackgroundDecoders } from './useSdrBackgroundDecoders'
import type { SdrRadio } from './sdrTypes'

const radio = (overrides: Partial<SdrRadio> & { id: number }): SdrRadio => ({
  name: `Radio ${overrides.id}`,
  host: 'pi',
  port: 1234,
  enabled: true,
  ...overrides,
})

function createDecoders(radios: SdrRadio[] = []) {
  return useSdrBackgroundDecoders(ref(radios))
}

function stubFetch(ok: boolean) {
  const fetchMock = vi.fn().mockResolvedValue({ ok })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('useSdrBackgroundDecoders', () => {
  beforeEach(() => {
    localStorage.clear()
    getNamespaceMock.mockReset()
    notifySettingsChangedMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts with no decoder running', () => {
    const decoders = createDecoders()
    expect(decoders.aprsEnabled.value).toBe(false)
    expect(decoders.aprsRadioId.value).toBeNull()
    expect(decoders.aisRadioId.value).toBeNull()
    expect(decoders.adsbSourceKey.value).toBeNull()
  })

  describe.each([
    ['APRS', 'aprsRadioId', 'setAprsRadioId', 'sdrAprsRadioId'],
    ['AIS', 'aisRadioId', 'setAisRadioId', 'sdrAisRadioId'],
  ] as const)('%s radio id cache', (_label, valueName, setterName, storageKey) => {
    it(`reads ${storageKey}`, () => {
      localStorage.setItem(storageKey, '6')
      expect(createDecoders()[valueName].value).toBe(6)
    })

    it('reads an unparsable value as none', () => {
      localStorage.setItem(storageKey, 'none')
      expect(createDecoders()[valueName].value).toBeNull()
    })

    it('reads none when the cache cannot be read', () => {
      localStorage.setItem(storageKey, '6')
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(createDecoders()[valueName].value).toBeNull()
    })

    it('caches a radio id and removes the key when cleared', () => {
      const decoders = createDecoders()
      decoders[setterName](8)
      expect(decoders[valueName].value).toBe(8)
      expect(localStorage.getItem(storageKey)).toBe('8')
      decoders[setterName](null)
      expect(decoders[valueName].value).toBeNull()
      expect(localStorage.getItem(storageKey)).toBeNull()
    })

    it('keeps the value when the cache write fails', () => {
      const decoders = createDecoders()
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      decoders[setterName](3)
      expect(decoders[valueName].value).toBe(3)
    })
  })

  it('caches the APRS toggle as a default-OFF flag', () => {
    localStorage.setItem('sdrAprsEnabled', '1')
    const decoders = createDecoders()
    expect(decoders.aprsEnabled.value).toBe(true)
    decoders.setAprsEnabled(false)
    expect(localStorage.getItem('sdrAprsEnabled')).toBe('0')
  })

  describe('hydrateAprsFromDb', () => {
    it('adopts the persisted radio and turns the toggle on', async () => {
      getNamespaceMock.mockResolvedValue({ aprs_radio_id: 2 })
      const decoders = createDecoders()
      await decoders.hydrateAprsFromDb()
      expect(getNamespaceMock).toHaveBeenCalledWith('sdr')
      expect(decoders.aprsRadioId.value).toBe(2)
      expect(decoders.aprsEnabled.value).toBe(true)
    })

    it('clears a stale cached radio and turns the toggle off', async () => {
      localStorage.setItem('sdrAprsRadioId', '5')
      localStorage.setItem('sdrAprsEnabled', '1')
      getNamespaceMock.mockResolvedValue({ aprs_radio_id: 'none' })
      const decoders = createDecoders()
      await decoders.hydrateAprsFromDb()
      expect(decoders.aprsRadioId.value).toBeNull()
      expect(decoders.aprsEnabled.value).toBe(false)
      expect(localStorage.getItem('sdrAprsRadioId')).toBeNull()
    })

    it('rewrites nothing when cache and database agree', async () => {
      localStorage.setItem('sdrAprsRadioId', '5')
      localStorage.setItem('sdrAprsEnabled', '1')
      getNamespaceMock.mockResolvedValue({ aprs_radio_id: 5 })
      const decoders = createDecoders()
      const setItem = vi.spyOn(localStorage, 'setItem')
      await decoders.hydrateAprsFromDb()
      expect(setItem).not.toHaveBeenCalled()
    })

    it('does nothing without a namespace', async () => {
      localStorage.setItem('sdrAprsRadioId', '5')
      getNamespaceMock.mockResolvedValue(null)
      const decoders = createDecoders()
      await decoders.hydrateAprsFromDb()
      expect(decoders.aprsRadioId.value).toBe(5)
    })
  })

  describe('hydrateAisFromDb', () => {
    it('adopts the persisted radio', async () => {
      getNamespaceMock.mockResolvedValue({ ais_radio_id: 4 })
      const decoders = createDecoders()
      await decoders.hydrateAisFromDb()
      expect(decoders.aisRadioId.value).toBe(4)
    })

    it('clears a stale cached radio', async () => {
      localStorage.setItem('sdrAisRadioId', '4')
      getNamespaceMock.mockResolvedValue({})
      const decoders = createDecoders()
      await decoders.hydrateAisFromDb()
      expect(decoders.aisRadioId.value).toBeNull()
    })

    it('rewrites nothing when they agree, and nothing without a namespace', async () => {
      localStorage.setItem('sdrAisRadioId', '4')
      const decoders = createDecoders()
      const setItem = vi.spyOn(localStorage, 'setItem')
      getNamespaceMock.mockResolvedValue({ ais_radio_id: 4 })
      await decoders.hydrateAisFromDb()
      getNamespaceMock.mockResolvedValue(null)
      await decoders.hydrateAisFromDb()
      expect(setItem).not.toHaveBeenCalled()
      expect(decoders.aisRadioId.value).toBe(4)
    })
  })

  describe.each([
    {
      label: 'APRS',
      start: (decoders: ReturnType<typeof createDecoders>) => decoders.startAprs(3, 1_500, 12_000),
      startDefaults: (decoders: ReturnType<typeof createDecoders>) => decoders.startAprs(3),
      stop: (decoders: ReturnType<typeof createDecoders>) => decoders.stopAprs(3),
      radioId: (decoders: ReturnType<typeof createDecoders>) => decoders.aprsRadioId.value,
      path: 'aprs',
      startBody: { radio_id: 3, offset_hz: 1_500, bw_hz: 12_000 },
      defaultBody: { radio_id: 3, offset_hz: 0, bw_hz: 0 },
    },
    {
      label: 'AIS',
      start: (decoders: ReturnType<typeof createDecoders>) => decoders.startAis(3, 25_000),
      startDefaults: (decoders: ReturnType<typeof createDecoders>) => decoders.startAis(3),
      stop: (decoders: ReturnType<typeof createDecoders>) => decoders.stopAis(3),
      radioId: (decoders: ReturnType<typeof createDecoders>) => decoders.aisRadioId.value,
      path: 'ais',
      startBody: { radio_id: 3, bw_hz: 25_000 },
      defaultBody: { radio_id: 3, bw_hz: 0 },
    },
  ])(
    '$label start/stop',
    ({ start, startDefaults, stop, radioId, path, startBody, defaultBody }) => {
      it('records the radio and notifies settings once the backend accepts', async () => {
        const fetchMock = stubFetch(true)
        const decoders = createDecoders()
        await expect(start(decoders)).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledWith(`/api/sdr/${path}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(startBody),
        })
        expect(radioId(decoders)).toBe(3)
        expect(notifySettingsChangedMock).toHaveBeenCalledTimes(1)
      })

      it('sends zero offsets by default', async () => {
        const fetchMock = stubFetch(true)
        await startDefaults(createDecoders())
        expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual(defaultBody)
      })

      it('records nothing when the backend refuses or is unreachable', async () => {
        stubFetch(false)
        const decoders = createDecoders()
        await expect(start(decoders)).resolves.toBe(false)
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        await expect(start(decoders)).resolves.toBe(false)
        expect(radioId(decoders)).toBeNull()
        expect(notifySettingsChangedMock).not.toHaveBeenCalled()
      })

      it('stops, notifies settings and clears the radio', async () => {
        const fetchMock = stubFetch(true)
        const decoders = createDecoders()
        await start(decoders)
        notifySettingsChangedMock.mockReset()
        await expect(stop(decoders)).resolves.toBe(true)
        expect(fetchMock).toHaveBeenLastCalledWith(`/api/sdr/${path}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ radio_id: 3 }),
        })
        expect(notifySettingsChangedMock).toHaveBeenCalledTimes(1)
        expect(radioId(decoders)).toBeNull()
      })

      it('clears the radio even when the stop fails', async () => {
        stubFetch(true)
        const decoders = createDecoders()
        await start(decoders)
        notifySettingsChangedMock.mockReset()
        stubFetch(false)
        await expect(stop(decoders)).resolves.toBe(false)
        expect(radioId(decoders)).toBeNull()
        await start(decoders)
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        await expect(stop(decoders)).resolves.toBe(false)
        expect(radioId(decoders)).toBeNull()
        expect(notifySettingsChangedMock).not.toHaveBeenCalled()
      })
    },
  )

  describe('reservations', () => {
    it('reads the ADS-B receiver from the air namespace', async () => {
      getNamespaceMock.mockResolvedValue({
        offgridSdrSource: { sdr_manager_host_id: 2, sdr_manager_device_id: 'usb:1-1' },
      })
      const decoders = createDecoders()
      await decoders.hydrateAdsbSourceFromDb()
      expect(getNamespaceMock).toHaveBeenCalledWith('air')
      expect(decoders.adsbSourceKey.value).not.toBeNull()
    })

    it.each([null, {}, { offgridSdrSource: null }])(
      'clears the ADS-B receiver for %j',
      async (namespace) => {
        const decoders = createDecoders()
        decoders.adsbSourceKey.value = 'stale'
        getNamespaceMock.mockResolvedValue(namespace)
        await decoders.hydrateAdsbSourceFromDb()
        expect(decoders.adsbSourceKey.value).toBeNull()
      },
    )

    it('names the domain holding each radio and frees the rest', async () => {
      getNamespaceMock.mockResolvedValue({
        offgridSdrSource: { sdr_manager_host_id: 2, sdr_manager_device_id: 'usb:1-1' },
      })
      const decoders = createDecoders([
        radio({ id: 1 }),
        radio({ id: 2 }),
        radio({ id: 3, sdr_manager_host_id: 2, sdr_manager_device_id: 'usb:1-1' }),
        radio({ id: 4 }),
      ])
      await decoders.hydrateAdsbSourceFromDb()
      decoders.setAprsRadioId(1)
      decoders.setAisRadioId(2)
      expect(decoders.radioReservation(1)).toBe('APRS')
      expect(decoders.radioReservation(2)).toBe('AIS')
      expect(decoders.radioReservation(3)).toBe('ADS-B')
      expect(decoders.radioReservation(4)).toBeNull()
      expect(decoders.radioReservation(99)).toBeNull()
    })
  })
})
