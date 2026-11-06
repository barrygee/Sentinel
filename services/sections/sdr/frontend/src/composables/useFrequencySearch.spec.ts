import { describe, it, expect } from 'vitest'
import { useFrequencySearch } from './useFrequencySearch'
import type { SdrFrequencyGroup, SdrStoredFrequency } from '../stores/sdr'

const AIRBAND = { id: 1, name: 'Airband' } as SdrFrequencyGroup

const TOWER = {
  id: 1,
  group_id: null,
  label: 'Tower',
  frequency_hz: 118_380_000,
  mode: 'AM',
  notes: 'ground control',
} as SdrStoredFrequency

const CALLING = {
  id: 2,
  group_id: null,
  label: 'Calling',
  frequency_hz: 145_500_000,
  mode: 'NFM',
} as SdrStoredFrequency

const ALL = [TOWER, CALLING]

function searchFor(query: string): SdrStoredFrequency[] {
  const search = useFrequencySearch((freq) => (freq.id === TOWER.id ? [AIRBAND] : []))
  search.query.value = query
  return search.searchFrequencies(ALL)
}

describe('useFrequencySearch', () => {
  it('starts empty and returns the list as it was given', () => {
    const search = useFrequencySearch(() => [])
    expect(search.query.value).toBe('')
    expect(search.searchFrequencies(ALL)).toBe(ALL)
  })

  it('treats a query of only spaces as no search', () => {
    expect(searchFor('   ')).toEqual(ALL)
  })

  it.each([
    ['label', 'tower'],
    ['part of a label', 'owe'],
    ['MHz as the row shows it', '118.3800'],
    ['a shortened MHz figure', '118.38'],
    ['mode', 'am'],
    ['group name', 'airband'],
    ['notes', 'ground'],
  ])('finds a frequency by its %s', (_field, query) => {
    expect(searchFor(query)).toContain(TOWER)
    expect(searchFor(query)).not.toContain(CALLING)
  })

  it('ignores case in the query', () => {
    expect(searchFor('TOWER')).toEqual([TOWER])
  })

  it('needs every word to match, in any field and any order', () => {
    expect(searchFor('am airband')).toEqual([TOWER])
    expect(searchFor('airband nfm')).toEqual([])
  })

  it('copes with a frequency that has no notes', () => {
    expect(searchFor('calling')).toEqual([CALLING])
  })

  it('does not search the raw Hz value the row never shows', () => {
    expect(searchFor('118380000')).toEqual([])
  })

  it('returns nothing when no frequency matches', () => {
    expect(searchFor('zzz')).toEqual([])
  })
})
