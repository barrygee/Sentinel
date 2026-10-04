/**
 * Boot-time settings hydration (docs/plans/section-containers.md §3.5, F1).
 *
 * `main.ts` fetches `/api/settings` once before the first render. Core state
 * (enabled domains, connectivity mode, theme, sound, base-map layers) it
 * applies itself; each section registers a hydrator here for its own stores,
 * so `main.ts` imports no section store. Hydrators run in registration order,
 * after core, before the app mounts — the maps draw the stored choice from the
 * first frame. (In the federated shell this is part of each remote's
 * `register()`, which also runs before mount.)
 */

/** Every namespace's settings, as `GET /api/settings` returns them. */
export type AllSettings = Record<string, Record<string, unknown>>

/** Applies a section's stored settings to its stores. Must not throw. */
export type SettingsHydrator = (settings: AllSettings) => void

const hydrators = new Map<string, SettingsHydrator>()

/** Registers a section's hydrator. One per section. */
export function registerSettingsHydrator(sectionId: string, hydrator: SettingsHydrator): void {
  if (hydrators.has(sectionId)) {
    throw new Error(`Section "${sectionId}" already registered a settings hydrator`)
  }
  hydrators.set(sectionId, hydrator)
}

/** Runs every registered hydrator against the boot settings payload. */
export function runSettingsHydrators(settings: AllSettings): void {
  for (const hydrator of hydrators.values()) hydrator(settings)
}

/** Test seam: forget every registered hydrator. */
export function resetSettingsHydratorsForTests(): void {
  hydrators.clear()
}
