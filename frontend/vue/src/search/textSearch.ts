/**
 * One matcher for every in-app search (Settings and the docs).
 *
 * A record is a list of named, weighted text fields. A query word is found when
 * it appears (case-insensitive substring) in at least one of its fields. By
 * default a record matches only when EVERY word is found (Settings); with
 * `requireEveryWord: false` ANY word is enough (the docs). A word may instead be satisfied by one of its synonyms (as a
 * whole word only: a synonym is a different word, not a prefix to complete). The
 * matcher can also score the matches, so a caller that wants relevance order
 * (the docs) can have it while a caller that wants source order (Settings)
 * simply ignores the score.
 */

/** One searchable piece of text on a record. */
export interface SearchField {
  /** What the text is, e.g. `heading`; only informative. */
  name: string
  text: string
  /** How much a hit here is worth when ranking; higher ranks first. */
  weight: number
}

/** An item prepared for searching: its fields, lower-cased once up front. */
export interface SearchRecord<Item> {
  item: Item
  fields: ReadonlyArray<SearchField & { lowerCaseText: string }>
}

/** A word typed -> the other terms that also satisfy it. */
export type SearchSynonyms = Readonly<Record<string, readonly string[]>>

/** A record that matched the query. */
export interface SearchMatch<Item> {
  item: Item
  /** Relevance, higher first; always 0 when scoring is off. */
  score: number
  /** The query words and synonym terms that were found, for highlighting. */
  matchedTerms: string[]
  /** How many of the query's words were found; equals the word count when every word must match. */
  matchedWordCount: number
}

/** Options for {@link searchRecords} and {@link splitQueryWords}. */
export interface SearchOptions {
  /** Extra terms that satisfy a query word (keys are lower-case). */
  synonyms?: SearchSynonyms
  /** Whether to compute scores. Off keeps the matcher to a plain filter. */
  rank?: boolean
  /** Query words shorter than this are ignored (1-letter prefixes match nearly everything). */
  minimumWordLength?: number
  /** Whether a record must contain every query word (default) or any one of them. */
  requireEveryWord?: boolean
}

/** How much more a whole-word hit is worth than a word-start hit, and that than a mid-word hit. */
const WHOLE_WORD_SCORE = 4
const WORD_START_SCORE = 2
const MID_WORD_SCORE = 1
/** A synonym is a little less precise than the word the reader typed, and only matches whole words. */
const SYNONYM_FACTOR = 0.9

/** Characters that belong inside a word: "ADS-B" and "rtl_tcp" are one word each. */
const WORD_CHARACTER = /[\p{L}\p{N}_-]/u

/**
 * The synonym terms of a query word, or an empty list. Only the map's own
 * entries count: a typed "constructor" must not find `Object.prototype`'s.
 */
export function synonymTermsOf(synonyms: SearchSynonyms, word: string): readonly string[] {
  return Object.hasOwn(synonyms, word) ? (synonyms[word] as readonly string[]) : []
}

/**
 * Trims, lower-cases, collapses whitespace and splits a query into words.
 *
 * @param query What the reader typed.
 * @param options `minimumWordLength` drops shorter words.
 * @returns The words; empty when the query is blank.
 */
export function splitQueryWords(
  query: string,
  options: Pick<SearchOptions, 'minimumWordLength'> = {},
): string[] {
  const minimumWordLength = options.minimumWordLength ?? 1
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '' && word.length >= minimumWordLength)
}

/**
 * Prepares an item for searching. Do this once per item, not per keystroke:
 * the text is lower-cased here so a search is only substring checks.
 *
 * @param item What a match returns.
 * @param fields The item's searchable text; empty text is fine and never matches.
 */
export function createSearchRecord<Item>(
  item: Item,
  fields: ReadonlyArray<SearchField>,
): SearchRecord<Item> {
  return {
    item,
    fields: fields.map((field) => ({ ...field, lowerCaseText: field.text.toLowerCase() })),
  }
}

