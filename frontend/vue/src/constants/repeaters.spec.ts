import { describe, it, expect } from 'vitest'
import {
  DIGITAL_DECODE_MODE_CODES,
  REPEATER_BAND_COLORS,
  REPEATER_BAND_ORDER,
  REPEATER_FREQUENCY_GROUP_NAME,
  REPEATER_MODE_CODES,
  REPEATER_MODE_LABELS,
  REPEATER_SDR_MODE,
  REPEATER_SEARCH_KEY_PREFIX,
  REPEATER_SOURCE_NAME,
  REPEATER_SOURCE_URL,
  channelHasDigitalDecode,
  formatMhz,
  formatRepeaterAccess,
  formatRepeaterModes,
  formatRepeaterOffset,
  repeaterBandColor,
  repeaterCallsignFromSearchKey,
  repeaterMhzToHz,
  repeaterModeLabel,
  repeaterSearchKey,
  stationBands,
  stationModes,
  stationOffAir,
} from './repeaters'
import type { RepeaterChannel, RepeaterModeCode, RepeaterStatus } from '@/types/repeaters'

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1234,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.7125,
    rxMhz: 145.1125,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 40,
    erpDbw: 12,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

describe('repeater vocabulary constants', () => {
  it('labels every mode code the register can carry', () => {
    for (const code of REPEATER_MODE_CODES) {
      expect(REPEATER_MODE_LABELS[code]).toBeTruthy()
    }
    // Chip order is a permutation of the label keys — neither list may drift.
    expect([...REPEATER_MODE_CODES].sort()).toEqual(
      (Object.keys(REPEATER_MODE_LABELS) as RepeaterModeCode[]).sort(),
    )
  })

  it('gives every band in register order a badge colour', () => {
    for (const band of REPEATER_BAND_ORDER) {
      expect(REPEATER_BAND_COLORS[band]).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(REPEATER_BAND_ORDER).toContain('2M')
    expect(REPEATER_BAND_ORDER).toContain('70CM')
  })

  it('tunes repeaters as narrow FM and names its own source and group', () => {
    expect(REPEATER_SDR_MODE).toBe('NFM')
    expect(REPEATER_FREQUENCY_GROUP_NAME).toBe('Repeaters')
    expect(REPEATER_SOURCE_NAME).toContain('ukrepeater.net')
    expect(REPEATER_SOURCE_URL).toBe('https://ukrepeater.net/')
  })

  it('lists exactly the modes the digital decoder handles, and no analogue one', () => {
    expect([...DIGITAL_DECODE_MODE_CODES].sort()).toEqual(['D', 'F', 'M', 'N', 'P'])
    expect(DIGITAL_DECODE_MODE_CODES).not.toContain('A')
  })
})

describe('repeaterBandColor', () => {
  it('returns the band-specific colour for a known band', () => {
    expect(repeaterBandColor('2M')).toBe('#33c2ff')
    expect(repeaterBandColor('70CM')).toBe('#c8ff00')
  })

  it('shares one colour across the three microwave bands', () => {
    expect(repeaterBandColor('9CM')).toBe(repeaterBandColor('13CM'))
    expect(repeaterBandColor('3CM')).toBe(repeaterBandColor('13CM'))
  })

  it('falls back to white for a band the register invents later', () => {
    expect(repeaterBandColor('1.2CM')).toBe('#ffffff')
  })
})

describe('channelHasDigitalDecode', () => {
  it('is true when a channel carries a decodable digital mode', () => {
    expect(channelHasDigitalDecode({ modes: ['A', 'M'] })).toBe(true)
  })

  it('is false for an analogue-only channel', () => {
    expect(channelHasDigitalDecode({ modes: ['A'] })).toBe(false)
  })

  it('is false for modes outside the decoder (TV, TETRA, AX25, M17, DSB)', () => {
    expect(channelHasDigitalDecode({ modes: ['T', 'E', 'X', '7', 'S'] })).toBe(false)
  })

  it('is false when the register lists no modes', () => {
    expect(channelHasDigitalDecode({ modes: [] })).toBe(false)
  })
})

describe('repeaterMhzToHz', () => {
  it('converts MHz to whole Hz', () => {
    expect(repeaterMhzToHz(145.7125)).toBe(145_712_500)
  })

  it('rounds away binary floating-point dust rather than truncating', () => {
    expect(repeaterMhzToHz(433.0749999999)).toBe(433_075_000)
    expect(Number.isInteger(repeaterMhzToHz(1297.0125))).toBe(true)
  })
})

describe('repeaterModeLabel', () => {
  it('expands a known mode letter', () => {
    expect(repeaterModeLabel('A')).toBe('FM')
    expect(repeaterModeLabel('M')).toBe('DMR')
    expect(repeaterModeLabel('7')).toBe('M17')
  })

  it('shows an unknown letter as itself rather than hiding it', () => {
    expect(repeaterModeLabel('Z')).toBe('Z')
  })
})

describe('formatRepeaterModes', () => {
  it('joins mode labels with a middle dot', () => {
    expect(formatRepeaterModes(['A', 'M', 'F'])).toBe('FM · DMR · FUSION')
  })

  it('shows an em dash when the register lists no modes', () => {
    expect(formatRepeaterModes([])).toBe('—')
  })

  it('passes an unknown code through', () => {
    expect(formatRepeaterModes(['A', 'Z'])).toBe('FM · Z')
  })
})

describe('formatMhz', () => {
  it('always shows four decimal places, as every rig does', () => {
    expect(formatMhz(145.7)).toBe('145.7000 MHz')
    expect(formatMhz(1297.0125)).toBe('1297.0125 MHz')
  })
})

describe('formatRepeaterOffset', () => {
  it('reports a negative offset with a proper minus sign', () => {
    expect(formatRepeaterOffset({ txMhz: 145.7125, rxMhz: 145.1125 })).toBe('−0.6000 MHz')
  })

  it('reports a positive offset with a plus sign', () => {
    expect(formatRepeaterOffset({ txMhz: 433.0, rxMhz: 434.6 })).toBe('+1.6000 MHz')
  })

  it('reports a simplex channel when input equals output', () => {
    expect(formatRepeaterOffset({ txMhz: 145.7125, rxMhz: 145.7125 })).toBe('simplex')
  })

  it('treats a sub-100 Hz difference as simplex (register rounding noise)', () => {
    expect(formatRepeaterOffset({ txMhz: 145.7125, rxMhz: 145.71255 })).toBe('simplex')
    // Just outside the tolerance it is reported as a real offset.
    expect(formatRepeaterOffset({ txMhz: 145.7125, rxMhz: 145.7127 })).toBe('+0.0002 MHz')
  })
})

describe('formatRepeaterAccess', () => {
  it('shows the CTCSS tone alone for an analogue channel', () => {
    expect(formatRepeaterAccess({ ctcssHz: 118.8, dmrColourCode: null })).toBe('118.8 Hz')
  })

  it('shows the colour code alone for a DMR-only channel', () => {
    expect(formatRepeaterAccess({ ctcssHz: null, dmrColourCode: 5 })).toBe('CC5')
  })

  it('shows both when the site carries analogue and DMR', () => {
    expect(formatRepeaterAccess({ ctcssHz: 71.9, dmrColourCode: 1 })).toBe('71.9 Hz · CC1')
  })

  it('shows an em dash when the channel needs no access code', () => {
    expect(formatRepeaterAccess({ ctcssHz: null, dmrColourCode: null })).toBe('—')
  })

  it('keeps a colour code of zero, which is a real value', () => {
    expect(formatRepeaterAccess({ ctcssHz: null, dmrColourCode: 0 })).toBe('CC0')
  })
})

describe('stationBands', () => {
  it('sorts bands lowest frequency first and deduplicates them', () => {
    const bands = stationBands({
      channels: [
        channel({ band: '70CM' }),
        channel({ band: '2M' }),
        channel({ band: '70CM' }),
        channel({ band: '6M' }),
      ],
    })
    expect(bands).toEqual(['6M', '2M', '70CM'])
  })

  it('puts unknown bands last, alphabetically among themselves', () => {
    expect(
      stationBands({
        channels: [channel({ band: 'ZZZ' }), channel({ band: 'AAA' }), channel({ band: '2M' })],
      }),
    ).toEqual(['2M', 'AAA', 'ZZZ'])
  })

  it('returns nothing for a site with no channels', () => {
    expect(stationBands({ channels: [] })).toEqual([])
  })
})

describe('stationModes', () => {
  it('returns the distinct modes across channels in chip order', () => {
    expect(
      stationModes({
        channels: [channel({ modes: ['M', 'A'] }), channel({ modes: ['A', 'D'] })],
      }),
    ).toEqual(['A', 'M', 'D'])
  })

  it('returns nothing when no channel lists a mode', () => {
    expect(stationModes({ channels: [channel({ modes: [] })] })).toEqual([])
  })
})

describe('stationOffAir', () => {
  const notOperational: RepeaterStatus = 'NOT OPERATIONAL'

  it('is true only when every channel is off air', () => {
    expect(stationOffAir({ channels: [channel({ status: notOperational })] })).toBe(true)
  })

  it('is false while one channel still works', () => {
    expect(
      stationOffAir({
        channels: [channel({ status: notOperational }), channel({ status: 'REDUCED OUTPUT' })],
      }),
    ).toBe(false)
  })

  it('is false for an operational site', () => {
    expect(stationOffAir({ channels: [channel({ status: 'OPERATIONAL' })] })).toBe(false)
  })

  it('treats a site with an unknown status as on air', () => {
    expect(stationOffAir({ channels: [channel({ status: 'UNKNOWN' })] })).toBe(false)
  })
})

describe('FILTER-pane row keys', () => {
  it('prefixes a callsign so a repeater never collides with an APRS station', () => {
    expect(REPEATER_SEARCH_KEY_PREFIX).toBe('rpt:')
    expect(repeaterSearchKey('GB3NR')).toBe('rpt:GB3NR')
  })

  it('reads the callsign back out of a repeater row key', () => {
    expect(repeaterCallsignFromSearchKey(repeaterSearchKey('GB7NR'))).toBe('GB7NR')
  })

  it('returns null for a row key belonging to another layer', () => {
    expect(repeaterCallsignFromSearchKey('M0ABC-9')).toBeNull()
    expect(repeaterCallsignFromSearchKey('')).toBeNull()
  })

  it('reads an empty callsign back as an empty string, not null', () => {
    expect(repeaterCallsignFromSearchKey('rpt:')).toBe('')
  })
})
