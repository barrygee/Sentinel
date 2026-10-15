import { describe, it, expect } from 'vitest'
import { buildDocsLibrary } from '../docsNavigation'
import { createDocsSearchEngine } from './docsSearchEngine'

function libraryOf(
  pages: Array<{ path: string; title: string; markdown: string }>,
  synonyms: Record<string, string[]> = {},
) {
  const markdownByFile = Object.fromEntries(
    pages.map((page) => [`docs/${page.path}.md`, page.markdown]),
  )
  return buildDocsLibrary(
    {
      groups: [
        {
          key: 'use-sentinel',
          title: 'Use Sentinel',
          pages: pages.map((page) => ({ path: page.path, title: page.title })),
        },
      ],
      synonyms,
    },
    markdownByFile,
  )
}

const BASIC = libraryOf([
  {
    path: 'alpha',
    title: 'Alpha page',
    markdown:
      '# Alpha page\n\n## Tuning\n\nTune the radio to a frequency.\n\n## Recording\n\nSave audio to disk.\n',
  },
  {
    path: 'beta',
    title: 'Beta page',
    markdown:
      '# Beta page\n\n## Maps\n\nDownload map tiles for offline use.\n\n## Radio and audio\n\nPlay audio from a radio.\n',
  },
])

describe('createDocsSearchEngine', () => {
  it('finds nothing for a blank query', () => {
    const outcome = createDocsSearchEngine(BASIC).search('   ')
    expect(outcome).toEqual({ hits: [], totalHits: 0, expansions: [] })
  })

  it('finds nothing when no word appears', () => {
    expect(createDocsSearchEngine(BASIC).search('zzzz').hits).toEqual([])
  })

  it('ignores one-letter words', () => {
    expect(createDocsSearchEngine(BASIC).search('a').totalHits).toBe(0)
  })

  it('matches a section that has any one of the words', () => {
    const { hits } = createDocsSearchEngine(BASIC).search('tuning offline')
    expect(hits.map((hit) => hit.section.id).sort()).toEqual(['alpha#tuning', 'beta#maps'])
  })

  it('puts sections that contain more of the words first, even against a stronger single-word hit', () => {
    const library = libraryOf([
      {
        path: 'one',
        title: 'One',
        // Heading hit on a single word: a high score for one word.
        markdown: '# One\n\n## Radio\n\nUnrelated text.\n',
      },
      {
        path: 'two',
        title: 'Two',
        // Both words, but only in the body.
        markdown: '# Two\n\n## Other\n\nA radio plays audio.\n',
      },
    ])
    const { hits } = createDocsSearchEngine(library).search('radio audio')
    expect(hits.map((hit) => hit.section.id)).toEqual(['two#other', 'one#radio'])
  })

  it('orders sections with the same number of words by score, heading above body', () => {
    const library = libraryOf([
      { path: 'body', title: 'Body', markdown: '# Body\n\n## Notes\n\nAbout sdr here.\n' },
      { path: 'head', title: 'Head', markdown: '# Head\n\n## SDR\n\nOther text.\n' },
    ])
    const { hits } = createDocsSearchEngine(library).search('sdr')
    expect(hits.map((hit) => hit.section.id)).toEqual(['head#sdr', 'body#notes'])
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? Infinity)
  })

  it('ranks a whole-word hit above a word-start hit in the same place', () => {
    const library = libraryOf([
      { path: 'start', title: 'Start', markdown: '# Start\n\nThe recordings folder.\n' },
      { path: 'whole', title: 'Whole', markdown: '# Whole\n\nThe record button.\n' },
    ])
    const { hits } = createDocsSearchEngine(library).search('record')
    expect(hits.map((hit) => hit.section.pagePath)).toEqual(['whole', 'start'])
  })

  it('keeps page order for hits that tie on words and score', () => {
    const library = libraryOf([
      { path: 'first', title: 'First', markdown: '# First\n\nThe sdr works.\n' },
      { path: 'second', title: 'Second', markdown: '# Second\n\nThe sdr works.\n' },
      { path: 'third', title: 'Third', markdown: '# Third\n\nThe sdr works.\n' },
    ])
    const { hits } = createDocsSearchEngine(library).search('sdr')
    expect(hits.map((hit) => hit.section.pagePath)).toEqual(['first', 'second', 'third'])
  })

  it('matches words in any order and not as a phrase', () => {
    const { hits } = createDocsSearchEngine(BASIC).search('radio frequency tune')
    expect(hits[0]?.section.id).toBe('alpha#tuning')
  })

  it('weights the page title above body text', () => {
    const library = libraryOf([
      { path: 'body', title: 'Plain', markdown: '# Plain\n\nLearn about satellites.\n' },
      { path: 'title', title: 'Satellites', markdown: '# Satellites\n\nSome text.\n' },
    ])
    const { hits } = createDocsSearchEngine(library).search('satellites')
    expect(hits[0]?.section.pagePath).toBe('title')
  })

  it('returns an excerpt that shows the match, and the terms that matched', () => {
    const filler = 'filler '.repeat(80)
    const library = libraryOf([
      { path: 'long', title: 'Long', markdown: `# Long\n\n${filler}needle ${filler}\n` },
    ])
    const [hit] = createDocsSearchEngine(library).search('needle').hits
    expect(hit?.snippet).toContain('needle')
    expect(hit?.snippet.startsWith('…')).toBe(true)
    expect(hit?.matchedTerms).toEqual(['needle'])
  })

  it('caps the hits at 40 but reports the true total', () => {
    const pages = Array.from({ length: 55 }, (_, index) => ({
      path: `page-${index}`,
      title: `Page ${index}`,
      markdown: `# Page ${index}\n\nThe common word.\n`,
    }))
    const outcome = createDocsSearchEngine(libraryOf(pages)).search('common')
    expect(outcome.hits).toHaveLength(40)
    expect(outcome.totalHits).toBe(55)
  })

  it('does not cap when there are exactly 40 matches', () => {
    const pages = Array.from({ length: 40 }, (_, index) => ({
      path: `page-${index}`,
      title: `Page ${index}`,
      markdown: `# Page ${index}\n\nThe common word.\n`,
    }))
    const outcome = createDocsSearchEngine(libraryOf(pages)).search('common')
    expect(outcome.hits).toHaveLength(40)
    expect(outcome.totalHits).toBe(40)
  })

  it('keeps the best 40, not the first 40', () => {
    const pages = [
      ...Array.from({ length: 45 }, (_, index) => ({
        path: `weak-${index}`,
        title: `Weak ${index}`,
        markdown: `# Weak ${index}\n\nmention of common here.\n`,
      })),
      { path: 'strong', title: 'Strong', markdown: '# Strong\n\n## Common\n\ntext\n' },
    ]
    const { hits } = createDocsSearchEngine(libraryOf(pages)).search('common')
    expect(hits[0]?.section.pagePath).toBe('strong')
  })

  it('finds a section through a synonym of a typed word and reports the expansion', () => {
    const library = libraryOf(
      [
        { path: 'air', title: 'Air', markdown: '# Air\n\nTracking air traffic.\n' },
        { path: 'sea', title: 'Sea', markdown: '# Sea\n\nTracking ships.\n' },
      ],
      { plane: ['Air', 'aircraft'] },
    )
    const outcome = createDocsSearchEngine(library).search('plane')
    expect(outcome.hits.map((hit) => hit.section.pagePath)).toEqual(['air'])
    expect(outcome.expansions).toEqual([{ word: 'plane', alsoSearching: ['Air', 'aircraft'] }])
  })

  it('does not find a synonym inside a longer word', () => {
    const library = libraryOf(
      [{ path: 'fix', title: 'Fix', markdown: '# Fix\n\nHow to repair the thing.\n' }],
      { plane: ['air'] },
    )
    expect(createDocsSearchEngine(library).search('plane').hits).toEqual([])
  })

  it('reports no expansions when the words have no synonyms', () => {
    expect(createDocsSearchEngine(BASIC).search('radio').expansions).toEqual([])
  })

  it('does not throw when the query is an Object.prototype member name', () => {
    const outcome = createDocsSearchEngine(BASIC).search('constructor')
    expect(outcome).toEqual({ hits: [], totalHits: 0, expansions: [] })
  })

  it('builds from an empty library', () => {
    const empty = buildDocsLibrary({ groups: [] }, {})
    expect(createDocsSearchEngine(empty).search('anything').totalHits).toBe(0)
  })

  it('can be searched repeatedly with different queries', () => {
    const engine = createDocsSearchEngine(BASIC)
    expect(engine.search('tuning').totalHits).toBe(1)
    expect(engine.search('maps').totalHits).toBe(1)
    expect(engine.search('tuning').totalHits).toBe(1)
  })
})
