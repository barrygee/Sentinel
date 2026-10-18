import { reactive } from 'vue'
import {
  asSourceMode,
  sectionModeStorageKey,
  type SourceMode,
} from '@sentinel/shell-api/utils/sourceMode'

/**
 * The ONLINE / OFF GRID mode each section's Settings page currently shows —
 * the choice on its Source Override control, staged or saved — so the panel
 * can show only the settings that belong to that mode (`SettingItem.sourceMode`).
 *
 * It follows the control as the user clicks, before APPLY CHANGES: picking
 * OFF GRID shows the off-grid rows at once.
 */
const shownModes = reactive(new Map<string, SourceMode>())

/** Records the mode a section's Source Override control shows. */
export function showSettingsSourceMode(section: string, mode: SourceMode): void {
  shownModes.set(section, mode)
}

/**
 * Forgets every recorded mode. The panel calls it when it drops staged changes
 * (another section picked), so a mode clicked but never applied doesn't outlive
 * them; each control records its mode again when it mounts.
 */
export function forgetShownSettingsSourceModes(): void {
  shownModes.clear()
}

/**
 * The mode a section's settings follow: what its control shows, else its
 * cached saved mode, else the app-wide mode (a section with no mode of its own
 * runs in that one).
 */
export function shownSettingsSourceMode(section: string, appMode: SourceMode): SourceMode {
  const recorded = shownModes.get(section)
  if (recorded) return recorded
  let cached: SourceMode | null = null
  try {
    cached = asSourceMode(localStorage.getItem(sectionModeStorageKey(section)))
  } catch {}
  return cached ?? appMode
}
