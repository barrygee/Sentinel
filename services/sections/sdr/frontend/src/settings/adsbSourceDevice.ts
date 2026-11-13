import { useSettingsStore } from '@sentinel/shell-api/stores/settings'

/** Air's off-grid ADS-B source as stored in `air.offgridSdrSource`. */
interface AdsbSdrSource {
  sdr_manager_host_id: number
  sdr_manager_device_id: string
}

/**
 * Whether Air's ADS-B decoder reads from this SDR host's device
 * (`air.offgridSdrSource`, picked in Settings › AIR).
 *
 * The decoder reads its source's raw I/Q whatever mode Air is in, and holds a
 * lease on it while Air watches off grid, so the same dongle can't also be a
 * radio: the SDR panel would retune it off 1090 MHz and blind the decoder.
 * Read from the shared settings store, which holds every section's settings,
 * so this section needn't import Air's code.
 */
export function useAdsbSourceDevice(): (hostId: number, deviceId: string) => boolean {
  const settings = useSettingsStore()
  return (hostId, deviceId) => {
    const source = settings.getSetting<AdsbSdrSource | null>('air', 'offgridSdrSource', null)
    return source?.sdr_manager_host_id === hostId && source.sdr_manager_device_id === deviceId
  }
}
