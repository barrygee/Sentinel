import type { DocsLibrary } from '../docsTypes'
import { createSearchRecord, searchRecords, type SearchRecord } from '../../search/textSearch'
import { extractSearchSections, type SearchSection } from './extractSearchSections'
import { snippetAround } from './highlight'
import { expandSynonyms, MINIMUM_QUERY_WORD_LENGTH, type SynonymExpansion } from './synonyms'

/** One search result: a section of a page and why it matched. */
export interface DocsSearchHit {
  section: SearchSection
  score: number
  /** The query words and synonym terms that matched, for highlighting. */
  matchedTerms: string[]
  /** An excerpt of the section around the first match. */
  snippet: string
}

/** What a search found and which synonyms widened it. */
export interface DocsSearchOutcome {
  hits: DocsSearchHit[]
  /** How many sections matched in all; more than `hits.length` when capped. */
  totalHits: number
  expansions: SynonymExpansion[]
}

/** Searches the docs. Synchronous: the matcher needs no loading. */
export interface DocsSearchEngine {
  search(query: string): DocsSearchOutcome
}

/** The most results shown for one query; past this the reader should refine. */
const MAXIMUM_HITS = 40

/**
 * Wires the docs sections into the shared text matcher. A section matches when
 * ANY query word is found. Sections that contain more of the words come first;
 * among those, a heading hit outranks a page-title hit, which outranks one in
 * the body, and whole-word hits outrank word-start hits, outranking mid-word ones.
 */
export function createDocsSearchEngine(library: DocsLibrary): DocsSearchEngine {
  // Built on first search (the caller creates the engine lazily) and kept for
  // the session; the bundled markdown is small enough to prepare in a few ms.
  const records: SearchRecord<SearchSection>[] = library.pages
    .flatMap((page) => extractSearchSections(page))
    .map((section) =>
      createSearchRecord(section, [
        { name: 'heading', text: section.heading, weight: 3 },
        { name: 'pageTitle', text: section.pageTitle, weight: 2 },
        { name: 'text', text: section.text, weight: 1 },
      ]),
    )

  return {
    search(query: string): DocsSearchOutcome {
      const expansions = expandSynonyms(query, library.synonyms)
      const matches = searchRecords(records, query, {
        synonyms: library.synonyms,
        minimumWordLength: MINIMUM_QUERY_WORD_LENGTH,
        requireEveryWord: false,
      })
      // More of the reader's words beats a stronger hit on fewer of them, so a
      // section with every word is never buried under single-word heading hits.
      // Array.sort is stable, so equal ranks stay in page order.
      matches.sort(
        (first, second) =>
          second.matchedWordCount - first.matchedWordCount || second.score - first.score,
      )
      const hits = matches.slice(0, MAXIMUM_HITS).map((match) => ({
        section: match.item,
        score: match.score,
        matchedTerms: match.matchedTerms,
        snippet: snippetAround(match.item.text, match.matchedTerms),
      }))
      return { hits, totalHits: matches.length, expansions }
    },
  }
}
