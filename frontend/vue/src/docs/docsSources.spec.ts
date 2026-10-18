import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FIXTURE_DOCS_MANIFEST, FIXTURE_DOCS_MARKDOWN } from '@/test/docsFixtures'
import { repoDocsLibraryResponse } from '@/test/repoDocs'
import { DocsNavigationError } from './docsNavigation'
import {
  DocsUnavailableError,
  getDocsImageUrls,
  getDocsLibrary,
  loadDocsLibrary,
  resetDocsLibraryCache,
} from './docsSources'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function fixtureBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    navigation: FIXTURE_DOCS_MANIFEST,
    documents: FIXTURE_DOCS_MARKDOWN,
    images: [],
    ...overrides,
  }
}

function stubFetch(...responses: Array<Response | Error | string>) {
  const fetchStub = vi.fn()
  for (const response of responses) {
    if (response instanceof Response) fetchStub.mockResolvedValueOnce(response)
    else fetchStub.mockRejectedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

describe('docsSources', () => {
  beforeEach(() => resetDocsLibraryCache())
  afterEach(() => vi.unstubAllGlobals())

  describe('loading the library from the docs service', () => {
    it('fetches /api/documentation/library and builds the library from it', async () => {
      const fetchStub = stubFetch(jsonResponse(fixtureBody()))

      const library = await loadDocsLibrary()

      expect(fetchStub).toHaveBeenCalledWith('/api/documentation/library')
      expect(library.pageByPath.get('operations')?.markdown).toContain('Read the logs.')
      expect(library.pageByFile.get('CONTRIBUTING.md')?.path).toBe('contributing')
    })

    it('builds the real repo docs, without docs/plans', async () => {
      stubFetch(jsonResponse(repoDocsLibraryResponse()))

      const library = await loadDocsLibrary()

      expect(library.pageByPath.get('index')?.markdown).toContain('Sentinel')
      expect(library.pages.length).toBeGreaterThan(5)
      for (const page of library.pages) expect(page.markdown.trim()).not.toBe('')
      expect(
        [...library.pageByFile.keys()].filter((file) => file.startsWith('docs/plans/')),
      ).toEqual([])
    })

    it('fetches once and shares the load between concurrent callers', async () => {
      const fetchStub = stubFetch(jsonResponse(fixtureBody()))

      const [first, second] = await Promise.all([loadDocsLibrary(), loadDocsLibrary()])

      expect(first).toBe(second)
      expect(fetchStub).toHaveBeenCalledTimes(1)
    })

    it('answers later calls from the loaded library without fetching again', async () => {
      const fetchStub = stubFetch(jsonResponse(fixtureBody()))
      const first = await loadDocsLibrary()

      await expect(loadDocsLibrary()).resolves.toBe(first)
      expect(getDocsLibrary()).toBe(first)
      expect(fetchStub).toHaveBeenCalledTimes(1)
    })

    it('forgets a failed load, so the next call retries', async () => {
      const fetchStub = stubFetch(new Error('offline'), jsonResponse(fixtureBody()))

      await expect(loadDocsLibrary()).rejects.toBeInstanceOf(DocsUnavailableError)
      const library = await loadDocsLibrary()

      expect(library.pages.length).toBeGreaterThan(0)
      expect(fetchStub).toHaveBeenCalledTimes(2)
    })

    it('fetches afresh once the cache is reset', async () => {
      const fetchStub = stubFetch(jsonResponse(fixtureBody()), jsonResponse(fixtureBody()))
      const first = await loadDocsLibrary()

      resetDocsLibraryCache()
      const second = await loadDocsLibrary()

      expect(second).not.toBe(first)
      expect(fetchStub).toHaveBeenCalledTimes(2)
    })
  })

  describe('when the docs service cannot be read', () => {
    it('reports an HTTP error status', async () => {
      stubFetch(jsonResponse({ detail: 'documentation is not available' }, 503))

      await expect(loadDocsLibrary()).rejects.toThrow(
        'the documentation could not be loaded: HTTP 503',
      )
    })

    it('reports a network failure', async () => {
      stubFetch(new TypeError('Failed to fetch'))

      const failure = loadDocsLibrary()

      await expect(failure).rejects.toBeInstanceOf(DocsUnavailableError)
      await expect(failure).rejects.toThrow('Failed to fetch')
    })

    it('reports a thrown value that is not an Error', async () => {
      stubFetch('gateway gone')

      await expect(loadDocsLibrary()).rejects.toThrow(
        'the documentation could not be loaded: gateway gone',
      )
    })

    it('reports a body that is not JSON', async () => {
      stubFetch(new Response('<html>', { status: 200 }))

      await expect(loadDocsLibrary()).rejects.toBeInstanceOf(DocsUnavailableError)
    })

    it('names its errors', async () => {
      stubFetch(new Error('offline'))

      await expect(loadDocsLibrary()).rejects.toMatchObject({ name: 'DocsUnavailableError' })
    })
  })

  describe('when the docs service answers with something that is not a library', () => {
    it.each([
      ['null', null],
      ['a string', 'library'],
      ['documents missing', { images: [] }],
      ['documents as null', fixtureBody({ documents: null })],
      ['documents as an array', fixtureBody({ documents: ['docs/index.md'] })],
      ['a document that is not text', fixtureBody({ documents: { 'docs/index.md': 42 } })],
      ['images missing', { navigation: FIXTURE_DOCS_MANIFEST, documents: FIXTURE_DOCS_MARKDOWN }],
      ['images that are not a list', fixtureBody({ images: 'docs/images/a.png' })],
      ['an image that is not a path', fixtureBody({ images: [7] })],
    ])('refuses %s', async (_label, body) => {
      stubFetch(jsonResponse(body))

      await expect(loadDocsLibrary()).rejects.toThrow(
        'the documentation could not be loaded: unexpected response',
      )
    })

    it('lets a menu naming a missing page fail loudly', async () => {
      stubFetch(jsonResponse(fixtureBody({ documents: { 'docs/index.md': '# Welcome\n' } })))

      await expect(loadDocsLibrary()).rejects.toBeInstanceOf(DocsNavigationError)
    })
  })

  describe('before the library has loaded', () => {
    it('getDocsLibrary throws', () => {
      expect(() => getDocsLibrary()).toThrow(DocsUnavailableError)
      expect(() => getDocsLibrary()).toThrow('not loaded yet')
    })

    it('getDocsImageUrls is empty', () => {
      expect(getDocsImageUrls()).toEqual({})
    })
  })

  describe('image URLs', () => {
    it('serves each image under docs/images/ from the docs service, segments encoded', async () => {
      stubFetch(
        jsonResponse(
          fixtureBody({
            images: ['docs/images/map.png', 'docs/images/sdr/radio panel#1.png', 'docs/other.png'],
          }),
        ),
      )

      await loadDocsLibrary()

      expect(getDocsImageUrls()).toEqual({
        'docs/images/map.png': '/api/documentation/images/map.png',
        'docs/images/sdr/radio panel#1.png': '/api/documentation/images/sdr/radio%20panel%231.png',
      })
    })

    it('are dropped again when the cache is reset', async () => {
      stubFetch(jsonResponse(fixtureBody({ images: ['docs/images/map.png'] })))
      await loadDocsLibrary()

      resetDocsLibraryCache()

      expect(getDocsImageUrls()).toEqual({})
    })
  })
})
