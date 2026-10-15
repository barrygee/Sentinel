import { describe, it, expect } from 'vitest'
import { highlightSegments, snippetAround } from './highlight'

describe('highlightSegments', () => {
  it('returns the whole text as one plain run when there are no terms', () => {
    expect(highlightSegments('hello world', [])).toEqual([{ text: 'hello world', match: false }])
  })

  it('ignores blank terms', () => {
    expect(highlightSegments('hello', ['', '   '])).toEqual([{ text: 'hello', match: false }])
  })

  it('returns a single empty plain run for empty text', () => {
    expect(highlightSegments('', ['x'])).toEqual([{ text: '', match: false }])
  })

  it('splits text into plain and matching runs', () => {
    expect(highlightSegments('Record the audio', ['audio'])).toEqual([
      { text: 'Record the ', match: false },
      { text: 'audio', match: true },
    ])
  })

  it('matches case-insensitively and keeps the original case', () => {
    expect(highlightSegments('SDR and sdr', ['sdr'])).toEqual([
      { text: 'SDR', match: true },
      { text: ' and ', match: false },
      { text: 'sdr', match: true },
    ])
  })

  it('highlights only where a term starts a word', () => {
    // "adsb" must not light up inside "readsb".
    expect(highlightSegments('readsb and adsb', ['adsb'])).toEqual([
      { text: 'readsb and ', match: false },
      { text: 'adsb', match: true },
    ])
  })

  it('highlights a prefix of a longer word', () => {
    expect(highlightSegments('recording', ['rec'])).toEqual([
      { text: 'rec', match: true },
      { text: 'ording', match: false },
    ])
  })

  it('does not start a match after a hyphen or underscore', () => {
    expect(highlightSegments('ads-b rtl_tcp', ['b', 'tcp'])).toEqual([
      { text: 'ads-b rtl_tcp', match: false },
    ])
  })

  it('prefers the longest term where terms overlap', () => {
    expect(highlightSegments('aircraft', ['air', 'aircraft'])).toEqual([
      { text: 'aircraft', match: true },
    ])
  })

  it('treats regular-expression characters in a term literally', () => {
    expect(highlightSegments('use c++ (now) a.b', ['c++', '(now)', 'a.b'])).toEqual([
      { text: 'use ', match: false },
      { text: 'c++', match: true },
      { text: ' ', match: false },
      { text: '(now)', match: true },
      { text: ' ', match: false },
      { text: 'a.b', match: true },
    ])
    // A "." must not match any character.
    expect(highlightSegments('axb', ['a.b'])).toEqual([{ text: 'axb', match: false }])
  })

  it('collapses duplicate terms', () => {
    expect(highlightSegments('sdr', ['sdr', 'SDR', 'sdr'])).toEqual([{ text: 'sdr', match: true }])
  })

  it('returns adjacent matches as separate runs', () => {
    expect(highlightSegments('sdr sdr', ['sdr'])).toEqual([
      { text: 'sdr', match: true },
      { text: ' ', match: false },
      { text: 'sdr', match: true },
    ])
  })
})

describe('snippetAround', () => {
  const longText = `${'filler '.repeat(60)}needle ${'more '.repeat(60)}`

  it('returns short text whole, with no ellipsis', () => {
    expect(snippetAround('a short sentence about sdr', ['sdr'])).toBe('a short sentence about sdr')
  })

  it('starts at the beginning and ends with an ellipsis when the match is early in long text', () => {
    const snippet = snippetAround(`sdr ${'word '.repeat(100)}`, ['sdr'])
    expect(snippet.startsWith('sdr ')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet.length).toBeLessThan(200)
  })

  it('starts at the beginning when there is no match', () => {
    const snippet = snippetAround(`first ${'word '.repeat(100)}`, ['zzz'])
    expect(snippet.startsWith('first ')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('starts at the beginning when there are no terms', () => {
    expect(snippetAround('plain text', [])).toBe('plain text')
  })

  it('centres on the first match with an ellipsis at both ends', () => {
    const snippet = snippetAround(longText, ['needle'])
    expect(snippet).toContain('needle')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('cuts on word boundaries, never mid-word', () => {
    const snippet = snippetAround(longText, ['needle'])
    const words = snippet.replaceAll('…', '').trim().split(/\s+/)
    for (const word of words) expect(['filler', 'needle', 'more']).toContain(word)
  })

  it('ends without an ellipsis when the match is near the end of the text', () => {
    const text = `${'filler '.repeat(60)}needle done`
    const snippet = snippetAround(text, ['needle'])
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('needle done')).toBe(true)
  })

  it('does not centre on a mid-word occurrence of a term', () => {
    const text = `readsb ${'filler '.repeat(60)}adsb here`
    const snippet = snippetAround(text, ['adsb'])
    expect(snippet).toContain('adsb here')
  })

  it('honours the radius', () => {
    const snippet = snippetAround(longText, ['needle'], 20)
    expect(snippet.replaceAll('…', '').length).toBeLessThanOrEqual(40)
    expect(snippet).toContain('needle')
  })
})
