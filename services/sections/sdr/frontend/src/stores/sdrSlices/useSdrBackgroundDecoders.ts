import { ref, type Ref } from 'vue'
import { getNamespace, notifySettingsChanged } from '@sentinel/shell-api/services/settingsApi'
import {
  radioReservation as sharedRadioReservation,
  sdrManagerDeviceKey,
  type RadioReservationKind,
} from '@sentinel/shell-api/shell/radioReservations'
import { usePersistedFlag } from './persistedSetting'
import type { SdrRadio } from './sdrTypes'

/**
 * Which radio a background decoder holds (null = none), with localStorage as
 * the fast-path cache so the right radio is muted / locked on the first frame
 * after a reload, before the DB hydrate reconciles it.
 */
function usePersistedRadioId(storageKey: string) {
  function readCached(): number | null {
    try {
      const raw = parseInt(localStorage.getItem(storageKey) || '', 10)
      return Number.isFinite(raw) ? raw : null
    } catch {
      return null
    }
  }
  const radioId = ref<number | null>(readCached())
  function setRadioId(nextRadioId: number | null) {
    radioId.value = nextRadioId
    try {
      if (nextRadioId == null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, String(nextRadioId))
    } catch {}
  }
  return { radioId, setRadioId }
}

/**
 * The SDR store's background decoder slice: APRS and off-grid AIS decode
 * (started and stopped over HTTP, persisted server-side, so they keep running
 * while another radio is viewed) and the domain reservations that lock a
 * radio out of the SDR panel while AIR, LAND or SEA depends on it.
 */
