import {
  DOC_GROUP_KEYS,
  type DocGroupKey,
  type DocsGroup,
  type DocsLibrary,
  type DocsListEntry,
  type DocsPage,
} from './docsTypes'

/** The path of the welcome page, which is served at `/doc/`. */
export const DOCS_INDEX_PATH = 'index'

/** Thrown when `docs/nav.json` is malformed or names a file that was not bundled. */
export class DocsNavigationError extends Error {
  constructor(message: string) {
    super(`docs/nav.json: ${message}`)
    this.name = 'DocsNavigationError'
  }
}

/** The router URL of a page path: `index` -> `/doc/`, `operations` -> `/doc/operations`. */
export function docsPageUrl(path: string): string {
  return path === DOCS_INDEX_PATH ? '/doc/' : `/doc/${path}`
}

/**
 * Turns the router's `/doc/<...>` parameter into a page path: surrounding
 * slashes are dropped and an empty parameter means the welcome page.
 */
export function docsPathFromParam(param: string): string {
  const trimmed = param.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? DOCS_INDEX_PATH : trimmed
}

/**
 * Turns a glob key (`../../../../docs/adr/x.md`) into the repo-relative file
 * (`docs/adr/x.md`) the manifest and the markdown links refer to.
 */
export function repoFileFromGlobKey(globKey: string): string {
  return globKey.replace(/^(\.\.\/)+/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocsNavigationError(`${where} needs a non-empty string "${field}"`)
  }
  return value
}

function isGroupKey(value: string): value is DocGroupKey {
  return (DOC_GROUP_KEYS as readonly string[]).includes(value)
}

/**
 * Validates the manifest against the bundled markdown and builds the library.
 *
 * Fails loudly (throws `DocsNavigationError`) on a malformed manifest, an
 * unknown group key, a duplicate page path, or a page whose markdown file was
 * not bundled — so a typo breaks the build or dev server instead of shipping a
 * dead page.
 *
 * @param manifest The parsed `docs/nav.json`.
 * @param markdownByFile Bundled markdown keyed by repo-relative file.
 */
export function buildDocsLibrary(
  manifest: unknown,
  markdownByFile: Readonly<Record<string, string>>,
): DocsLibrary {
  if (!isRecord(manifest) || !Array.isArray(manifest.groups)) {
    throw new DocsNavigationError('expected an object with a "groups" array')
  }

  const pageByPath = new Map<string, DocsPage>()
  const pageByFile = new Map<string, DocsPage>()
  const groups: DocsGroup[] = []
  const seenGroupKeys = new Set<string>()

  function buildPage(
    rawPage: unknown,
    where: string,
    group: { key: DocGroupKey; title: string },
    subgroupTitle: string | undefined,
  ): DocsPage {
    if (!isRecord(rawPage)) throw new DocsNavigationError(`${where} must be an object`)
    const path = readString(rawPage, 'path', where)
    const title = readString(rawPage, 'title', where)
    const file = typeof rawPage.file === 'string' ? rawPage.file : `docs/${path}.md`
    if (pageByPath.has(path))
      throw new DocsNavigationError(`${where}: duplicate page path "${path}"`)
    const markdown = markdownByFile[file]
    if (markdown === undefined) {
      throw new DocsNavigationError(
        `${where}: "${path}" points at ${file}, which was not bundled (is the file missing, or under docs/plans?)`,
      )
    }
    const page: DocsPage = {
      path,
      url: docsPageUrl(path),
      title,
      file,
      markdown,
      groupKey: group.key,
      groupTitle: group.title,
      ...(subgroupTitle === undefined ? {} : { subgroupTitle }),
    }
    pageByPath.set(path, page)
    pageByFile.set(file, page)
    return page
  }

  manifest.groups.forEach((rawGroup: unknown, groupIndex: number) => {
    const where = `groups[${groupIndex}]`
    if (!isRecord(rawGroup)) throw new DocsNavigationError(`${where} must be an object`)
    const key = readString(rawGroup, 'key', where)
    if (!isGroupKey(key)) {
      throw new DocsNavigationError(`${where}: unknown group key "${key}"`)
    }
    if (seenGroupKeys.has(key)) throw new DocsNavigationError(`${where}: duplicate group "${key}"`)
    seenGroupKeys.add(key)
    const title = readString(rawGroup, 'title', where)
    if (!Array.isArray(rawGroup.pages)) {
      throw new DocsNavigationError(`${where} needs a "pages" array`)
    }

    const entries: DocsListEntry[] = []
    const flatPages: DocsPage[] = []
    rawGroup.pages.forEach((rawEntry: unknown, entryIndex: number) => {
      const entryWhere = `${where}.pages[${entryIndex}]`
      if (isRecord(rawEntry) && Array.isArray(rawEntry.pages)) {
        const subgroupTitle = readString(rawEntry, 'title', entryWhere)
        const subgroupPages = rawEntry.pages.map((rawPage: unknown, pageIndex: number) =>
          buildPage(rawPage, `${entryWhere}.pages[${pageIndex}]`, { key, title }, subgroupTitle),
        )
        entries.push({ kind: 'subgroup', subgroup: { title: subgroupTitle, pages: subgroupPages } })
        flatPages.push(...subgroupPages)
      } else {
        const page = buildPage(rawEntry, entryWhere, { key, title }, undefined)
        entries.push({ kind: 'page', page })
        flatPages.push(page)
      }
    })

    if (flatPages.length > 0) groups.push({ key, title, entries, pages: flatPages })
  })

  const synonyms: Record<string, readonly string[]> = {}
  if (manifest.synonyms !== undefined) {
    if (!isRecord(manifest.synonyms)) throw new DocsNavigationError('"synonyms" must be an object')
    for (const [word, terms] of Object.entries(manifest.synonyms)) {
      if (!Array.isArray(terms) || terms.some((term) => typeof term !== 'string')) {
        throw new DocsNavigationError(`synonyms["${word}"] must be an array of strings`)
      }
      synonyms[word.toLowerCase()] = terms as string[]
    }
  }

  return {
    groups,
    pages: groups.flatMap((group) => group.pages),
    pageByPath,
    pageByFile,
    synonyms,
  }
}

/** The page before and after `path` in reading order (across groups). */
export function adjacentDocsPages(
  library: DocsLibrary,
  path: string,
): { previous: DocsPage | null; next: DocsPage | null } {
  const index = library.pages.findIndex((page) => page.path === path)
  if (index === -1) return { previous: null, next: null }
  return {
    previous: library.pages[index - 1] ?? null,
    next: library.pages[index + 1] ?? null,
  }
}