/**
 * The best score of `term` inside `lowerCaseText`: whole word, word start or
 * mid-word. Zero means the term does not appear (as a whole word, when
 * `wholeWordOnly`). Without `rank`, the first hit ends the scan.
 */
function scoreTermInText(
  lowerCaseText: string,
  term: string,
  rank: boolean,
  wholeWordOnly: boolean,
): number {
  let searchFrom = 0
  let bestScore = 0
  for (;;) {
    const foundAt = lowerCaseText.indexOf(term, searchFrom)
    if (foundAt === -1) return bestScore
    if (!rank && !wholeWordOnly) return MID_WORD_SCORE
    /* v8 ignore start -- foundAt - 1 is in range when foundAt > 0; the fallback only satisfies noUncheckedIndexedAccess */
    const before = foundAt === 0 ? '' : (lowerCaseText[foundAt - 1] ?? '')
    /* v8 ignore stop */
    const after = lowerCaseText[foundAt + term.length] ?? ''
    const startsWord = before === '' || !WORD_CHARACTER.test(before)
    const endsWord = after === '' || !WORD_CHARACTER.test(after)
    const score =
      startsWord && endsWord ? WHOLE_WORD_SCORE : startsWord ? WORD_START_SCORE : MID_WORD_SCORE
    if (score === WHOLE_WORD_SCORE || (!rank && !wholeWordOnly)) return score
    if (!wholeWordOnly) bestScore = Math.max(bestScore, score)
    searchFrom = foundAt + 1
  }
}

/**
 * Searches prepared records.
 *
 * A query word is found when it (or a synonym) appears in at least one field of
 * a record; the record matches when every word is found, or any word with
 * `requireEveryWord: false`. A word's score is, per field, the best hit among its
 * terms, times the field's weight, summed over the fields it appears in.
 *
 * @param records Records from {@link createSearchRecord}, in source order.
 * @param query What the reader typed.
 * @param options Synonyms, scoring and the shortest word worth searching.
 * @returns Matches in source order; sort by `score` for relevance. Empty for a blank query.
 */
export function searchRecords<Item>(
  records: ReadonlyArray<SearchRecord<Item>>,
  query: string,
  options: SearchOptions = {},
): SearchMatch<Item>[] {
  const words = splitQueryWords(query, options)
  if (words.length === 0) return []
  const rank = options.rank ?? true
  const requireEveryWord = options.requireEveryWord ?? true
  const synonyms = options.synonyms ?? {}
  const termsPerWord = words.map((word) => [
    { term: word, factor: 1, wholeWordOnly: false },
    ...synonymTermsOf(synonyms, word).map((synonym) => ({
      term: synonym.toLowerCase(),
      factor: SYNONYM_FACTOR,
      // "pass" must not find "password", nor "air" "repair".
      wholeWordOnly: true,
    })),
  ])

  const matches: SearchMatch<Item>[] = []
  for (const record of records) {
    let score = 0
    const matchedTerms = new Set<string>()
    let matchedWordCount = 0
    for (const candidates of termsPerWord) {
      let wordScore = 0
      let wordFound = false
      for (const field of record.fields) {
        let bestInField = 0
        for (const { term, factor, wholeWordOnly } of candidates) {
          const termScore = scoreTermInText(field.lowerCaseText, term, rank, wholeWordOnly)
          if (termScore === 0) continue
          matchedTerms.add(term)
          bestInField = Math.max(bestInField, termScore * factor)
        }
        if (bestInField > 0) {
          wordFound = true
          wordScore += bestInField * field.weight
        }
      }
      if (!wordFound) {
        // One missing word rules the record out, so stop looking at the rest.
        if (requireEveryWord) break
        continue
      }
      matchedWordCount += 1
      score += wordScore
    }
    const matched = requireEveryWord
      ? matchedWordCount === termsPerWord.length
      : matchedWordCount > 0
    if (matched) {
      matches.push({
        item: record.item,
        score: rank ? score : 0,
        matchedTerms: [...matchedTerms],
        matchedWordCount,
      })
    }
  }
  return matches
}
