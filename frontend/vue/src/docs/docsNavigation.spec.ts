import { describe, it, expect } from 'vitest'
import {
  adjacentDocsPages,
  buildDocsLibrary,
  DOCS_INDEX_PATH,
  docsPageUrl,
  docsPathFromParam,
  DocsNavigationError,
  repoFileFromGlobKey,
} from './docsNavigation'

const MARKDOWN = {
  'docs/index.md': '# Welcome',
  'docs/sections.md': '# Sections',
  'docs/operations.md': '# Operations',
  'docs/adr/0001-first.md': '# First',
  'docs/adr/0002-second.md': '# Second',
  'CONTRIBUTING.md': '# Contributing',
}

const MANIFEST = {
  groups: [
    { key: 'introduction', title: 'Introduction', pages: [{ path: 'index', title: 'Welcome' }] },
    { key: 'air', title: 'Things you can do', pages: [] },
    {
      key: 'sdr',
      title: 'Use Sentinel',
      pages: [{ path: 'sections', title: 'Sections' }],
    },
    {
      key: 'develop',
      title: 'Develop',
      pages: [
        { path: 'contributing', title: 'Contributing', file: 'CONTRIBUTING.md' },
        {
          title: 'Design decisions',
          pages: [
            { path: 'adr/0001-first', title: '0001 First' },
            { path: 'adr/0002-second', title: '0002 Second' },
          ],
        },
      ],
    },
  ],
  synonyms: { Plane: ['Air', 'aircraft'] },
}

function expectNavigationError(action: () => unknown, messagePart: string): void {
  expect(action).toThrow(DocsNavigationError)
  expect(action).toThrow(messagePart)
}

describe('docsPageUrl', () => {
  it('maps the index page to /docs/', () => {
    expect(docsPageUrl(DOCS_INDEX_PATH)).toBe('/docs/')
  })

  it('maps any other page below /docs/', () => {
    expect(docsPageUrl('operations')).toBe('/docs/operations')
    expect(docsPageUrl('adr/0006-section-containers')).toBe('/docs/adr/0006-section-containers')
  })
})

describe('docsPathFromParam', () => {
  it('treats an empty parameter as the welcome page', () => {
    expect(docsPathFromParam('')).toBe('index')
  })

  it('treats slashes only as the welcome page', () => {
    expect(docsPathFromParam('/')).toBe('index')
    expect(docsPathFromParam('///')).toBe('index')
  })

  it('strips leading and trailing slashes but keeps inner ones', () => {
    expect(docsPathFromParam('/adr/0001-x/')).toBe('adr/0001-x')
    expect(docsPathFromParam('operations')).toBe('operations')
  })
})

describe('repoFileFromGlobKey', () => {
  it('removes the leading ../ segments', () => {
    expect(repoFileFromGlobKey('../../../../docs/adr/x.md')).toBe('docs/adr/x.md')
    expect(repoFileFromGlobKey('../../../../CONTRIBUTING.md')).toBe('CONTRIBUTING.md')
  })

  it('leaves a key without them alone and keeps inner dots', () => {
    expect(repoFileFromGlobKey('docs/a/../b.md')).toBe('docs/a/../b.md')
  })
})

