import navigationManifest from '../../../../docs/nav.json'
import { buildDocsLibrary, repoFileFromGlobKey } from './docsNavigation'
import type { DocsLibrary } from './docsTypes'

/**
 * The documentation source, bundled at build time.
 *
 * The markdown is the repo's own `docs/**` plus the root `CONTRIBUTING.md`, so
 * the in-app docs and the files on GitHub are the same text. `docs/plans/**`
 * is working design notes and is deliberately left out, as is the changelog.
 * Eager is fine here: it is plain text, and this module is only reached through
 * the lazily loaded `/doc` route, so none of it is in the app's entry chunk.
 */
const markdownModules = import.meta.glob(
  ['../../../../docs/**/*.md', '../../../../CONTRIBUTING.md', '!../../../../docs/plans/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

/** Images under `docs/images`, as their bundled (hashed) URLs. */
const imageModules = import.meta.glob('../../../../docs/images/**/*.{png,jpg,jpeg,gif,svg,webp}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

function keyByRepoFile(modules: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(modules).map(([globKey, value]) => [repoFileFromGlobKey(globKey), value]),
  )
}

/** Bundled image URLs keyed by repo-relative file (`docs/images/x.png`). */
export const docsImageUrls: Readonly<Record<string, string>> = keyByRepoFile(imageModules)

let cachedLibrary: DocsLibrary | undefined

/**
 * The validated documentation set. Built once, on first use; throws
 * `DocsNavigationError` (loudly, in dev and in a failing build-time smoke) when
 * `docs/nav.json` names a file that was not bundled.
 */
export function getDocsLibrary(): DocsLibrary {
  cachedLibrary ??= buildDocsLibrary(navigationManifest, keyByRepoFile(markdownModules))
  return cachedLibrary
}

/** Drops the cached library so a spec can rebuild it. Not used by the app. */
export function resetDocsLibraryCache(): void {
  cachedLibrary = undefined
}
