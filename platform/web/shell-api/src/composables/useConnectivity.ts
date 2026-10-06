import { watch } from 'vue'
import { useAppStore } from '../stores/app'

/**
 * Calls `onModeChange` whenever the app switches between ONLINE and OFF GRID,
 * so a map can swap its basemap and data sources.
 *
 * Connectivity is an explicit choice (Settings › Connectivity Mode) — nothing
 * is probed. The views already build their first frame from the current mode,
 * so the callback fires only on a change.
 */
export function useConnectivity(onModeChange?: (online: boolean) => void): void {
  const appStore = useAppStore()
  watch(
    () => appStore.isOnline,
    (online) => onModeChange?.(online),
  )
}
