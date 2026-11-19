import { describe, it, expect } from 'vitest'
import { airportRows, milBaseRows, planeRows } from './airFilterRows'
import type { AirportResult, MilResult, PlaneResult } from './airFilterTypes'

function plane(overrides: Partial<PlaneResult> = {}): PlaneResult {
  return {
    kind: 'plane',
    hex: '4ca1fa',
    callsign: 'BAW123',
    reg: 'G-EUUA',
    squawk: '7000',
    emergency: false,
    coords: [-0.4, 51.5],
    ...overrides,
  }
}

function airport(overrides: Partial<AirportResult> = {}): AirportResult {
  return {
    kind: 'airport',
    icao: 'EGLL',
    iata: 'LHR',
    name: 'Heathrow',
    bounds: [-0.5, 51.4, -0.4, 51.5],
    coords: [-0.46, 51.47],
    freqs: { tower: '', radar: '', approach: '', atis: '' },
    ...overrides,
  }
}

function base(overrides: Partial<MilResult> = {}): MilResult {
  return {
    kind: 'mil',
    icao: 'EGVA',
    name: 'RAF Fairford',
    bounds: [-1.8, 51.6, -1.7, 51.7],
    coords: [-1.79, 51.68],
    ...overrides,
  }
}

describe('planeRows', () => {
  it('keys by hex, ids by index, and lists hex, registration and squawk', () => {
    expect(planeRows([plane(), plane({ hex: 'aa1', callsign: 'EZY1' })])).toEqual([
      {
        key: '4ca1fa',
        idKey: 'plane-0',
        primary: 'BAW123',
        secondary: '4CA1FA · G-EUUA · SQK 7000',
        optionLabel: 'BAW123, 4CA1FA · G-EUUA · SQK 7000',
        rowClass: undefined,
      },
      expect.objectContaining({ key: 'aa1', idKey: 'plane-1', primary: 'EZY1' }),
    ])
  })

  it('falls back to the hex when there is no callsign, and drops absent parts', () => {
    const [row] = planeRows([plane({ callsign: '', reg: '', squawk: '' })])
    expect(row).toMatchObject({
      primary: '4ca1fa',
      secondary: '4CA1FA',
      optionLabel: '4ca1fa, 4CA1FA',
    })
  })

  it('names the option by its primary alone when there is nothing secondary', () => {
    const [row] = planeRows([plane({ hex: '', callsign: 'GHOST', reg: '', squawk: '' })])
    expect(row).toMatchObject({ primary: 'GHOST', secondary: '', optionLabel: 'GHOST' })
  })

  it('flags an emergency aircraft with the class that turns its callsign red', () => {
    const [row] = planeRows([plane({ emergency: true })])
    expect(row!.rowClass).toBe('filter-result-item--emergency')
  })

  it('returns no rows for no aircraft', () => {
    expect(planeRows([])).toEqual([])
  })
})

describe('airportRows', () => {
  it('keys by ICAO and announces the collapsed state', () => {
    expect(airportRows([airport()], null)).toEqual([
      {
        key: 'EGLL',
        idKey: 'airport-0',
        primary: 'EGLL',
        secondary: 'HEATHROW · LHR',
        optionLabel: 'EGLL, HEATHROW LHR, collapsed',
      },
    ])
  })

  it('announces only the expanded airport as expanded', () => {
    const rows = airportRows(
      [airport(), airport({ icao: 'EGKK', name: 'Gatwick', iata: 'LGW' })],
      'EGKK',
    )
    expect(rows.map((row) => row.optionLabel)).toEqual([
      'EGLL, HEATHROW LHR, collapsed',
      'EGKK, GATWICK LGW, expanded',
    ])
    expect(rows[1]!.idKey).toBe('airport-1')
  })

  it('leaves the IATA code out when an airport has none', () => {
    const [row] = airportRows([airport({ icao: 'EGNT', name: 'Newcastle', iata: '' })], null)
    expect(row).toMatchObject({ secondary: 'NEWCASTLE', optionLabel: 'EGNT, NEWCASTLE, collapsed' })
  })
})

describe('milBaseRows', () => {
  it('keys by name (ICAO codes repeat), ids by index, and announces state', () => {
    expect(milBaseRows([base()], 'RAF Fairford')).toEqual([
      {
        key: 'RAF Fairford',
        idKey: 'mil-0',
        primary: 'EGVA',
        secondary: 'RAF FAIRFORD',
        optionLabel: 'EGVA, RAF FAIRFORD, expanded',
      },
    ])
    expect(milBaseRows([base()], null)[0]!.optionLabel).toBe('EGVA, RAF FAIRFORD, collapsed')
  })

  it('labels a base with no ICAO by the first six letters of its name', () => {
    const [row] = milBaseRows([base({ icao: '', name: 'RAF Fylingdales' })], null)
    expect(row).toMatchObject({
      primary: 'RAF FY',
      optionLabel: 'RAF FY, RAF FYLINGDALES, collapsed',
    })
  })

  it('keeps ids unique and space-free even when names hold spaces', () => {
    const rows = milBaseRows([base(), base({ name: 'RAF Wyton' })], null)
    expect(rows.map((row) => row.idKey)).toEqual(['mil-0', 'mil-1'])
  })
})
