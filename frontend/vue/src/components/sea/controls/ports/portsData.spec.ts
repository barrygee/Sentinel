import { describe, it, expect } from 'vitest'
import { findPort, PORTS_DATA } from './portsData'
import { marineVhfChannelHz } from '@/utils/marineVhf'

describe('PORTS_DATA', () => {
  it('is a point collection of uniquely coded ports in the British Isles', () => {
    expect(PORTS_DATA.type).toBe('FeatureCollection')
    expect(PORTS_DATA.features.length).toBeGreaterThan(30)
    const locodes = PORTS_DATA.features.map((feature) => feature.properties.locode)
    expect(new Set(locodes).size).toBe(locodes.length)
    for (const feature of PORTS_DATA.features) {
      expect(feature.geometry.type).toBe('Point')
      expect(feature.properties.locode).toMatch(/^(GB|IE|IM)[A-Z0-9]{3}$/)
      expect(feature.properties.name.length).toBeGreaterThan(0)
      const [longitude, latitude] = feature.geometry.coordinates
      expect(latitude).toBeGreaterThan(49.5)
      expect(latitude).toBeLessThan(61)
      expect(longitude).toBeGreaterThan(-11)
      expect(longitude).toBeLessThan(2.5)
    }
  })

  it('gives every port a working channel the plan can tune, and Ch 16 last', () => {
    for (const feature of PORTS_DATA.features) {
      const { channels } = feature.properties
      expect(channels.length).toBeGreaterThanOrEqual(2)
      expect(channels[channels.length - 1]).toEqual({ label: 'Calling', channel: 16 })
      // Ch 16 is appended by the builder, never listed twice.
      expect(channels.filter((portChannel) => portChannel.channel === 16)).toHaveLength(1)
      for (const portChannel of channels) {
        expect(portChannel.label.length).toBeGreaterThan(0)
        expect(marineVhfChannelHz(portChannel.channel)).not.toBeNull()
      }
    }
  })

  it('looks a port up by LOCODE', () => {
    expect(findPort('GBSOU')?.properties.name).toBe('Southampton')
    expect(findPort('GBSOU')?.properties.channels[0]).toEqual({ label: 'VTS', channel: 12 })
    expect(findPort('XXXXX')).toBeUndefined()
    expect(findPort('')).toBeUndefined()
  })
})
