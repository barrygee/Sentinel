import { describe, it, expect } from 'vitest'
import { createSearchRecord, searchRecords, splitQueryWords, type SearchField } from './textSearch'

/** One record with a single weight-1 field, the simplest thing worth searching. */
function recordWithText(item: string, text: string) {
  return createSearchRecord(item, [{ name: 'text', text, weight: 1 }])
}

describe('splitQueryWords', () => {
  it('trims, lower-cases and splits on whitespace', () => {
    expect(splitQueryWords('  Record   AUDIO\tNow ')).toEqual(['record', 'audio', 'now'])
  })

  it('returns no words for an empty or blank query', () => {
    expect(splitQueryWords('')).toEqual([])
    expect(splitQueryWords('   \t ')).toEqual([])
  })

  it('keeps one-letter words by default', () => {
    expect(splitQueryWords('a b')).toEqual(['a', 'b'])
  })

  it('drops words shorter than minimumWordLength and keeps words exactly that long', () => {
    expect(splitQueryWords('a bc def', { minimumWordLength: 2 })).toEqual(['bc', 'def'])
    expect(splitQueryWords('a bc def', { minimumWordLength: 3 })).toEqual(['def'])
  })

  it('returns nothing when every word is too short', () => {
    expect(splitQueryWords('a b', { minimumWordLength: 2 })).toEqual([])
  })
})

describe('createSearchRecord', () => {
  it('keeps the item and each field and adds a lower-cased copy of its text', () => {
    const fields: SearchField[] = [{ name: 'heading', text: 'Record AUDIO', weight: 3 }]
    const item = { id: 1 }
    const record = createSearchRecord(item, fields)
    expect(record.item).toBe(item)
    expect(record.fields).toEqual([
      { name: 'heading', text: 'Record AUDIO', weight: 3, lowerCaseText: 'record audio' },
    ])
  })

  it('does not change the field it was given', () => {
    const fields: SearchField[] = [{ name: 'heading', text: 'ABC', weight: 1 }]
    createSearchRecord('x', fields)
    expect(fields[0]).toEqual({ name: 'heading', text: 'ABC', weight: 1 })
  })

  it('accepts empty text, which never matches', () => {
    const records = [createSearchRecord('empty', [{ name: 'text', text: '', weight: 1 }])]
    expect(searchRecords(records, 'anything')).toEqual([])
  })
})

describe('searchRecords: what matches', () => {
  const records = [
    recordWithText('radios', 'Connect a radio and record audio'),
    recordWithText('maps', 'Offline maps and tiles'),
    recordWithText('audio-only', 'Audio levels'),
  ]

  it('returns nothing for an empty or blank query', () => {
    expect(searchRecords(records, '')).toEqual([])
    expect(searchRecords(records, '    ')).toEqual([])
  })

  it('returns nothing when every query word is below minimumWordLength', () => {
    expect(searchRecords(records, 'a', { minimumWordLength: 2 })).toEqual([])
  })

  it('matches case-insensitively', () => {
    const items = searchRecords(records, 'OFFLINE').map((match) => match.item)
    expect(items).toEqual(['maps'])
  })

  it('finds a typed word as a substring, including inside a word', () => {
    expect(searchRecords(records, 'ecor').map((match) => match.item)).toEqual(['radios'])
  })

  it('returns matches in source order', () => {
    const items = searchRecords(records, 'audio').map((match) => match.item)
    expect(items).toEqual(['radios', 'audio-only'])
  })

  it('requires every word by default, in any order and not as a phrase', () => {
    expect(searchRecords(records, 'audio record').map((match) => match.item)).toEqual(['radios'])
    // Not adjacent in the text, and in a different order from the text.
    expect(searchRecords(records, 'record connect').map((match) => match.item)).toEqual(['radios'])
  })

  it('excludes a record that is missing one of the words', () => {
    expect(searchRecords(records, 'audio offline')).toEqual([])
  })

  it('accepts a record with any one word when requireEveryWord is false', () => {
    const items = searchRecords(records, 'offline audio', { requireEveryWord: false }).map(
      (match) => match.item,
    )
    expect(items).toEqual(['radios', 'maps', 'audio-only'])
  })

  it('still rejects a record with none of the words when requireEveryWord is false', () => {
    expect(searchRecords(records, 'zzz qqq', { requireEveryWord: false })).toEqual([])
  })

  it('reports how many words were found', () => {
    const matches = searchRecords(records, 'record audio nonexistent', { requireEveryWord: false })
    const byItem = Object.fromEntries(matches.map((match) => [match.item, match.matchedWordCount]))
    expect(byItem).toEqual({ radios: 2, 'audio-only': 1 })
  })

  it('reports a count equal to the word count when every word must match', () => {
    const [match] = searchRecords(records, 'record audio')
    expect(match?.matchedWordCount).toBe(2)
  })

  it('finds a word in any one of the record fields', () => {
    const fieldRecords = [
      createSearchRecord('item', [
        { name: 'heading', text: 'Alpha', weight: 1 },
        { name: 'text', text: 'beta gamma', weight: 1 },
      ]),
    ]
    expect(searchRecords(fieldRecords, 'alpha gamma')).toHaveLength(1)
    expect(searchRecords(fieldRecords, 'alpha delta')).toHaveLength(0)
  })

  it('lists the typed words that were found as matched terms', () => {
    const [match] = searchRecords(records, 'record audio')
    expect(match?.matchedTerms.sort()).toEqual(['audio', 'record'])
  })

  it('leaves a typed word that was not found out of the matched terms', () => {
    const matches = searchRecords(records, 'offline audio', { requireEveryWord: false })
    const maps = matches.find((match) => match.item === 'maps')
    expect(maps?.matchedTerms).toEqual(['offline'])
  })
})

