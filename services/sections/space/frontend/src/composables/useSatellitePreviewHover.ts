import { onUnmounted } from 'vue'
import type { SatelliteControl } from '../controls/satellite/SatelliteControl'

/** How long the preview outlives the pointer, so moving between rows doesn't flicker it. */
const PREVIEW_CLEAR_DELAY_MS = 50

/** What `useSatellitePreviewHover` returns. */
export interface SatellitePreviewHover {
  /** Previews a satellite on the map, cancelling a pending clear. */
  showPreview: (noradId: string, label: string) => void
  /** Clears the preview shortly, unless another row is entered first. */
  schedulePreviewClear: () => void
}

/**
 * The map preview a Space list row shows while hovered (the satellite list and
 * the PASSES pane both offer it). Leaving a row clears the preview after a
 * short delay, so the pointer can cross to the next row without it flickering.
 */
export function useSatellitePreviewHover(
  getSatelliteControl: () => SatelliteControl | null,
): SatellitePreviewHover {
  let clearPreviewTimer: ReturnType<typeof setTimeout> | null = null

  function showPreview(noradId: string, label: string): void {
    if (clearPreviewTimer) {
      clearTimeout(clearPreviewTimer)
      clearPreviewTimer = null
    }
    getSatelliteControl()?.previewSatellite(noradId, label)
  }

  function schedulePreviewClear(): void {
    if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
    clearPreviewTimer = setTimeout(() => {
      clearPreviewTimer = null
      getSatelliteControl()?.clearPreview()
    }, PREVIEW_CLEAR_DELAY_MS)
  }

  onUnmounted(() => {
    if (clearPreviewTimer) clearTimeout(clearPreviewTimer)
  })

  return { showPreview, schedulePreviewClear }
}
