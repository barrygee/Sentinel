import { describe, it, expect } from 'vitest'
import { expandSynonyms, MINIMUM_QUERY_WORD_LENGTH } from './synonyms'

const SYNONYMS = {
  plane: ['Air', 'aircraft', 'ADS-B'],
  ship: ['Sea', 'vessel'],
  nothing: [] as string[],
}

describe('synonyms', () => {
  it('ignores one-letter query words', () => {
    expect(MINIMUM_QUERY_WORD_LENGTH).toBe(2)
  })

  it('returns the extra terms of a word that has synonyms', () => {
    expect(expandSynonyms('plane', SYNONYMS)).toEqual([
      { word: 'plane', alsoSearching: ['Air', 'aircraft', 'ADS-B'] },
    ])
  })

  it('looks words up in lower case and in the order typed', () => {
    expect(expandSynonyms('SHIP Plane', SYNONYMS).map((expansion) => expansion.word)).toEqual([
      'ship',
      'plane',
    ])
  })

  it('returns nothing for words without synonyms', () => {
    expect(expandSynonyms('radio', SYNONYMS)).toEqual([])
  })

  it('returns nothing for a word whose synonym list is empty', () => {
    expect(expandSynonyms('nothing', SYNONYMS)).toEqual([])
  })

  it('returns nothing for a blank query', () => {
    expect(expandSynonyms('', SYNONYMS)).toEqual([])
    expect(expandSynonyms('   ', SYNONYMS)).toEqual([])
  })

  it('skips words shorter than the minimum, even if they have synonyms', () => {
    expect(expandSynonyms('p', { p: ['x'] })).toEqual([])
  })

  it('does not match inherited object keys as synonyms of words', () => {
    expect(expandSynonyms('constructor', SYNONYMS)).toEqual([])
    expect(expandSynonyms('__proto__', SYNONYMS)).toEqual([])
  })
})