describe('searchRecords: synonyms', () => {
  const synonyms = { plane: ['Air', 'aircraft'] }

  it('matches a record through a synonym of the typed word', () => {
    const records = [recordWithText('adsb', 'Air traffic'), recordWithText('sea', 'Ship traffic')]
    const items = searchRecords(records, 'plane', { synonyms }).map((match) => match.item)
    expect(items).toEqual(['adsb'])
  })

  it('looks the typed word up in lower case', () => {
    const records = [recordWithText('adsb', 'Air traffic')]
    expect(searchRecords(records, 'PLANE', { synonyms })).toHaveLength(1)
  })

  it('does not apply a synonym to a different word', () => {
    const records = [recordWithText('adsb', 'Air traffic')]
    expect(searchRecords(records, 'boat', { synonyms })).toEqual([])
  })

  it('finds a synonym only as a whole word, never inside a longer word', () => {
    const synonymsForSign = { sign: ['pass'] }
    const records = [
      recordWithText('whole', 'Satellite pass times'),
      recordWithText('inside', 'Reset your password'),
      recordWithText('prefix', 'The passenger list'),
      recordWithText('suffix', 'Underpass maps'),
    ]
    const items = searchRecords(records, 'sign', { synonyms: synonymsForSign }).map(
      (match) => match.item,
    )
    expect(items).toEqual(['whole'])
  })

  it('treats a hyphen or underscore as part of the word, so a synonym is not found inside it', () => {
    const records = [
      recordWithText('hyphen', 'The air-band radio'),
      recordWithText('underscore', 'the air_band setting'),
      recordWithText('comma', 'Air, land and sea'),
    ]
    const items = searchRecords(records, 'plane', { synonyms: { plane: ['air'] } }).map(
      (match) => match.item,
    )
    expect(items).toEqual(['comma'])
  })

  it('finds a whole-word synonym after an earlier non-whole occurrence', () => {
    // "repair" contains "air" but is skipped; the later whole "air" counts.
    const records = [
      recordWithText('later', 'repair the air'),
      recordWithText('only-inside', 'repair'),
    ]
    for (const rank of [true, false]) {
      const items = searchRecords(records, 'plane', { synonyms: { plane: ['air'] }, rank }).map(
        (match) => match.item,
      )
      expect(items).toEqual(['later'])
    }
  })

  // Query words are lower-cased, so only all-lower-case Object.prototype members can collide.
  it.each(['constructor', '__proto__'])(
    'does not mistake the inherited object member "%s" for a synonym entry',
    (word) => {
      const records = [recordWithText('item', `the ${word} setting`)]
      // The typed word itself still matches; the point is that it neither throws nor
      // gains phantom synonym terms.
      const matches = searchRecords(records, word, { synonyms })
      expect(matches.map((match) => match.item)).toEqual(['item'])
      expect(searchRecords([recordWithText('other', 'unrelated')], word, { synonyms })).toEqual([])
    },
  )

  it('still lets a typed word match inside a longer word, unlike a synonym', () => {
    const records = [recordWithText('password', 'Reset your password')]
    expect(searchRecords(records, 'pass')).toHaveLength(1)
  })

  it('lists the synonym term that matched, lower-cased', () => {
    const records = [recordWithText('adsb', 'Air traffic')]
    const [match] = searchRecords(records, 'plane', { synonyms })
    expect(match?.matchedTerms).toEqual(['air'])
  })

  it('lists both the typed word and the synonym when both appear', () => {
    const records = [recordWithText('both', 'A plane in the air')]
    const [match] = searchRecords(records, 'plane', { synonyms })
    expect(match?.matchedTerms.sort()).toEqual(['air', 'plane'])
  })

  it('counts a word as found once even when several of its terms appear', () => {
    const records = [recordWithText('both', 'A plane in the air')]
    const [match] = searchRecords(records, 'plane', { synonyms })
    expect(match?.matchedWordCount).toBe(1)
  })
})

