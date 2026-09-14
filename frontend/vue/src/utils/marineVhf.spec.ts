import { describe, it, expect } from 'vitest'
import {
  formatMarineVhfMhz,
  MARINE_VHF_CHANNEL_MHZ,
  MARINE_VHF_MODE,
  marineVhfChannelHz,
} from './marineVhf'

describe('marineVhf', () => {
  it('tables the simplex channels on the 25 kHz raster with Ch 16 at 156.800', () => {
    expect(MARINE_VHF_CHANNEL_MHZ[16]).toBe(156.8)
    expect(MARINE_VHF_CHANNEL_MHZ[12]).toBe(156.6)
    for (const megahertz of Object.values(MARINE_VHF_CHANNEL_MHZ)) {
      expect(megahertz).toBeGreaterThanOrEqual(156.3)
      expect(megahertz).toBeLessThanOrEqual(156.875)
      // Every entry sits on a 25 kHz step from the band edge.
      expect(Math.round((megahertz - 156.3) * 1000) % 25).toBe(0)
    }
    expect(MARINE_VHF_MODE).toBe('NFM')
  })

  it('converts a channel to Hz and refuses one outside the table', () => {
    expect(marineVhfChannelHz(16)).toBe(156_800_000)
    expect(marineVhfChannelHz(67)).toBe(156_375_000)
    expect(marineVhfChannelHz(22)).toBeNull() // duplex, not tabled
    expect(marineVhfChannelHz(0)).toBeNull()
    expect(marineVhfChannelHz(-1)).toBeNull()
    expect(marineVhfChannelHz(Number.NaN)).toBeNull()
  })

  it('formats a channel as MHz to three places, empty when unknown', () => {
    expect(formatMarineVhfMhz(12)).toBe('156.600')
    expect(formatMarineVhfMhz(71)).toBe('156.575')
    expect(formatMarineVhfMhz(99)).toBe('')
  })
})
