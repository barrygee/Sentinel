import { describe, it, expect, beforeEach } from 'vitest'
import { getDocsLibrary, resetDocsLibraryCache } from './docsSources'

describe('docsSources', () => {
  beforeEach(() => resetDocsLibraryCache())

  it('builds the library from the real docs/nav.json and bundled markdown', () => {
    const library = getDocsLibrary()
    expect(library.pageByPath.get('index')?.markdown).toContain('Sentinel')
    expect(library.pages.length).toBeGreaterThan(5)
    for (const page of library.pages) expect(page.markdown.trim()).not.toBe('')
  })

  it('keys markdown by repo-relative file, including the root CONTRIBUTING.md', () => {
    const library = getDocsLibrary()
    expect(library.pageByFile.has('docs/operations.md')).toBe(true)
    expect(library.pageByFile.get('CONTRIBUTING.md')?.path).toBe('contributing')
  })

  it('leaves working notes under docs/plans out of the bundle', () => {
    const library = getDocsLibrary()
    expect([...library.pageByFile.keys()].filter((file) => file.startsWith('docs/plans/'))).toEqual(
      [],
    )
  })

  it('returns the same library until the cache is reset', () => {
    const first = getDocsLibrary()
    expect(getDocsLibrary()).toBe(first)
    resetDocsLibraryCache()
    const rebuilt = getDocsLibrary()
    expect(rebuilt).not.toBe(first)
    expect(rebuilt.pages.map((page) => page.path)).toEqual(first.pages.map((page) => page.path))
  })
})
