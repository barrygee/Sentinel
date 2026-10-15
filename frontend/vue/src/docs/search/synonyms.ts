import { splitQueryWords, synonymTermsOf } from '../../search/textSearch'

/**
 * A search word and the extra terms to search alongside it ("plane" also
 * searches "Air", "aircraft"...).
 */
export interface SynonymExpansion {
  word: string
  /** What to also search; the first entry is the friendly label shown to the reader. */
  alsoSearching: readonly string[]
}

/**
 * Docs ignore one-letter query words: as substrings they would match almost
 * every section.
 */
export const MINIMUM_QUERY_WORD_LENGTH = 2

/**
 * Finds the synonym entries that apply to a query's words.
 *
 * @param query What the reader typed.
 * @param synonyms The `synonyms` map from `docs/nav.json`.
 */
export function expandSynonyms(
  query: string,
  synonyms: Readonly<Record<string, readonly string[]>>,
): SynonymExpansion[] {
  const expansions: SynonymExpansion[] = []
  for (const word of splitQueryWords(query, { minimumWordLength: MINIMUM_QUERY_WORD_LENGTH })) {
    const alsoSearching = synonymTermsOf(synonyms, word)
    if (alsoSearching.length > 0) expansions.push({ word, alsoSearching })
  }
  return expansions
}
