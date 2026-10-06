import { loadRemote, registerRemotes } from '@module-federation/runtime'
import type { SectionRegisterModule, SectionSource } from './sectionLoader'

/** One entry of `GET /api/app/sections`: a section this deployment includes. */
export interface DeployedSection {
  id: string
  /** Same-origin URL of its federation remote entry, e.g. `/remotes/air/remoteEntry.js`. */
  remoteEntry: string
}

const SECTION_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Only same-origin remotes under `/remotes/<id>/` are ever loaded: the shell
 * executes whatever a remote entry contains, so a manifest entry pointing
 * anywhere else (another origin, a protocol-relative URL, a path outside
 * /remotes/) is refused rather than trusted.
 */
function isTrustedSection(entry: unknown): entry is DeployedSection {
  if (typeof entry !== 'object' || entry === null) return false
  const { id, remoteEntry } = entry as Record<string, unknown>
  return (
    typeof id === 'string' &&
    SECTION_ID_PATTERN.test(id) &&
    remoteEntry === `/remotes/${id}/remoteEntry.js`
  )
}

/** The federation container name a section's remote is built with (`@sentinel/web-config/federation`). */
function remoteName(sectionId: string): string {
  return `section_${sectionId}`
}

/**
 * The sections of this deployment, loaded as Module Federation remotes — what
 * the built app uses in place of `sections.ts` (see vite.config.ts).
 *
 * The backend lists the deployed sections (`GET /api/app/sections`); each is
 * registered with the federation runtime and fetched through its `./register`
 * entry. Untrusted entries are dropped with a console error; if the list
 * itself cannot be read the shell boots with no sections, as it would with
 * the backend down.
 */
export async function sectionSources(): Promise<SectionSource[]> {
  let listed: unknown
  try {
    const response = await fetch('/api/app/sections')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    listed = ((await response.json()) as { sections?: unknown }).sections
  } catch (error) {
    console.error('[sentinel] could not read the section list:', error)
    return []
  }
  const entries = Array.isArray(listed) ? listed : []
  const sections = entries.filter(isTrustedSection)
  if (sections.length !== entries.length) {
    console.error('[sentinel] ignored section list entries that are not same-origin remotes')
  }

  registerRemotes(
    sections.map((section) => ({
      name: remoteName(section.id),
      entry: section.remoteEntry,
      type: 'module',
    })),
  )
  return sections.map((section) => ({
    id: section.id,
    load: async () => {
      const module = await loadRemote<SectionRegisterModule>(`${remoteName(section.id)}/register`)
      if (!module) throw new Error(`remote "${section.id}" exposed no ./register`)
      return module
    },
  }))
}