describe('searchRecords: scoring', () => {
  function scoreOf(text: string, query: string, weight = 1): number {
    const records = [createSearchRecord('item', [{ name: 'text', text, weight }])]
    return searchRecords(records, query)[0]?.score ?? Number.NaN
  }

  it('scores a whole-word hit above a word-start hit above a mid-word hit', () => {
    const whole = scoreOf('use the sdr here', 'sdr')
    const start = scoreOf('use the sdrs here', 'sdr')
    const middle = scoreOf('use the xsdr here', 'sdr')
    expect(whole).toBe(4)
    expect(start).toBe(2)
    expect(middle).toBe(1)
  })

  it('scores a hit at the very start and very end of the text as a whole word', () => {
    expect(scoreOf('sdr', 'sdr')).toBe(4)
  })

  it('counts punctuation and spaces as word boundaries', () => {
    expect(scoreOf('(sdr), then', 'sdr')).toBe(4)
  })

  it('does not treat a hyphen or underscore as a boundary', () => {
    expect(scoreOf('ads-b feed', 'ads')).toBe(2)
    expect(scoreOf('the rtl_tcp port', 'tcp')).toBe(1)
    expect(scoreOf('the rtl_tcp port', 'rtl_tcp')).toBe(4)
  })

  it('treats letters outside ASCII as word characters', () => {
    expect(scoreOf('un café ouvert', 'caf')).toBe(2)
    expect(scoreOf('un café ouvert', 'café')).toBe(4)
  })

  it('takes the best occurrence, not the first', () => {
    expect(scoreOf('xsdr sdr', 'sdr')).toBe(4)
    expect(scoreOf('xsdr sdrs', 'sdr')).toBe(2)
    expect(scoreOf('xsdr xsdr', 'sdr')).toBe(1)
  })

  it('multiplies by the field weight', () => {
    expect(scoreOf('sdr', 'sdr', 3)).toBe(12)
  })

  it('adds the weighted score of every field the word appears in', () => {
    const records = [
      createSearchRecord('item', [
        { name: 'heading', text: 'sdr', weight: 3 },
        { name: 'text', text: 'the sdr', weight: 1 },
        { name: 'other', text: 'nothing here', weight: 10 },
      ]),
    ]
    expect(searchRecords(records, 'sdr')[0]?.score).toBe(4 * 3 + 4 * 1)
  })

  it('adds up the words', () => {
    expect(scoreOf('record audio', 'record audio')).toBe(8)
  })

  it('only adds the words that were found when any word is enough', () => {
    const records = [recordWithText('item', 'record only')]
    const [match] = searchRecords(records, 'record missing', { requireEveryWord: false })
    expect(match?.score).toBe(4)
  })

  it('scores a synonym hit at 90% of the equivalent typed hit', () => {
    const records = [recordWithText('adsb', 'Air traffic')]
    const [match] = searchRecords(records, 'plane', { synonyms: { plane: ['air'] } })
    expect(match?.score).toBeCloseTo(4 * 0.9, 10)
  })

  it('uses the better of the typed word and its synonym inside one field, not their sum', () => {
    const records = [recordWithText('both', 'plane air')]
    const [match] = searchRecords(records, 'plane', { synonyms: { plane: ['air'] } })
    expect(match?.score).toBe(4)
  })

  it('ranks a heading hit above a body hit when sorted by score', () => {
    const records = [
      createSearchRecord('body', [
        { name: 'heading', text: 'Other', weight: 3 },
        { name: 'text', text: 'about sdr', weight: 1 },
      ]),
      createSearchRecord('heading', [
        { name: 'heading', text: 'SDR', weight: 3 },
        { name: 'text', text: 'other', weight: 1 },
      ]),
    ]
    const sorted = searchRecords(records, 'sdr').sort((first, second) => second.score - first.score)
    expect(sorted.map((match) => match.item)).toEqual(['heading', 'body'])
  })

  it('gives every match a score of 0 when rank is false but still matches', () => {
    const records = [recordWithText('item', 'the sdr'), recordWithText('other', 'sdrs')]
    const matches = searchRecords(records, 'sdr', { rank: false })
    expect(matches.map((match) => match.item)).toEqual(['item', 'other'])
    expect(matches.map((match) => match.score)).toEqual([0, 0])
  })

  it('reports a score above 0 by default', () => {
    expect(scoreOf('the sdr', 'sdr')).toBeGreaterThan(0)
  })
})
