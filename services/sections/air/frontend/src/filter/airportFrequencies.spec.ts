import { describe, it, expect } from 'vitest'
import { airportFreqs } from './airportFrequencies'
import type { AirportResult } from './airFilterTypes'

function airport(freqs: AirportResult['freqs']): AirportResult {
  return {
    kind: 'airport',
    icao: 'EGLL',
    iata: 'LHR',
    name: 'Heathrow',
    bounds: [-0.5, 51.4, -0.4, 51.5],
    coords: [-0.46, 51.47],
    freqs,
  }
}

describe('airportFreqs', () => {
  it('lists the four channels in order, all AM, with the frequency in Hz', () => {
    expect(
      airportFreqs(
        airport({ tower: '118.500', radar: '119.725', approach: '134.975', atis: '113.750' }),
      ),
    ).toEqual([
      { label: 'Tower', display: '118.500', mode: 'AM', hz: 118_500_000 },
      { label: 'Radar', display: '119.725', mode: 'AM', hz: 119_725_000 },
      { label: 'Approach', display: '134.975', mode: 'AM', hz: 134_975_000 },
      { label: 'ATIS', display: '113.750', mode: 'AM', hz: 113_750_000 },
    ])
  })

  it('tunes the first of several listed frequencies but displays them all, trimmed', () => {
    const [atis] = airportFreqs(
      airport({ tower: '', radar: '', approach: '', atis: ' 113.750 / 113.760 ' }),
    )
    expect(atis).toEqual({
      label: 'ATIS',
      display: '113.750 / 113.760',
      mode: 'AM',
      hz: 113_750_000,
    })
  })

  it('skips empty, zero, negative and non-numeric channels', () => {
    expect(
      airportFreqs(airport({ tower: '', radar: '0', approach: '-118.1', atis: 'n/a' })),
    ).toEqual([])
  })

  it('treats a missing channel value as empty rather than failing', () => {
    const freqs = {
      tower: undefined,
      radar: '',
      approach: '',
      atis: '',
    } as unknown as AirportResult['freqs']
    expect(airportFreqs(airport(freqs))).toEqual([])
  })

  it('rounds the Hz value so float error never leaks into the tune', () => {
    // 128.010 * 1e6 is 128009999.99999999 in floating point.
    const [tower] = airportFreqs(airport({ tower: '128.010', radar: '', approach: '', atis: '' }))
    expect(tower!.hz).toBe(128_010_000)
  })
})
