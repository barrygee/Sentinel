import { onMounted, ref, type Ref } from 'vue'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { GlobeLayerId } from '../feeds/globeFeedTypes'

/** Which of the globe's layers are shown (`globe.layers`). */
export type GlobeLayerToggles = Record<GlobeLayerId, boolean>

/** Every layer on: the default in `backend/default_config.json`. */
export const DEFAULT_LAYER_TOGGLES: Readonly<GlobeLayerToggles> = {
  air: true,
  space: true,
  sea: true,
  aprs: true,
}

/** The saved toggles over the defaults, ignoring anything that isn't a boolean for a known layer. */
export function parseLayerToggles(saved: unknown): GlobeLayerToggles {
  const toggles = { ...DEFAULT_LAYER_TOGGLES }
  if (typeof saved !== 'object' || saved === null) return toggles
  for (const layer of Object.keys(toggles) as GlobeLayerId[]) {
    const value = (saved as Record<string, unknown>)[layer]
    if (typeof value === 'boolean') toggles[layer] = value
  }
  return toggles
}

/** What {@link useGlobeLayerSettings} returns. */
export interface GlobeLayerSettingsHandle {
  layers: Ref<GlobeLayerToggles>
  /** Shows or hides one layer, and saves the change at once. */
  setLayer: (layer: GlobeLayerId, visible: boolean) => void
}

/**
 * The globe's layer toggles, kept in the `globe.layers` setting.
 *
 * A flip applies and saves straight away, like the flat maps' layer rails;
 * there is nothing to APPLY. The value is re-read when settings are applied
 * or the config file is edited (`sentinel:config-uploaded`), so a change made
 * there moves the toggles too. Call from a component's setup.
 */
export function useGlobeLayerSettings(): GlobeLayerSettingsHandle {
  const layers = ref<GlobeLayerToggles>({ ...DEFAULT_LAYER_TOGGLES })

  const load = async (): Promise<void> => {
    const globe = await settingsApi.getNamespace('globe')
    layers.value = parseLayerToggles(globe?.layers)
  }

  const setLayer = (layer: GlobeLayerId, visible: boolean): void => {
    layers.value = { ...layers.value, [layer]: visible }
    void settingsApi.put('globe', 'layers', layers.value)
  }

  onMounted(() => void load())
  useDocumentEvent('sentinel:config-uploaded', () => void load())
  return { layers, setLayer }
}
