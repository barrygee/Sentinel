import { vi } from 'vitest'
import { loadDocsLibrary, resetDocsLibraryCache } from '@/docs/docsSources'
import type { DocsLibrary } from '@/docs/docsTypes'

/**
 * The docs service's library built from the checkout, for the specs that read
 * the real docs (DocsPage, useDocsRouteState). The SPA no longer bundles the
 * markdown, so this answers `GET /api/documentation/library` the way
 * `sentinel_docs.library.read_library` does: `docs/**` plus `CONTRIBUTING.md`,
 * never `docs/plans/`.
 */
// Globbed, not imported: the image's SPA stage type-checks src/ without the
// repo's docs/ folder (the docs are no longer bundled), and a glob that
// matches nothing still type-checks where a static JSON import would not.
const navigationModules = import.meta.glob('../../../../docs/nav.json', {
  import: 'default',
  eager: true,
})

const markdownModules = import.meta.glob(
  ['../../../../docs/**/*.md', '../../../../CONTRIBUTING.md', '!../../../../docs/plans/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const imageFiles = Object.keys(
  import.meta.glob('../../../../docs/images/**/*.{png,jpg,jpeg,gif,svg,webp}'),
)

function repoFileOf(globKey: string): string {
  return globKey.replace(/^(\.\.\/)+/, '')
}

/** Body of `GET /api/documentation/library` for the repo's docs. */
export function repoDocsLibraryResponse(): {
  navigation: unknown
  documents: Record<string, string>
  images: string[]
} {
  return {
    navigation: navigationModules['../../../../docs/nav.json'],
    documents: Object.fromEntries(
      Object.entries(markdownModules).map(([globKey, markdown]) => [repoFileOf(globKey), markdown]),
    ),
    images: imageFiles.map(repoFileOf),
  }
}

/**
 * Loads the repo's docs into `docsSources` as the docs route would, through a
 * stubbed fetch, so `getDocsLibrary()` answers synchronously afterwards.
 */
export async function loadRepoDocsLibrary(): Promise<DocsLibrary> {
  resetDocsLibraryCache()
  const fetchStub = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(repoDocsLibraryResponse()), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchStub)
  try {
    return await loadDocsLibrary()
  } finally {
    vi.unstubAllGlobals()
  }
}
