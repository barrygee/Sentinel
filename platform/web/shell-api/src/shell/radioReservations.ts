/**
 * Which section holds which radio off grid — one answer for every picker.
 *
 * A dongle can only listen on one frequency, so a radio that one section uses
 * as its off-grid receiver can't also be another's: LAND's APRS decode, SEA's
 * AIS decode and AIR's ADS-B receiver each hold theirs until it is changed in
 * that section's settings. The SDR panel already padlocks a held radio; the
 * settings pickers read the same reservations from here so they lock it too.
 *
 * Read from the saved settings (the settings store), which is what the backend
 * resumes decoders from: `sdr.aprs_radio_id`, `sdr.ais_radio_id` and
 * `air.offgridSdrSource` (an SDR Manager device, matched to a radio through the
 * device the radio streams from). A change in another card counts once it is
 * applied.
 */
import { computed, type ComputedRef } from 'vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'

/** The off-grid jobs that hold a radio, by their operator-facing names. */
export type RadioReservationKind = 'APRS' | 'AIS' | 'ADS-B'

/** The saved reservations, normalised. */
export interface RadioReservations {
  aprsRadioId: number | null
  aisRadioId: number | null
  /** `${hostId}:${deviceId}` of AIR's ADS-B receiver, or null. */
  adsbDeviceKey: string | null
}

/** The fields of a radio needed to tell whether it is held. */
export interface ReservableRadio {
  id: number
  /** The SDR Manager host and device the radio streams from, when it is one. */
  sdrManagerHostId?: number | null
  sdrManagerDeviceId?: string | null
}

/** `${hostId}:${deviceId}`, the key an SDR Manager device is known by, or null. */
export function sdrManagerDeviceKey(
  hostId: number | null | undefined,
  deviceId: string | null | undefined,
): string | null {
  return Number.isInteger(hostId) && typeof deviceId === 'string' && deviceId
    ? `${hostId}:${deviceId}`
    : null
}

/** Normalise the raw saved settings into reservations. */
export function readRadioReservations(
  aprsRadioId: unknown,
  aisRadioId: unknown,
  offgridSdrSource: unknown,
): RadioReservations {
  const source = (offgridSdrSource ?? null) as {
    sdr_manager_host_id?: unknown
    sdr_manager_device_id?: unknown
  } | null
  return {
    aprsRadioId: typeof aprsRadioId === 'number' ? aprsRadioId : null,
    aisRadioId: typeof aisRadioId === 'number' ? aisRadioId : null,
    adsbDeviceKey: sdrManagerDeviceKey(
      source?.sdr_manager_host_id as number | null | undefined,
      source?.sdr_manager_device_id as string | null | undefined,
    ),
  }
}

/** Which job holds `radio`, or null when it is free. */
export function radioReservation(
  radio: ReservableRadio,
  reservations: RadioReservations,
): RadioReservationKind | null {
  if (reservations.aprsRadioId === radio.id) return 'APRS'
  if (reservations.aisRadioId === radio.id) return 'AIS'
  const deviceKey = sdrManagerDeviceKey(radio.sdrManagerHostId, radio.sdrManagerDeviceId)
  if (deviceKey !== null && deviceKey === reservations.adsbDeviceKey) return 'ADS-B'
  return null
}

/**
 * Which job other than ADS-B holds the radio streaming from an SDR Manager
 * device, or null. AIR's device picker asks this: a device whose radio decodes
 * APRS or AIS is busy.
 */
export function deviceReservation(
  deviceKey: string,
  radios: readonly ReservableRadio[],
  reservations: RadioReservations,
): RadioReservationKind | null {
  for (const radio of radios) {
    if (sdrManagerDeviceKey(radio.sdrManagerHostId, radio.sdrManagerDeviceId) !== deviceKey)
      continue
    const holder = radioReservation(radio, { ...reservations, adsbDeviceKey: null })
    if (holder !== null) return holder
  }
  return null
}

/** The lock text a picker shows on a held radio, e.g. `IN USE · AIS`. */
export function reservationLabel(kind: RadioReservationKind): string {
  return `IN USE · ${kind}`
}

/** The saved reservations, kept current as settings are applied or reloaded. */
export function useRadioReservations(): ComputedRef<RadioReservations> {
  const settingsStore = useSettingsStore()
  return computed(() =>
    readRadioReservations(
      settingsStore.getSetting<unknown>('sdr', 'aprs_radio_id', null),
      settingsStore.getSetting<unknown>('sdr', 'ais_radio_id', null),
      settingsStore.getSetting<unknown>('air', 'offgridSdrSource', null),
    ),
  )
}
