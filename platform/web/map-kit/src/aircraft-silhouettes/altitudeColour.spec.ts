import { describe, expect, it } from 'vitest'
import {
  ALTITUDE_BAND_MAX,
  ALTITUDE_LEGEND_TICKS_FEET,
  altitudeBand,
  altitudeBandColour,
  altitudeColour,
} from './altitudeColour'

/** The hue in a colour from the ramp. */
const hueOf = (colour: string): number => Number(/hsl\((\d+)/.exec(colour)![1])

describe('altitudeBand', () => {
  it.each([
    [0, 0],
    [499, 0],
    [500, 1],
    [9_999, 19],
    [10_000, 20],
    [11_999, 20],
    [12_000, 21],
    [40_000, ALTITUDE_BAND_MAX],
  ])('puts %i ft in band %i', (feet, band) => {
    expect(altitudeBand(feet)).toBe(band)
  })

  it('clamps anything below the ground or above the ceiling', () => {
    expect(altitudeBand(-500)).toBe(0)
    expect(altitudeBand(60_000)).toBe(ALTITUDE_BAND_MAX)
  })
})

describe('altitudeColour', () => {
  it('runs orange at the ground to magenta at the top', () => {
    expect(hueOf(altitudeColour(0, 'dark'))).toBe(20)
    expect(hueOf(altitudeColour(40_000, 'dark'))).toBe(295)
  })

  it('interpolates between stops', () => {
    expect(hueOf(altitudeColour(1_000, 'dark'))).toBe(29)
  })

  it('climbs steadily through the legend’s altitudes', () => {
    const hues = ALTITUDE_LEGEND_TICKS_FEET.map((tick) => hueOf(altitudeColour(tick, 'dark')))
    expect(hues).toEqual([...hues].sort((first, second) => first - second))
    expect(new Set(hues).size).toBe(hues.length)
  })

  it('clamps outside the ramp', () => {
    expect(altitudeColour(-100, 'dark')).toBe(altitudeColour(0, 'dark'))
    expect(altitudeColour(50_000, 'dark')).toBe(altitudeColour(40_000, 'dark'))
  })

  it('keeps the hue but deepens it for the light map', () => {
    const dark = altitudeColour(20_000, 'dark')
    const light = altitudeColour(20_000, 'light')
    expect(hueOf(light)).toBe(hueOf(dark))
    expect(dark).toContain('60%')
    expect(light).toContain('38%')
  })
})

describe('altitudeBandColour', () => {
  it('takes a low band’s colour from its lower edge', () => {
    expect(altitudeBandColour(2, 'dark')).toBe(altitudeColour(1_000, 'dark'))
  })

  it('takes a high band’s colour from its lower edge', () => {
    expect(altitudeBandColour(21, 'dark')).toBe(altitudeColour(12_000, 'dark'))
  })
})
