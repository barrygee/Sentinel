import { sectionSources } from '@/shell/sections'

/**
 * Registers every section with the shell's registries, as `main.ts` does
 * before the app mounts — for specs of shell components (App, SettingsPanel…)
 * that read the registries.
 *
 * Calls each section's `register()` directly rather than going through
 * `loadSections`, so the spec exercises the components, not the loader's
 * failure handling.
 */
export async function registerAllSections(): Promise<void> {
  for (const source of await sectionSources()) {
    const sectionModule = await source.load()
    sectionModule.default()
  }
}