describe('buildDocsLibrary: a valid manifest', () => {
  const library = buildDocsLibrary(MANIFEST, MARKDOWN)

  it('hides groups that have no pages', () => {
    expect(library.groups.map((group) => group.key)).toEqual(['introduction', 'sdr', 'develop'])
  })

  it('lists every page in reading order across groups, sub-lists included', () => {
    expect(library.pages.map((page) => page.path)).toEqual([
      'index',
      'sections',
      'contributing',
      'adr/0001-first',
      'adr/0002-second',
    ])
  })

  it('builds each page with its url, title, file, markdown and group', () => {
    const page = library.pageByPath.get('sections')
    expect(page).toEqual({
      path: 'sections',
      url: '/docs/sections',
      title: 'Sections',
      file: 'docs/sections.md',
      markdown: '# Sections',
      groupKey: 'sdr',
      groupTitle: 'Use Sentinel',
    })
  })

  it('gives the index page the /docs/ url', () => {
    expect(library.pageByPath.get('index')?.url).toBe('/docs/')
  })

  it('uses an explicit file when the manifest names one', () => {
    expect(library.pageByPath.get('contributing')?.file).toBe('CONTRIBUTING.md')
    expect(library.pageByFile.get('CONTRIBUTING.md')?.path).toBe('contributing')
  })

  it('looks pages up by file for link resolution', () => {
    expect(library.pageByFile.get('docs/adr/0002-second.md')?.path).toBe('adr/0002-second')
  })

  it('records the sub-list title on pages inside a sub-list only', () => {
    expect(library.pageByPath.get('adr/0001-first')?.subgroupTitle).toBe('Design decisions')
    expect(library.pageByPath.get('contributing')).not.toHaveProperty('subgroupTitle')
  })

  it('nests sub-lists in the group entries and flattens them in group pages', () => {
    const develop = library.groups.find((group) => group.key === 'develop')
    expect(develop?.entries.map((entry) => entry.kind)).toEqual(['page', 'subgroup'])
    const subgroupEntry = develop?.entries[1]
    expect(subgroupEntry?.kind === 'subgroup' && subgroupEntry.subgroup.title).toBe(
      'Design decisions',
    )
    expect(subgroupEntry?.kind === 'subgroup' && subgroupEntry.subgroup.pages).toHaveLength(2)
    expect(develop?.pages.map((page) => page.path)).toEqual([
      'contributing',
      'adr/0001-first',
      'adr/0002-second',
    ])
  })

  it('lower-cases synonym keys and keeps their terms', () => {
    expect(library.synonyms).toEqual({ plane: ['Air', 'aircraft'] })
  })

  it('has no synonyms when the manifest has none', () => {
    const { synonyms: _unused, ...withoutSynonyms } = MANIFEST
    expect(buildDocsLibrary(withoutSynonyms, MARKDOWN).synonyms).toEqual({})
  })
})

