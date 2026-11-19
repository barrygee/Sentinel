import { describe, it, expect } from 'vitest'
import { formatAircraftLiveData, formatLat, formatLon } from './aircraftTelemetryFormat'
import type { AircraftFeature } from './airFilterTypes'

function feature(
  properties: Record<string, unknown>,
  coordinates: [number, number] = [-0.4543, 51.47],
): AircraftFeature {
  return { properties, geometry: { coordinates } }
}

describe('formatLat / formatLon', () => {
  it('formats to four decimals with the hemisphere letter', () => {
    expect(formatLat(51.47)).toBe('51.4700°N')
    expect(formatLat(-33.94612)).toBe('33.9461°S')
    expect(formatLon(0.1234)).toBe('0.1234°E')
    expect(formatLon(-0.4543)).toBe('0.4543°W')
  })

  it('treats the equator and the prime meridian as north and east', () => {
    expect(formatLat(0)).toBe('0.0000°N')
    expect(formatLon(0)).toBe('0.0000°E')
  })
})

describe('formatAircraftLiveData', () => {
  it('formats a full set of properties', () => {
    const data = formatAircraftLiveData(
      feature({
        track: 89.6,
        alt_baro: 36000,
        gs: 451.4,
        baro_rate: 1280,
        t: ' A320 ',
        r: 'G-EUUA',
        category: 'A3',
        squawk: '7000',
      }),
    )
    expect(data).toEqual({
      lat: '51.4700°N',
      lon: '0.4543°W',
      hdg: '90°',
      alt: '36,000 ft',
      spd: '451 kt',
      vrate: '+1,280 fpm',
      type: 'A320',
      reg: 'G-EUUA',
      category: 'A3',
      squawk: '7000',
    })
  })

  it('reads the coordinates as [longitude, latitude]', () => {
    const data = formatAircraftLiveData(feature({}, [2.5, -10]))
    expect(data.lat).toBe('10.0000°S')
    expect(data.lon).toBe('2.5000°E')
  })

  it('shows an em dash for every absent value', () => {
    const data = formatAircraftLiveData(feature({}))
    expect(data).toMatchObject({
      hdg: '—',
      alt: '—',
      spd: '—',
      vrate: '—',
      type: '—',
      reg: '—',
      category: '—',
      squawk: '—',
    })
  })

  it('treats non-numeric and non-finite numbers as absent', () => {
    const data = formatAircraftLiveData(
      feature({ track: '90', alt_baro: 'ground', gs: Number.NaN, baro_rate: Infinity }),
    )
    expect(data.hdg).toBe('—')
    expect(data.alt).toBe('—')
    expect(data.spd).toBe('—')
    expect(data.vrate).toBe('—')
  })

  it('shows whitespace-only text as an em dash', () => {
    const data = formatAircraftLiveData(feature({ t: '  ', r: '', category: ' ', squawk: '   ' }))
    expect([data.type, data.reg, data.category, data.squawk]).toEqual(['—', '—', '—', '—'])
  })

  it('shows GND at zero and below, and feet just above it', () => {
    expect(formatAircraftLiveData(feature({ alt_baro: 0 })).alt).toBe('GND')
    expect(formatAircraftLiveData(feature({ alt_baro: -25 })).alt).toBe('GND')
    expect(formatAircraftLiveData(feature({ alt_baro: 1 })).alt).toBe('1 ft')
  })

  it('signs climbs, leaves descents and level flight unsigned beyond the minus', () => {
    expect(formatAircraftLiveData(feature({ baro_rate: 64 })).vrate).toBe('+64 fpm')
    expect(formatAircraftLiveData(feature({ baro_rate: -1500 })).vrate).toBe('-1,500 fpm')
    expect(formatAircraftLiveData(feature({ baro_rate: 0 })).vrate).toBe('0 fpm')
    // Rounds before signing: a rate that rounds to zero is level, not a climb.
    expect(formatAircraftLiveData(feature({ baro_rate: 0.4 })).vrate).toBe('0 fpm')
  })

  it('rounds heading and speed, and shows zero as a value, not a dash', () => {
    const data = formatAircraftLiveData(feature({ track: 0, gs: 0 }))
    expect(data.hdg).toBe('0°')
    expect(data.spd).toBe('0 kt')
    expect(formatAircraftLiveData(feature({ track: 359.5 })).hdg).toBe('360°')
  })
})
