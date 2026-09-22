import { computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSdrStore } from '@/stores/sdr'
import { useSettingsStore } from '@/stores/settings'

/**
 * Runs off-grid AIS decode for the Sea domain: tunes the designated SDR to the
 * AIS channels and keeps it decoding while Sea has no internet source.
 *
 * Two settings decide this between them, and they mean different things:
 *   * `sea.aisSdrRadioId` — which radio is *designated* the AIS receiver
 *     (chosen in Settings › SEA, see `SeaAisSdrSourceControl`);
 *   * `sdr.ais_radio_id` — which radio is *actually decoding*, owned by the
 *     backend and persisted so decode resumes after a restart.
 * This composable is what turns the first into the second.
 *
 * **Only off grid.** Online vessels come from AISStream.io and involve no local
 * dongle at all; decoding then would hold hardware away from whatever else
 * wants it in order to duplicate a feed already arriving over the internet.
 * Switching Sea back online therefore releases the radio.
 *
 * **Starts on entering Sea, but does not stop on leaving it.** Unlike the AIR
 * ADS-B claim, which hands the dongle back as soon as you navigate away, AIS
 * decode is left running in the background once started. A vessel picture is
 * built up over minutes from scattered transmissions, so tearing it down on
 * every navigation would mean starting from an empty map each time Sea is
 * opened. Decode stops when the operator clears the radio in Settings, or when
 * the domain goes back online.
 */
export function useOffgridAisDecode() {
  const appStore = useAppStore()
  const sdrStore = useSdrStore()
  const settingsStore = useSettingsStore()

  /**
   * Whether Sea is reading off grid right now.
   *
   * The sea domain's own `sourceOverride` wins over the app-wide mode, matching
   * how the backend's `resolve_effective_mode` decides which source to serve —
   * the two must agree, or Sentinel would hold a dongle while reading vessels
   * from the internet, or read locally while decoding nothing.
   */
  const isOffgrid = computed(() => {
    const override = settingsStore.getSetting<string>('sea', 'sourceOverride', 'auto')
    if (override === 'online') return false
    if (override === 'offgrid') return true
    return appStore.connectivityMode === 'offgrid' || !appStore.isOnline
  })

  /** The radio designated as the AIS receiver, or null when none is set. */
  const designatedRadioId = computed<number | null>(() => {
    const configured = settingsStore.getSetting<number | null>('sea', 'aisSdrRadioId', null)
    return typeof configured === 'number' ? configured : null
  })

  /** The radio that should be decoding now: the designated one, off grid only. */
  const radioToDecodeOn = computed<number | null>(() =>
    isOffgrid.value ? designatedRadioId.value : null,
  )

  watch(
    radioToDecodeOn,
    async (nextRadioId) => {
      if (nextRadioId !== null) {
        // The backend runs a single AIS bridge, so starting on another radio
        // hands decode over rather than running two — no explicit stop first.
        // Starting one that is already decoding is a no-op server-side.
        await sdrStore.startAis(nextRadioId)
        return
      }
      // Gone online, or the radio was cleared: release whatever is decoding.
      const decodingRadioId = sdrStore.aisRadioId
      if (decodingRadioId !== null) await sdrStore.stopAis(decodingRadioId)
    },
    { immediate: true },
  )

  return {
    /** Whether the Sea domain is reading off grid. */
    isOffgrid,
    /** The radio designated as the AIS receiver, or null. */
    designatedRadioId,
  }
}
