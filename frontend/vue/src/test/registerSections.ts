import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { sectionSources } from '@/shell/sections'
import { startSectionEngines } from '@/shell/sectionEngines'

/**
 * Registers every section with the shell's registries and loads the SDR
 * engine, as `main.ts` does before the app mounts — for specs of shell
 * components (App, SettingsPanel…) that read the registries.
 *
 * Calls each section's `register()` directly rather than going through
 * `loadSections`, so the spec exercises the components, not the loader's
 * failure handling. Sections refuse to register without the host's Pinia, so
 * the active one is handed over (one is created if the spec has none yet).
 */
export async function registerAllSections(): Promise<void> {
  const pinia = getActivePinia() ?? createPinia()
  setActivePinia(pinia)
  for (const source of await sectionSources()) {
    const sectionModule = await source.load()
    sectionModule.default({ pinia })
  }
  await startSectionEngines()
}