describe('buildDocsLibrary: invalid manifests fail loudly', () => {
  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'groups'],
    ['an object without groups', {}],
    ['groups that is not an array', { groups: {} }],
  ])('rejects a manifest that is %s', (_name, manifest) => {
    expectNavigationError(() => buildDocsLibrary(manifest, MARKDOWN), 'expected an object')
  })

  it('prefixes every error with the file name', () => {
    expect(() => buildDocsLibrary(null, MARKDOWN)).toThrow(/^docs\/nav\.json: /)
    try {
      buildDocsLibrary(null, MARKDOWN)
    } catch (error) {
      expect((error as Error).name).toBe('DocsNavigationError')
    }
  })

  it('rejects a group that is not an object', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: ['nope'] }, MARKDOWN),
      'groups[0] must be an object',
    )
  })

  it('rejects an unknown group key', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 'mystery', title: 'X', pages: [] }] }, MARKDOWN),
      'unknown group key "mystery"',
    )
  })

  it('rejects a group with a blank or missing title', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 'develop', title: '  ', pages: [] }] }, MARKDOWN),
      'needs a non-empty string "title"',
    )
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 'develop', pages: [] }] }, MARKDOWN),
      'needs a non-empty string "title"',
    )
  })

  it('rejects a group key that is not a string', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 4, title: 'X', pages: [] }] }, MARKDOWN),
      'needs a non-empty string "key"',
    )
  })

  it('rejects a repeated group', () => {
    const group = { key: 'develop', title: 'Develop', pages: [] }
    expectNavigationError(
      () => buildDocsLibrary({ groups: [group, group] }, MARKDOWN),
      'duplicate group "develop"',
    )
  })

  it('rejects a group without a pages array', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 'develop', title: 'Develop' }] }, MARKDOWN),
      'needs a "pages" array',
    )
  })

  it('rejects a page that is not an object', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [{ key: 'develop', title: 'D', pages: ['x'] }] }, MARKDOWN),
      'groups[0].pages[0] must be an object',
    )
  })

  it('rejects a page without a path or title', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          { groups: [{ key: 'develop', title: 'D', pages: [{ title: 'No path' }] }] },
          MARKDOWN,
        ),
      '"path"',
    )
    expectNavigationError(
      () =>
        buildDocsLibrary(
          { groups: [{ key: 'develop', title: 'D', pages: [{ path: 'sections', title: '' }] }] },
          MARKDOWN,
        ),
      '"title"',
    )
  })

  it('rejects a repeated page path, even across groups', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          {
            groups: [
              { key: 'develop', title: 'D', pages: [{ path: 'sections', title: 'A' }] },
              { key: 'getting-started', title: 'R', pages: [{ path: 'sections', title: 'B' }] },
            ],
          },
          MARKDOWN,
        ),
      'duplicate page path "sections"',
    )
  })

  it('rejects a page whose markdown was not bundled and says which file', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          { groups: [{ key: 'develop', title: 'D', pages: [{ path: 'ghost', title: 'Ghost' }] }] },
          MARKDOWN,
        ),
      'docs/ghost.md, which was not bundled',
    )
  })

  it('rejects a missing explicit file', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          {
            groups: [
              {
                key: 'develop',
                title: 'D',
                pages: [{ path: 'x', title: 'X', file: 'docs/plans/x.md' }],
              },
            ],
          },
          MARKDOWN,
        ),
      'docs/plans/x.md',
    )
  })

  it('rejects a problem inside a sub-list and locates it', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          {
            groups: [
              {
                key: 'develop',
                title: 'D',
                pages: [{ title: 'Sub', pages: [{ path: 'missing', title: 'M' }] }],
              },
            ],
          },
          MARKDOWN,
        ),
      'groups[0].pages[0].pages[0]',
    )
  })

  it('rejects a sub-list without a title', () => {
    expectNavigationError(
      () =>
        buildDocsLibrary(
          { groups: [{ key: 'develop', title: 'D', pages: [{ pages: [] }] }] },
          MARKDOWN,
        ),
      '"title"',
    )
  })

  it('rejects synonyms that are not an object', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [], synonyms: [] }, MARKDOWN),
      '"synonyms" must be an object',
    )
    expectNavigationError(
      () => buildDocsLibrary({ groups: [], synonyms: 'plane' }, MARKDOWN),
      '"synonyms" must be an object',
    )
  })

  it('rejects synonym terms that are not an array of strings', () => {
    expectNavigationError(
      () => buildDocsLibrary({ groups: [], synonyms: { plane: 'Air' } }, MARKDOWN),
      'synonyms["plane"] must be an array of strings',
    )
    expectNavigationError(
      () => buildDocsLibrary({ groups: [], synonyms: { plane: ['Air', 3] } }, MARKDOWN),
      'synonyms["plane"] must be an array of strings',
    )
  })

  it('accepts an empty manifest', () => {
    const library = buildDocsLibrary({ groups: [] }, MARKDOWN)
    expect(library.groups).toEqual([])
    expect(library.pages).toEqual([])
  })
})

describe('adjacentDocsPages', () => {
  const library = buildDocsLibrary(MANIFEST, MARKDOWN)

  it('has no previous page on the first page', () => {
    const { previous, next } = adjacentDocsPages(library, 'index')
    expect(previous).toBeNull()
    expect(next?.path).toBe('sections')
  })

  it('has no next page on the last page', () => {
    const { previous, next } = adjacentDocsPages(library, 'adr/0002-second')
    expect(previous?.path).toBe('adr/0001-first')
    expect(next).toBeNull()
  })

  it('crosses group boundaries', () => {
    const { previous, next } = adjacentDocsPages(library, 'sections')
    expect(previous?.path).toBe('index')
    expect(next?.path).toBe('contributing')
  })

  it('returns neither for an unknown path', () => {
    expect(adjacentDocsPages(library, 'nope')).toEqual({ previous: null, next: null })
  })

  it('returns neither for an empty library', () => {
    const empty = buildDocsLibrary({ groups: [] }, MARKDOWN)
    expect(adjacentDocsPages(empty, 'index')).toEqual({ previous: null, next: null })
  })
})
