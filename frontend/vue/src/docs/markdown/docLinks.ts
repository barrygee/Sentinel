import type { DocsLibrary, DocsPage } from '../docsTypes'

/** The project's home on GitHub; repo files that are not docs pages link here. */
export const REPOSITORY_URL = 'https://github.com/barrygee/Sentinel'

/** Where the changelog lives (it is generated from commits and not bundled). */
export const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/CHANGELOG.md`

/** What a markdown link points at once resolved against the doc it was written in. */
export type ResolvedDocsLink =
  | { kind: 'page'; page: DocsPage; hash: string }
  | { kind: 'hash'; hash: string }
  | { kind: 'external'; href: string; opensNewTab: boolean }

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i

/**
 * Resolves `relativePath` against the folder of `fromFile`, both repo-relative
 * and slash-separated, collapsing `.` and `..`. A leading `/` means the repo
 * root. Escaping the repo root is clamped to the root.
 */
export function resolveRepoPath(fromFile: string, relativePath: string): string {
  const baseSegments = relativePath.startsWith('/') ? [] : fromFile.split('/').slice(0, -1)
  const resolved: string[] = [...baseSegments]
  for (const segment of relativePath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') resolved.pop()
    else resolved.push(segment)
  }
  return resolved.join('/')
}

/**
 * Works out where a markdown link goes:
 * - `#anchor` stays on the page being read;
 * - a relative link to another bundled doc becomes that page (with its anchor);
 * - any other relative link is a repo file (README, a decoder README, CLAUDE.md)
 *   that the app does not bundle, so it opens on GitHub;
 * - an absolute URL is external.
 */
export function resolveDocsLink(
  href: string,
  fromFile: string,
  library: DocsLibrary,
): ResolvedDocsLink {
  if (SCHEME_PATTERN.test(href) || href.startsWith('//')) {
    return { kind: 'external', href, opensNewTab: !href.toLowerCase().startsWith('mailto:') }
  }
  if (href.startsWith('#')) return { kind: 'hash', hash: href }

  const hashStart = href.indexOf('#')
  const pathPart = hashStart === -1 ? href : href.slice(0, hashStart)
  const hash = hashStart === -1 ? '' : href.slice(hashStart)
  const targetFile = resolveRepoPath(fromFile, decodeURI(pathPart))
  const page = library.pageByFile.get(targetFile)
  if (page) return { kind: 'page', page, hash }

  const isFolder = pathPart.endsWith('/')
  const repoHref = `${REPOSITORY_URL}/${isFolder ? 'tree' : 'blob'}/main/${targetFile}${hash}`
  return { kind: 'external', href: repoHref, opensNewTab: true }
}

/**
 * The URL an image should load from: its bundled asset when it is under
 * `docs/images`, otherwise the raw file on GitHub (so a missing image still
 * shows up rather than breaking the page).
 */
export function resolveDocsImage(
  src: string,
  fromFile: string,
  imageUrls: Readonly<Record<string, string>>,
): string {
  if (SCHEME_PATTERN.test(src) || src.startsWith('//') || src.startsWith('data:')) return src
  const targetFile = resolveRepoPath(fromFile, decodeURI(src))
  return (
    imageUrls[targetFile] ??
    `https://raw.githubusercontent.com/barrygee/Sentinel/main/${targetFile}`
  )
}
