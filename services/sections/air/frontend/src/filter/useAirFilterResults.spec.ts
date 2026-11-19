import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

// Small deterministic datasets in place of the bundled airport/base data.
vi.mock('../controls/airports/AirportsControl', () => ({
  AIRPORTS_DATA: {
    features: [
      {
        properties: {
          icao: 'EGLL',
          iata: 'LHR',
          name: 'Heathrow',
          bounds: [-0.5, 51.4, -0.4, 51.5],
          freqs: { tower: '118.500', radar: '', approach: '', atis: '' },
        },
        geometry: { coordinates: [-0.46, 51.47] },
      },
      {
        properties: {
          icao: 'EGNT',
          iata: undefined,
          name: 'Newcastle',
          bounds: [-1.8, 54.9, -1.6, 55.1],
          freqs: { tower: '', radar: '', approach: '', atis: '' },
        },
        geometry: { coordinates: [-1.7, 55.1] },
      },
    ],
  },
}))
vi.mock('../controls/military-bases/MilitaryBasesControl', () => ({
  MILITARY_BASES_DATA: {
    features: [
      {
        properties: { icao: 'EGVA', name: 'RAF Fairford', bounds: [-1.8, 51.6, -1.7, 51.7] },
        geometry: { coordinates: [-1.79, 51.68] },
      },
      {
        properties: { icao: undefined, name: 'RAF Fylingdales', bounds: [-0.7, 54.3, -0.6, 54.4] },
        geometry: { coordinates: [-0.67, 54.36] },
      },
    ],
  },
}))

import { useAirFilterResults, type AircraftTypeFilter } from './useAirFilterResults'
import type { AircraftFeature } from './airFilterTypes'

function aircraft(properties: Record<string, unknown>, coordinates: [number, number] = [1, 2]) {
  return { properties, geometry: { coordinates } } as AircraftFeature
}

function setup(features: AircraftFeature[] = []) {
  const query = ref('')
  const aircraftFeatures = ref(features)
  const typeFilter = ref<AircraftTypeFilter>('all')
  const allHidden = ref(false)
  const results = useAirFilterResults(query, aircraftFeatures, typeFilter, allHidden)
  return { query, aircraftFeatures, typeFilter, allHidden, ...results }
}

const hexes = (planes: { hex: string }[]) => planes.map((plane) => plane.hex)

