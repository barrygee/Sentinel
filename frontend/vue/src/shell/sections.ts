import type { SectionSource } from './sectionLoader'

/**
 * Every section, imported from its workspace package — how the shell finds
 * its sections in the Vite dev server and in tests (`shell/sections`).
 *
 * The production build swaps this module for `sections.federated.ts` (see
 * vite.config.ts), which loads each section as a Module Federation remote
 * instead, so sections ship and deploy separately from the shell. Both expose
 * the same `sectionSources()`, and `loadSections` treats them identically.
 *
 * The order is nav order: AIR, SPACE, SEA, LAND, SDR.
 */
export async function sectionSources(): Promise<SectionSource[]> {
  return [
    { id: 'air', load: () => import('@sentinel/section-air/section') },
    { id: 'space', load: () => import('@sentinel/section-space/section') },
    { id: 'sea', load: () => import('@sentinel/section-sea/section') },
    { id: 'land', load: () => import('@sentinel/section-land/section') },
    { id: 'sdr', load: () => import('@sentinel/section-sdr/section') },
  ]
}
