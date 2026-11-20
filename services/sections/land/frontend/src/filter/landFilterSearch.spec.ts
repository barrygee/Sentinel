import { describe, it, expect } from 'vitest'
import {
  APRS_STATIONS_GROUP_LABEL,
  joinSets,
  repeaterMatches,
  repeaterRow,
  stationMatches,
  stationRow,
  symbolLabel,
} from './landFilterSearch'
import type { AprsStation } from '../stores/land'
import type { RepeaterChannel, RepeaterStation } from '../types/repeaters'
import { formatHeardTime } from '../controls/aprs/AprsStationsControl'

const HEARD_MS = new Date(2026, 10, 20, 9, 5, 7).getTime()

function station(overrides: Partial<AprsStation> = {}): AprsStation {
  return {
    callsign: 'M0ABC-9',
    latitude: 51.5,
    longitude: -0.1,
    symbol: '/>',
    comment: 'Rolling north',
    course: 90,
    speed: 30,
    altitude: 120,
    path: 'WIDE1-1',
    raw: 'M0ABC-9>APRS:!x',
    last_heard_ms: HEARD_MS,
    ...overrides,
  }
}

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.65,
    rxMhz: 145.05,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 30,
    erpDbw: 10,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function repeater(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NM',
    latitude: 54.9,
    longitude: -1.6,
    locator: 'IO94FX',
    location: 'NEWCASTLE',
    postcode: 'NE1',
    region: 'NE',
    keeper: 'G0ABC',
    channels: [channel()],
    ...overrides,
  }
}

describe('joinSets', () => {
  it('gives an empty string for no sets', () => {
    expect(joinSets([])).toBe('')
  })

  it('gives a single set unchanged', () => {
    expect(joinSets(['repeaters'])).toBe('repeaters')
  })

  it('joins two sets with "and"', () => {
    expect(joinSets(['APRS stations', 'repeaters'])).toBe('APRS stations and repeaters')
  })

  it('separates the leading sets with commas and the last with "and"', () => {
    expect(joinSets(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('symbolLabel', () => {
  it('names the symbol type the map icon carries', () => {
    expect(symbolLabel(station({ symbol: '/>' }))).toBe('Car')
    expect(symbolLabel(station({ symbol: '/#' }))).toBe('Digipeater')
  })
})

describe('stationMatches', () => {
  it('matches on the callsign, whatever case the station sent', () => {
    expect(stationMatches(station(), 'm0abc')).toBe(true)
  })

  it('matches on the symbol type in words', () => {
    expect(stationMatches(station({ symbol: '/#' }), 'digipeater')).toBe(true)
  })

  it('matches on the path', () => {
    expect(stationMatches(station({ path: 'TCPIP*,qAC' }), 'tcpip')).toBe(true)
  })

  it('matches on the comment', () => {
    expect(stationMatches(station(), 'rolling')).toBe(true)
  })

  it('does not match text the station does not carry', () => {
    expect(stationMatches(station(), 'zzzz')).toBe(false)
  })

  it('treats a missing path or comment as empty, never as the word "null"', () => {
    expect(stationMatches(station({ path: null, comment: null }), 'null')).toBe(false)
  })
})

describe('repeaterMatches', () => {
  it('matches on the callsign', () => {
    expect(repeaterMatches(repeater(), 'gb3nm')).toBe(true)
  })

  it('matches on the town', () => {
    expect(repeaterMatches(repeater(), 'newcastle')).toBe(true)
  })

  it('matches on the locator', () => {
    expect(repeaterMatches(repeater(), 'io94')).toBe(true)
  })

  it('matches on any band the site carries', () => {
    const dualBand = repeater({ channels: [channel(), channel({ id: 2, band: '70CM' })] })
    expect(repeaterMatches(dualBand, '70cm')).toBe(true)
  })

  it('matches on a mode by its name, not its register code', () => {
    const dmr = repeater({ channels: [channel({ modes: ['M'] })] })
    expect(repeaterMatches(dmr, 'dmr')).toBe(true)
  })

  it('does not match text the repeater does not carry', () => {
    expect(repeaterMatches(repeater(), 'zzzz')).toBe(false)
  })

  it('treats a withheld town or locator as empty, never as the word "null"', () => {
    expect(repeaterMatches(repeater({ location: null, locator: null }), 'null')).toBe(false)
  })
})

describe('stationRow', () => {
  it('reads as callsign, symbol type and heard time', () => {
    const heard = formatHeardTime(HEARD_MS)
    expect(stationRow(station(), false)).toEqual({
      key: 'M0ABC-9',
      primary: 'M0ABC-9',
      secondary: `Car · ${heard}`,
      optionLabel: `M0ABC-9, Car, heard ${heard}`,
      groupLabel: undefined,
    })
  })

  it('takes the APRS STATIONS heading only when grouped with another set', () => {
    expect(APRS_STATIONS_GROUP_LABEL).toBe('APRS STATIONS')
    expect(stationRow(station(), true).groupLabel).toBe('APRS STATIONS')
    expect(stationRow(station(), false).groupLabel).toBeUndefined()
  })
})

describe('repeaterRow', () => {
  it('reads as callsign, town, bands and modes, keyed apart from APRS rows', () => {
    expect(repeaterRow(repeater())).toEqual({
      key: 'rpt:GB3NM',
      idKey: 'rpt-GB3NM',
      primary: 'GB3NM',
      secondary: 'NEWCASTLE · 2M · FM',
      optionLabel: 'Repeater GB3NM, NEWCASTLE, 2M, FM',
    })
  })

  it('lists every band and mode of a multi-channel site, in register order', () => {
    const site = repeater({
      channels: [
        channel({ id: 2, band: '70CM', modes: ['M'] }),
        channel({ id: 1, band: '2M', modes: ['A'] }),
      ],
    })
    const row = repeaterRow(site)
    expect(row.secondary).toBe('NEWCASTLE · 2M · 70CM · FM · DMR')
    expect(row.optionLabel).toBe('Repeater GB3NM, NEWCASTLE, 2M · 70CM, FM · DMR')
  })

  it('marks a site with every channel off air', () => {
    const row = repeaterRow(repeater({ channels: [channel({ status: 'NOT OPERATIONAL' })] }))
    expect(row.secondary).toBe('NEWCASTLE · 2M · FM · OFF AIR')
    expect(row.optionLabel).toBe('Repeater GB3NM, NEWCASTLE, 2M, FM, not operational')
  })

  it('leaves a withheld town out of the row text but says so in the accessible name', () => {
    const row = repeaterRow(repeater({ location: null }))
    expect(row.secondary).toBe('2M · FM')
    expect(row.optionLabel).toBe('Repeater GB3NM, location withheld, 2M, FM')
  })
})