export function useSdrBackgroundDecoders(radios: Ref<SdrRadio[]>) {
  // ── APRS decode (Direwolf sidecar) ─────────────────────────────────────────
  // APRS packet decode runs in the BACKGROUND, independent of the SDR view and
  // of digital-voice decode (it can run concurrently on a second dongle). So it
  // is controlled over HTTP (start/stop endpoints) rather than the spectrum
  // WebSocket, and the enabled radio is persisted server-side (resumes on
  // restart). The local flag mirrors the viewed radio's APRS state so the toggle
  // reflects it instantly; localStorage is the fast-path cache, like the digital
  // toggle. Default OFF. Only hydrateAprsFromDb reconciles it with the DB.
  const aprsEnabledFlag = usePersistedFlag({ storageKey: 'sdrAprsEnabled', defaultValue: false })
  const aprsEnabled = aprsEnabledFlag.value
  const setAprsEnabled = aprsEnabledFlag.set

  // Which radio is decoding APRS (null = none). The backend runs at most one
  // APRS bridge (get_or_create_aprs_bridge stops any other) and persists the
  // radio in `sdr/aprs_radio_id`, so this mirrors it. Needed because APRS decode
  // mutes ONLY its own radio's audio — another radio the user is listening to
  // must stay audible.
  const { radioId: aprsRadioId, setRadioId: setAprsRadioId } = usePersistedRadioId('sdrAprsRadioId')

  /**
   * Reconcile the APRS decode state with the database. The backend resumes the
   * persisted APRS radio on startup (resume_persisted_aprs), so after a reload
   * the DB — not localStorage — is the truth about which radio is decoding.
   */
  async function hydrateAprsFromDb(): Promise<void> {
    const data = await getNamespace('sdr')
    if (!data) return
    const persistedRadioId = data.aprs_radio_id
    const nextRadioId = typeof persistedRadioId === 'number' ? persistedRadioId : null
    if (nextRadioId !== aprsRadioId.value) setAprsRadioId(nextRadioId)
    if ((nextRadioId !== null) !== aprsEnabled.value) setAprsEnabled(nextRadioId !== null)
  }

  // SEA's off-grid AIS receiver. Mirrors the APRS block above, with one
  // difference in *when* decode starts: APRS begins the moment a radio is
  // picked in Settings, whereas AIS is designated in Settings (`sea.aisSdrRadioId`)
  // and only starts when the operator opens the Sea section off grid — see
  // SeaView. `aisRadioId` is therefore "which radio is decoding right now",
  // not "which radio is designated".
  const { radioId: aisRadioId, setRadioId: setAisRadioId } = usePersistedRadioId('sdrAisRadioId')

  /**
   * Reconcile the AIS decode state with the database. The backend resumes the
   * persisted AIS radio on startup (resume_persisted_ais), so after a reload
   * the DB — not localStorage — is the truth about which radio is decoding.
   */
  async function hydrateAisFromDb(): Promise<void> {
    const data = await getNamespace('sdr')
    if (!data) return
    const persistedRadioId = data.ais_radio_id
    const nextRadioId = typeof persistedRadioId === 'number' ? persistedRadioId : null
    if (nextRadioId !== aisRadioId.value) setAisRadioId(nextRadioId)
  }

  /**
   * Start background off-grid AIS decode on a radio. The bridge tunes the radio
   * to the midpoint of the two AIS channels and keeps decoding even once the
   * operator leaves the Sea section, so the vessel picture stays warm. Persists
   * server-side, so it also survives a restart. Returns success.
   */
  async function startAis(radioId: number, bwHz = 0): Promise<boolean> {
    try {
      const res = await fetch('/api/sdr/ais/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radio_id: radioId, bw_hz: bwHz }),
      })
      // Track the decoding radio only once the backend has accepted it, so a
      // failed start never reserves a radio that isn't decoding.
      if (res.ok) {
        setAisRadioId(radioId)
        // The backend persisted `sdr.ais_radio_id` — let the config JSON follow.
        notifySettingsChanged()
      }
      return res.ok
    } catch {
      return false
    }
  }

  /** Stop background off-grid AIS decode on a radio and clear the persisted choice. */
  async function stopAis(radioId: number): Promise<boolean> {
    try {
      const res = await fetch('/api/sdr/ais/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radio_id: radioId }),
      })
      if (res.ok) notifySettingsChanged()
      return res.ok
    } catch {
      return false
    } finally {
      // Clear regardless of the response: the operator asked for decode to
      // stop, so the radio must not stay reserved even if the call failed.
      setAisRadioId(null)
    }
  }

  // ── Domain reservations (AIR's ADS-B receiver, LAND's APRS receiver) ──────
  // A radio named as a domain's receiver is doing a job for that domain
  // full-time: ADS-B holds and tunes it to 1090 MHz while AIR is open off grid,
  // APRS keeps a decode bridge on it. Letting the SDR panel retune the same
  // dongle would silently break the domain that depends on it, so a reserved
  // radio is locked out of the panel (padlock, not selectable) until it is
  // deselected in Settings. The APRS side is `aprsRadioId` above and the AIS
  // side `aisRadioId` (its bridge holds the dongle on 162 MHz the same way);
  // the ADS-B side is an SDR host+device pair, which is matched to a radio by
  // its mirror fields (ADR-0009).
  const adsbSourceKey = ref<string | null>(null)

  /**
   * Read which SDR Manager device AIR uses as its ADS-B receiver, if any.
   *
   * Read from the central `air.offgridSdrSource` setting rather than AIR's own
   * API, so the radio platform never depends on the Air section. Validated as
   * the backend validates it (`services/adsb_source.get_source`): anything but
   * an integer host id and a non-empty device id means "not set".
   */
  async function hydrateAdsbSourceFromDb(): Promise<void> {
    const air = await getNamespace('air')
    const source = air?.offgridSdrSource as
      | { sdr_manager_host_id?: unknown; sdr_manager_device_id?: unknown }
      | null
      | undefined
    adsbSourceKey.value = sdrManagerDeviceKey(
      source?.sdr_manager_host_id as number | null | undefined,
      source?.sdr_manager_device_id as string | null | undefined,
    )
  }

  /**
   * Which domain has reserved a radio, or null when it is free to use.
   *
   * Returns the domain's operator-facing name so callers can say *why* a radio
   * is locked — "reserved" with no reason sends people hunting through settings.
   */
  function radioReservation(radioId: number): RadioReservationKind | null {
    // The same rule the settings pickers apply (shell-api radioReservations),
    // fed from this store's own copies of the three settings.
    const radio = radios.value.find((candidate) => candidate.id === radioId)
    return sharedRadioReservation(
      {
        id: radioId,
        sdrManagerHostId: radio?.sdr_manager_host_id ?? null,
        sdrManagerDeviceId: radio?.sdr_manager_device_id ?? null,
      },
      {
        aprsRadioId: aprsRadioId.value,
        aisRadioId: aisRadioId.value,
        adsbDeviceKey: adsbSourceKey.value,
      },
    )
  }

  // Start background APRS decode on a radio. Persists server-side and keeps
  // feeding the Land map even when another radio is viewed. Returns success.
  async function startAprs(radioId: number, offsetHz = 0, bwHz = 0): Promise<boolean> {
    try {
      const res = await fetch('/api/sdr/aprs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radio_id: radioId, offset_hz: offsetHz, bw_hz: bwHz }),
      })
      // Track the decoding radio only once the backend has accepted it, so a
      // failed start never mutes a radio that isn't decoding.
      if (res.ok) {
        setAprsRadioId(radioId)
        // The backend persisted `sdr.aprs_radio_id` — let the config JSON follow.
        notifySettingsChanged()
      }
      return res.ok
    } catch {
      return false
    }
  }

  // Stop background APRS decode on a radio and clear the persisted choice.
  async function stopAprs(radioId: number): Promise<boolean> {
    try {
      const res = await fetch('/api/sdr/aprs/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radio_id: radioId }),
      })
      if (res.ok) notifySettingsChanged()
      return res.ok
    } catch {
      return false
    } finally {
      // Clear regardless of the response: the user asked for decode to stop, so
      // the audio must not stay muted even if the backend call failed.
      setAprsRadioId(null)
    }
  }

  return {
    aprsEnabled,
    setAprsEnabled,
    aprsRadioId,
    setAprsRadioId,
    hydrateAprsFromDb,
    startAprs,
    stopAprs,
    aisRadioId,
    setAisRadioId,
    hydrateAisFromDb,
    startAis,
    stopAis,
    adsbSourceKey,
    hydrateAdsbSourceFromDb,
    radioReservation,
  }
}
