import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AirAirportAccordion from './AirAirportAccordion.vue'
import type { AirportResult } from './airFilterTypes'

const AIRPORT: AirportResult = {
  kind: 'airport',
  icao: 'EGLL',
  iata: 'LHR',
  name: 'Heathrow',
  bounds: [-0.5, 51.4, -0.4, 51.5],
  coords: [-0.46, 51.47],
  // Radar is empty, so only three channels are tunable.
  freqs: { tower: '118.500', radar: '', approach: '134.975', atis: '113.750 / 113.760' },
}

function mountAccordion(
  overrides: Partial<{ sdrConnected: boolean; showTuneNotice: boolean }> = {},
) {
  return mount(AirAirportAccordion, {
    props: { airport: AIRPORT, sdrConnected: true, showTuneNotice: false, ...overrides },
  })
}

describe('AirAirportAccordion', () => {
  it('shows the location then one tunable cell per usable channel, upper-cased', () => {
    const wrapper = mountAccordion()
    expect(wrapper.findAll('.ba-data-grid-title').map((title) => title.text())).toEqual([
      'LOCATION',
      'FREQUENCIES',
    ])
    const channels = wrapper.findAll('.apt-acc-freq')
    expect(channels.map((cell) => cell.get('.ba-data-cell-label').text())).toEqual([
      'TOWER',
      'APPROACH',
      'ATIS',
    ])
    expect(channels[2]!.text()).toContain('113.750 / 113.760')
    expect(channels[2]!.text()).toContain('AM')
  })

  it('emits tune with the clicked channel', async () => {
    const wrapper = mountAccordion()
    await wrapper.findAll('.apt-acc-freq')[1]!.trigger('click')
    expect(wrapper.emitted('tune')).toEqual([
      [{ label: 'Approach', display: '134.975', mode: 'AM', hz: 134_975_000 }],
    ])
  })

  it('passes the SDR state to the cells, which say how to tune without one', async () => {
    const wrapper = mountAccordion({ sdrConnected: false })
    expect(wrapper.get('.apt-acc-freq').attributes('title')).toBe('Connect an SDR to tune')
    await wrapper.setProps({ sdrConnected: true })
    expect(wrapper.get('.apt-acc-freq').attributes('title')).toBe('Tune to 118.500 AM')
  })

  it('shows the connect-an-SDR notice as a status only when asked', async () => {
    const wrapper = mountAccordion()
    expect(wrapper.find('.apt-acc-notice').exists()).toBe(false)
    await wrapper.setProps({ showTuneNotice: true })
    const notice = wrapper.get('.apt-acc-notice')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.text()).toBe('Connect an SDR before tuning')
  })

  it('renders an empty FREQUENCIES grid for an airport with no usable channel', () => {
    const wrapper = mount(AirAirportAccordion, {
      props: {
        airport: { ...AIRPORT, freqs: { tower: '', radar: '', approach: '', atis: '' } },
        sdrConnected: true,
        showTuneNotice: false,
      },
    })
    expect(wrapper.findAll('.apt-acc-freq')).toHaveLength(0)
  })

  it('has no axe violations with the notice showing', async () => {
    const wrapper = mountAccordion({ sdrConnected: false, showTuneNotice: true })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