describe('useAirFilterResults — aircraft', () => {
  it('reads each feature into a trimmed result with its coordinates', () => {
    const { planes } = setup([
      aircraft(
        { hex: ' 4ca1fa ', flight: 'BAW123  ', r: ' G-EUUA', squawk: '7000 ' },
        [-0.4, 51.5],
      ),
    ])
    expect(planes.value).toEqual([
      {
        kind: 'plane',
        hex: '4ca1fa',
        callsign: 'BAW123',
        reg: 'G-EUUA',
        squawk: '7000',
        emergency: false,
        coords: [-0.4, 51.5],
      },
    ])
  })

  it('reads absent text properties as empty strings', () => {
    const { planes } = setup([aircraft({})])
    expect(planes.value[0]).toMatchObject({ hex: '', callsign: '', reg: '', squawk: '' })
  })

  it('leaves out ground vehicles (C1, C2) and towers (C3–C5, TWR)', () => {
    const { planes } = setup([
      aircraft({ hex: 'a', category: 'A3' }),
      aircraft({ hex: 'c1', category: 'C1' }),
      aircraft({ hex: 'c2', category: ' C2 ' }),
      aircraft({ hex: 'c3', category: 'C3' }),
      aircraft({ hex: 'c4', category: 'C4' }),
      aircraft({ hex: 'c5', category: 'C5' }),
      aircraft({ hex: 'twr', t: ' TWR ' }),
      aircraft({ hex: 'c6', category: 'C6' }),
    ])
    expect(hexes(planes.value)).toEqual(['a', 'c6'])
  })

  it('follows the map filter: civil hides military, military hides civil', () => {
    const { planes, typeFilter } = setup([
      aircraft({ hex: 'civ' }),
      aircraft({ hex: 'mil', military: true }),
    ])
    expect(hexes(planes.value)).toEqual(['civ', 'mil'])
    typeFilter.value = 'civil'
    expect(hexes(planes.value)).toEqual(['civ'])
    typeFilter.value = 'mil'
    expect(hexes(planes.value)).toEqual(['mil'])
  })

  it('lists no aircraft while the map hides them all', () => {
    const { planes, allHidden } = setup([aircraft({ hex: 'a' })])
    allHidden.value = true
    expect(planes.value).toEqual([])
  })

  it('matches the query against callsign, hex, registration and squawk, ignoring case', () => {
    const { planes, query } = setup([
      aircraft({ hex: 'aaa111', flight: 'BAW1' }),
      aircraft({ hex: 'bbb222', r: 'G-ZZZZ' }),
      aircraft({ hex: 'ccc333', squawk: '7700' }),
    ])
    query.value = '  baw '
    expect(hexes(planes.value)).toEqual(['aaa111'])
    query.value = 'BBB'
    expect(hexes(planes.value)).toEqual(['bbb222'])
    query.value = 'g-zz'
    expect(hexes(planes.value)).toEqual(['bbb222'])
    query.value = '770'
    expect(hexes(planes.value)).toEqual(['ccc333'])
    query.value = 'nothing'
    expect(planes.value).toEqual([])
  })

  it('orders by callsign, falling back to hex, with hex breaking ties', () => {
    const { planes } = setup([
      aircraft({ hex: 'zz9', flight: 'EZY1' }),
      aircraft({ hex: 'bb2', flight: 'BAW1' }),
      aircraft({ hex: 'aa1', flight: 'BAW1' }),
      aircraft({ hex: 'cat' }),
    ])
    expect(hexes(planes.value)).toEqual(['aa1', 'bb2', 'cat', 'zz9'])
  })

  it('flags an emergency from the squawk marker or a transponder emergency other than none', () => {
    const { planes } = setup([
      aircraft({ hex: 'a', squawkEmerg: 1 }),
      aircraft({ hex: 'b', emergency: 'general' }),
      aircraft({ hex: 'c', emergency: 'none' }),
      aircraft({ hex: 'd', squawkEmerg: 0, emergency: '' }),
    ])
    expect(planes.value.map((plane) => plane.emergency)).toEqual([true, true, false, false])
  })

  it('recomputes when the feed changes', () => {
    const { planes, aircraftFeatures } = setup([])
    aircraftFeatures.value = [aircraft({ hex: 'new' })]
    expect(hexes(planes.value)).toEqual(['new'])
  })
})

describe('useAirFilterResults — airports and bases', () => {
  it('lists every airport and base, in data order, with no query', () => {
    const { airports, milBases } = setup()
    expect(airports.value).toEqual([
      {
        kind: 'airport',
        icao: 'EGLL',
        iata: 'LHR',
        name: 'Heathrow',
        bounds: [-0.5, 51.4, -0.4, 51.5],
        coords: [-0.46, 51.47],
        freqs: { tower: '118.500', radar: '', approach: '', atis: '' },
      },
      expect.objectContaining({ icao: 'EGNT', name: 'Newcastle' }),
    ])
    expect(milBases.value).toEqual([
      {
        kind: 'mil',
        icao: 'EGVA',
        name: 'RAF Fairford',
        bounds: [-1.8, 51.6, -1.7, 51.7],
        coords: [-1.79, 51.68],
      },
      expect.objectContaining({ name: 'RAF Fylingdales' }),
    ])
  })

  it('matches airports by ICAO, IATA or name, tolerating a missing IATA', () => {
    const { airports, query } = setup()
    query.value = 'lhr'
    expect(airports.value.map((airport) => airport.icao)).toEqual(['EGLL'])
    query.value = 'egnt'
    expect(airports.value.map((airport) => airport.icao)).toEqual(['EGNT'])
    query.value = 'castle'
    expect(airports.value.map((airport) => airport.icao)).toEqual(['EGNT'])
  })

  it('matches bases by ICAO or name, tolerating a missing ICAO', () => {
    const { milBases, query } = setup()
    query.value = 'egva'
    expect(milBases.value.map((base) => base.name)).toEqual(['RAF Fairford'])
    query.value = 'FYLING'
    expect(milBases.value.map((base) => base.name)).toEqual(['RAF Fylingdales'])
    query.value = 'zzz'
    expect(milBases.value).toEqual([])
  })
})
