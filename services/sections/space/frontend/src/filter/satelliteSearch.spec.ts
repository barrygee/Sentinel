import { describe, it, expect } from 'vitest'
import {
  CATEGORY_ROW_CAP,
  categoriesPresent,
  categoryForQuery,
  filterSatellites,
  groupByCategory,
  satOptionLabel,
  satSecondary,
} from './satelliteSearch'
import type { SatEntry } from './spaceFilterTypes'

function sat(noradId: string, name: string, category: string | null = null): SatEntry {
  return { norad_id: noradId, name, category, updated_at: null }
}

const names = (satellites: SatEntry[]) => satellites.map((entry) => entry.name)

describe('categoryForQuery', () => {
  it('names no category for an empty or one-character query', () => {
    expect(categoryForQuery('')).toBeNull()
    expect(categoryForQuery('   ')).toBeNull()
    expect(categoryForQuery('i')).toBeNull()
  })

  it('matches an alias exactly, ignoring case and surrounding space', () => {
    expect(categoryForQuery('iss')).toBe('space_station')
    expect(categoryForQuery('  HAM  ')).toBe('amateur')
    expect(categoryForQuery('gnss')).toBe('navigation')
  })

  it('matches a query that an alias starts with', () => {
    expect(categoryForQuery('wea')).toBe('weather')
    expect(categoryForQuery('cub')).toBe('cubesat')
  })

  it('matches a query that starts with an alias', () => {
    expect(categoryForQuery('gps satellites')).toBe('navigation')
    expect(categoryForQuery('military sats')).toBe('military')
  })

  it('names no category when nothing matches', () => {
    expect(categoryForQuery('zz')).toBeNull()
    expect(categoryForQuery('noaa 19')).toBeNull()
  })
})

describe('filterSatellites', () => {
  // Loaded worst match first, so the ranking test can only pass by sorting.
  const satellites = [
    sat('3', 'TIANGONG', 'space_station'),
    sat('4', 'MISSION X', 'science'),
    sat('1', 'NOAA 19', 'weather'),
    sat('2', 'ISS (ZARYA)', 'space_station'),
    sat('5', 'ISS', 'space_station'),
  ]

  it('returns the loaded list unchanged for an empty or blank query', () => {
    expect(filterSatellites(satellites, '')).toBe(satellites)
    expect(filterSatellites(satellites, '   ')).toBe(satellites)
  })

  it('ranks exact name, name prefix, name substring, then category matches', () => {
    expect(names(filterSatellites(satellites, 'iss'))).toEqual([
      'ISS',
      'ISS (ZARYA)',
      'MISSION X',
      'TIANGONG',
    ])
  })

  it('ranks a name substring above a NORAD id match', () => {
    const list = [sat('25544', 'AO-7'), sat('9', 'X255')]
    expect(names(filterSatellites(list, '255'))).toEqual(['X255', 'AO-7'])
  })

  it('leaves out satellites matching neither name, id nor category', () => {
    expect(names(filterSatellites(satellites, 'noaa'))).toEqual(['NOAA 19'])
    expect(filterSatellites(satellites, 'nothing like it')).toEqual([])
  })

  it('does not mutate the loaded list when sorting', () => {
    const copy = [...satellites]
    filterSatellites(satellites, 'iss')
    expect(satellites).toEqual(copy)
  })
})

describe('groupByCategory', () => {
  it('orders groups by the display order and leaves empty ones out', () => {
    const groups = groupByCategory([
      sat('1', 'A', 'amateur'),
      sat('2', 'B', 'space_station'),
      sat('3', 'C', 'amateur'),
    ])
    expect(groups.map((group) => group.cat)).toEqual(['space_station', 'amateur'])
    expect(names(groups[1]!.sats)).toEqual(['A', 'C'])
  })

  it('files a satellite with no category under unknown', () => {
    const groups = groupByCategory([sat('1', 'A', null), sat('2', 'B', '')])
    expect(groups).toEqual([{ cat: 'unknown', sats: [sat('1', 'A', null), sat('2', 'B', '')] }])
  })

  it('puts categories outside the display order last, in the order met', () => {
    const groups = groupByCategory([
      sat('1', 'A', 'zeta'),
      sat('2', 'B', 'weather'),
      sat('3', 'C', 'alpha'),
    ])
    expect(groups.map((group) => group.cat)).toEqual(['weather', 'zeta', 'alpha'])
  })

  it(`caps each group at ${CATEGORY_ROW_CAP} rows`, () => {
    const many = Array.from({ length: CATEGORY_ROW_CAP + 5 }, (_, index) =>
      sat(String(index), `SAT ${index}`, 'amateur'),
    )
    const [group] = groupByCategory(many)
    expect(group!.sats).toHaveLength(CATEGORY_ROW_CAP)
    expect(group!.sats[0]!.name).toBe('SAT 0')
  })

  it('returns no groups for no satellites', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('categoriesPresent', () => {
  it('lists the categories with satellites, in display order', () => {
    expect(
      categoriesPresent([sat('1', 'A', 'cubesat'), sat('2', 'B', 'weather'), sat('3', 'C', null)]),
    ).toEqual(['weather', 'cubesat', 'unknown'])
  })

  it('leaves out categories outside the display order', () => {
    expect(categoriesPresent([sat('1', 'A', 'zeta')])).toEqual([])
  })

  it('lists none for no satellites', () => {
    expect(categoriesPresent([])).toEqual([])
  })
})

describe('satSecondary', () => {
  it('leads with the short category label', () => {
    expect(satSecondary(sat('7530', 'AO-7', 'amateur'))).toBe('AMATEUR · NORAD 7530')
    expect(satSecondary(sat('25544', 'ISS', 'space_station'))).toBe('STATION · NORAD 25544')
  })

  it('upper-cases a category that has no short label', () => {
    expect(satSecondary(sat('1', 'A', 'zeta'))).toBe('ZETA · NORAD 1')
  })

  it('shows only the NORAD id without a category', () => {
    expect(satSecondary(sat('7530', 'AO-7', null))).toBe('NORAD 7530')
    expect(satSecondary(sat('7530', 'AO-7', ''))).toBe('NORAD 7530')
  })
})

describe('satOptionLabel', () => {
  it('names the satellite, its second line and whether it is open', () => {
    expect(satOptionLabel(sat('7530', 'AO-7', 'amateur'), false)).toBe(
      'AO-7, AMATEUR · NORAD 7530, collapsed',
    )
    expect(satOptionLabel(sat('7530', 'AO-7', 'amateur'), true)).toBe(
      'AO-7, AMATEUR · NORAD 7530, expanded',
    )
  })

  it('falls back to the NORAD id for a satellite with no name', () => {
    expect(satOptionLabel(sat('7530', '', null), false)).toBe('7530, NORAD 7530, collapsed')
  })
})
