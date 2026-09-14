import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaVesselDetails from './SeaVesselDetails.vue'
import type { SeaVessel } from '@/stores/sea'

const VESSEL: SeaVessel = {
  mmsi: '232012345',
  name: 'PRIDE OF KENT',
  imo: '9015266',
  callsign: 'GBPK',
  type: '60',
  typeLabel: 'PASSENGER',
  family: 'passenger',
  destination: 'DOVER',
  lat: 51.07123,
  lon: 1.42456,
  sog: 18.4,
  cog: 122.4,
  heading: 121,
  navStatus: 0,
  lastPositionMs: Date.UTC(2026, 8, 12, 8, 41, 3),
  lastPositionUtc: '2026-09-12T08:41:03Z',
}

describe('SeaVesselDetails', () => {
  it('lays out every reported field, without repeating the name', () => {
    const wrapper = mount(SeaVesselDetails, { props: { vessel: VESSEL } })
    const text = wrapper.text()
    for (const value of [
      'PASSENGER',
      '232012345',
      '9015266',
      'GBPK',
      'UNDER WAY',
      '08:41:03Z',
      'DOVER',
      '51.07123',
      '1.42456',
      '18.4 KN',
      '122°',
      '121°',
    ]) {
      expect(text).toContain(value)
    }
    expect(text).not.toContain('PRIDE OF KENT')
    expect(wrapper.text()).not.toContain('NAME')
  })

  it('falls back to the family label and dashes for missing fields', () => {
    const sparse: SeaVessel = {
      ...VESSEL,
      typeLabel: '',
      family: 'fishing',
      imo: '',
      callsign: '',
      destination: '',
      sog: null,
      cog: null,
      heading: null,
      navStatus: null,
    }
    const wrapper = mount(SeaVesselDetails, { props: { vessel: sparse } })
    expect(wrapper.text()).toContain('FISHING')
    expect(wrapper.text().match(/—/g)!.length).toBeGreaterThanOrEqual(7)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaVesselDetails, { props: { vessel: VESSEL }, attachTo: document.body })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
