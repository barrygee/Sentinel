import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { buildDocsLibrary } from '../docsNavigation'
import * as engineModule from '../search/docsSearchEngine'
import { useDocsSearch } from './useDocsSearch'

const library = buildDocsLibrary(
  {
    groups: [{ key: 'sdr', title: 'Use', pages: [{ path: 'a', title: 'Alpha' }] }],
  },
  { 'docs/a.md': '# Alpha\n\nTune the radio.\n\n## Maps\n\nOffline tiles.\n' },
)

describe('useDocsSearch', () => {
  let createEngine: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createEngine = vi.spyOn(engineModule, 'createDocsSearchEngine')
  })

  it('has no outcome for an empty or blank query, and does not build the engine', () => {
    const query = ref('')
    const { outcome } = useDocsSearch(library, query)
    expect(outcome.value).toBeNull()
    query.value = '    '
    expect(outcome.value).toBeNull()
    expect(createEngine).not.toHaveBeenCalled()
  })

  it('searches the library for a query', () => {
    const { outcome } = useDocsSearch(library, ref('tiles'))
    expect(outcome.value?.hits.map((hit) => hit.section.id)).toEqual(['a#maps'])
  })

  it('returns an outcome with no hits (not null) when nothing matches', () => {
    const { outcome } = useDocsSearch(library, ref('zzzz'))
    expect(outcome.value).toEqual({ hits: [], totalHits: 0, expansions: [] })
  })

  it('trims the query before searching', () => {
    const { outcome } = useDocsSearch(library, ref('   tiles   '))
    expect(outcome.value?.totalHits).toBe(1)
  })

  it('updates when the query changes', () => {
    const query = ref('tiles')
    const { outcome } = useDocsSearch(library, query)
    expect(outcome.value?.hits[0]?.section.id).toBe('a#maps')
    query.value = 'radio'
    expect(outcome.value?.hits[0]?.section.id).toBe('a')
  })

  it('builds the engine once, on the first real query, and reuses it', () => {
    const query = ref('')
    const { outcome } = useDocsSearch(library, query)
    expect(outcome.value).toBeNull()
    expect(createEngine).not.toHaveBeenCalled()
    query.value = 'tiles'
    expect(outcome.value).not.toBeNull()
    query.value = 'radio'
    expect(outcome.value).not.toBeNull()
    expect(createEngine).toHaveBeenCalledTimes(1)
    expect(createEngine).toHaveBeenCalledWith(library)
  })

  it('goes back to no outcome when the query is cleared', () => {
    const query = ref('tiles')
    const { outcome } = useDocsSearch(library, query)
    expect(outcome.value).not.toBeNull()
    query.value = ''
    expect(outcome.value).toBeNull()
  })
})
