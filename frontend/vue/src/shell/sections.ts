import type { SectionSource } from './sectionLoader'

/** The map sections, in nav order: AIR, SPACE, SEA, LAND, SDR. */
const MAP_SECTION_SOURCES: SectionSource[] = [
  { id: 'air', load: () => import('@sentinel/section-air/section') },
  { id: 'space', load: () => import('@sentinel/section-space/section') },
  { id: 'sea', load: () => import('@sentinel/section-sea/section') },
  { id: 'land', load: () => import('@sentinel/section-land/section') },
  { id: 'sdr', load: () => import('@sentinel/section-sdr/section') },
]

/** The SDR Manager remotes, which add settings but no map section (`kind`). */
const SDR_MANAGER_SOURCES: SectionSource[] = [
  {
    id: 'sdr-manager-local',
    kind: 'sdr-manager-local',
    load: () => import('@sentinel/sdr-manager-local/register'),
  },
  {
    id: 'sdr-manager-remote',
    kind: 'sdr-manager-remote',
    load: () => import('@sentinel/sdr-manager-remote/register'),
  },
]

/**
 * Every section, imported from its workspace package — how the shell finds
 * its sections in the Vite dev server and in tests (`shell/sections`).
 *
 * The production build swaps this module for `sections.federated.ts` (see
 * vite.config.ts), which loads each section as a Module Federation remote
 * instead, so sections ship and deploy separately from the shell. Both expose
 * the same `sectionSources()`, and `loadSections` treats them identically.
 *
 * The map sections always load: every deployment runs them. The SDR Manager
 * remotes load only when the backend lists them (`GET /api/app/sections`), as
 * in the built app: sdr-manager-local runs only under its compose profile,
 * and loading it without its service leaves its cards retrying a stream that
 * isn't there. With no list to go by (no backend), and in specs, both load.
 */
export async function sectionSources(): Promise<SectionSource[]> {
  // Specs have no backend to ask: they load every remote.
  if (import.meta.env.MODE === 'test') return [...MAP_SECTION_SOURCES, ...SDR_MANAGER_SOURCES]
  const deployedIds = await deployedRemoteIds()
  return [
    ...MAP_SECTION_SOURCES,
    ...SDR_MANAGER_SOURCES.filter((source) => deployedIds === null || deployedIds.has(source.id)),
  ]
}

/** The ids the backend lists as deployed, or null when the list can't be read. */
async function deployedRemoteIds(): Promise<Set<string> | null> {
  try {
    const response = await fetch('/api/app/sections')
    if (!response.ok) return null
    const listed = ((await response.json()) as { sections?: unknown }).sections
    if (!Array.isArray(listed)) return null
    const ids = listed.map((entry) => (entry as { id?: unknown } | null)?.id)
    return new Set(ids.filter((id): id is string => typeof id === 'string'))
  } catch {
    return null
  }
}
