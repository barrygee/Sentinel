import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  deviceReservation,
  radioReservation,
  readRadioReservations,
  reservationLabel,
  sdrManagerDeviceKey,
  useRadioReservations,
  type RadioReservations,
} from './radioReservations'
import { useSettingsStore } from '../stores/settings'

/**
 * Which section holds which radio off grid. Every settings picker and the SDR
 * panel lock radios from these answers, so a wrong one either lets two
 * sections fight over one dongle or locks a radio nobody is using.
 */

const NONE: RadioReservations = { aprsRadioId: null, aisRadioId: null, adsbDeviceKey: null }

describe('sdrManagerDeviceKey', () => {
  it('joins the host id and the device id', () => {
    expect(sdrManagerDeviceKey(4, 'serial-9')).toBe('4:serial-9')
    expect(sdrManagerDeviceKey(0, 'serial-9')).toBe('0:serial-9')
  })

  it.each([
    ['no host', null, 'serial-9'],
    ['an undefined host', undefined, 'serial-9'],
    ['a fractional host', 1.5, 'serial-9'],
    ['no device', 4, null],
    ['an undefined device', 4, undefined],
    ['an empty device', 4, ''],
  ])('is null with %s', (_case, hostId, deviceId) => {
    expect(sdrManagerDeviceKey(hostId, deviceId)).toBeNull()
  })
})

describe('readRadioReservations', () => {
  it('reads the saved radio ids and the ADS-B device', () => {
    expect(
      readRadioReservations(3, 5, { sdr_manager_host_id: 4, sdr_manager_device_id: 'serial-9' }),
    ).toEqual({ aprsRadioId: 3, aisRadioId: 5, adsbDeviceKey: '4:serial-9' })
  })

  it('treats missing or malformed values as nothing held', () => {
    expect(readRadioReservations(null, undefined, null)).toEqual(NONE)
    expect(readRadioReservations('3', '5', undefined)).toEqual(NONE)
    expect(readRadioReservations(null, null, {})).toEqual(NONE)
    expect(
      readRadioReservations(null, null, { sdr_manager_host_id: '4', sdr_manager_device_id: 9 }),
    ).toEqual(NONE)
  })
})

describe('radioReservation', () => {
  it('names APRS, then AIS, as the holder of a radio by id', () => {
    expect(radioReservation({ id: 3 }, { ...NONE, aprsRadioId: 3 })).toBe('APRS')
    expect(radioReservation({ id: 5 }, { ...NONE, aisRadioId: 5 })).toBe('AIS')
  })

  it('names ADS-B when the radio streams from the ADS-B device', () => {
    const reservations = { ...NONE, adsbDeviceKey: '4:serial-9' }
    expect(
      radioReservation(
        { id: 1, sdrManagerHostId: 4, sdrManagerDeviceId: 'serial-9' },
        reservations,
      ),
    ).toBe('ADS-B')
    expect(
      radioReservation({ id: 1, sdrManagerHostId: 4, sdrManagerDeviceId: 'other' }, reservations),
    ).toBeNull()
  })

  it('never matches a plain rtl_tcp radio to the ADS-B device', () => {
    expect(radioReservation({ id: 1 }, { ...NONE, adsbDeviceKey: '4:serial-9' })).toBeNull()
  })

  it('is null for a free radio', () => {
    expect(radioReservation({ id: 1 }, { ...NONE, aprsRadioId: 2, aisRadioId: 3 })).toBeNull()
  })
})

describe('deviceReservation', () => {
  const radios = [
    { id: 1, sdrManagerHostId: 4, sdrManagerDeviceId: 'serial-9' },
    { id: 2, sdrManagerHostId: 4, sdrManagerDeviceId: 'serial-10' },
    { id: 3 },
  ]

  it('names the job decoding on a radio that streams from the device', () => {
    expect(deviceReservation('4:serial-10', radios, { ...NONE, aisRadioId: 2 })).toBe('AIS')
    expect(deviceReservation('4:serial-9', radios, { ...NONE, aprsRadioId: 1 })).toBe('APRS')
  })

  it("ignores ADS-B's own hold, since AIR is the one asking", () => {
    expect(deviceReservation('4:serial-9', radios, { ...NONE, adsbDeviceKey: '4:serial-9' })).toBe(
      null,
    )
  })

  it('is null when no radio streams from the device, or its radio is free', () => {
    expect(deviceReservation('7:nothing', radios, { ...NONE, aprsRadioId: 1 })).toBeNull()
    expect(deviceReservation('4:serial-9', radios, { ...NONE, aprsRadioId: 3 })).toBeNull()
  })

  it('finds the held radio when several radios share one device', () => {
    const sharing = [
      { id: 1, sdrManagerHostId: 4, sdrManagerDeviceId: 'serial-9' },
      { id: 2, sdrManagerHostId: 4, sdrManagerDeviceId: 'serial-9' },
    ]
    expect(deviceReservation('4:serial-9', sharing, { ...NONE, aisRadioId: 2 })).toBe('AIS')
  })
})

describe('reservationLabel', () => {
  it.each(['APRS', 'AIS', 'ADS-B'] as const)('reads "IN USE · %s"', (kind) => {
    expect(reservationLabel(kind)).toBe(`IN USE · ${kind}`)
  })
})

describe('useRadioReservations', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reads the saved settings and follows them as they change', () => {
    const reservations = useRadioReservations()
    expect(reservations.value).toEqual(NONE)

    const settingsStore = useSettingsStore()
    settingsStore.setSetting('sdr', 'aprs_radio_id', 3)
    settingsStore.setSetting('sdr', 'ais_radio_id', 5)
    settingsStore.setSetting('air', 'offgridSdrSource', {
      sdr_manager_host_id: 4,
      sdr_manager_device_id: 'serial-9',
    })
    expect(reservations.value).toEqual({
      aprsRadioId: 3,
      aisRadioId: 5,
      adsbDeviceKey: '4:serial-9',
    })
  })
})
