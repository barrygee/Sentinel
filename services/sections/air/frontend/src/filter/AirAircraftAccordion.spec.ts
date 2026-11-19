import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AirAircraftAccordion from './AirAircraftAccordion.vue'
import AirAircraftActions from './AirAircraftActions.vue'
import type { AircraftLiveData } from './airFilterTypes'

const LIVE: AircraftLiveData = {
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
}

function mountAccordion(overrides: Record<string, unknown> = {}) {
  return mount(AirAircraftAccordion, {
    props: {
      liveData: LIVE,
      signalLost: false,
      emergency: false,
      tracking: false,
      alertsOn: false,
      ...overrides,
    },
  })
}

describe('AirAircraftAccordion', () => {
  it('lays the telemetry out in POSITION, an untitled movement grid and IDENTIFICATION', () => {
    const wrapper = mountAccordion()
    expect(wrapper.findAll('.ba-data-grid-title').map((title) => title.text())).toEqual([
      'POSITION',
      'IDENTIFICATION',
    ])
    const cells = wrapper
      .findAll('.ba-data-cell')
      .map((cell) => [
        cell.get('.ba-data-cell-label').text(),
        cell.get('.ba-data-cell-value').text(),
      ])
    expect(cells).toEqual([
      ['LATITUDE', '51.4700°N'],
      ['LONGITUDE', '0.4543°W'],
      ['HEADING', '90°'],
      ['ALTITUDE', '36,000 ft'],
      ['SPEED', '451 kt'],
      ['VERTICAL', '+1,280 fpm'],
      ['TYPE', 'A320'],
      ['REGISTRATION', 'G-EUUA'],
      ['CATEGORY', 'A3'],
      ['SQUAWK', '7000'],
    ])
  })

  it('is a plain aircraft body while live and routine', () => {
    const body = mountAccordion().get('.acft-acc-body')
    expect(body.classes()).toEqual(['apt-acc-body', 'acft-acc-body'])
    expect(mountAccordion().find('.acft-acc-signal-lost').exists()).toBe(false)
  })

  it('flags SIGNAL LOST as a status and dims the values while out of the feed', () => {
    const wrapper = mountAccordion({ signalLost: true })
    const flag = wrapper.get('.acft-acc-signal-lost')
    expect(flag.attributes('role')).toBe('status')
    expect(flag.text()).toBe('SIGNAL LOST')
    expect(wrapper.get('.acft-acc-body').classes()).toContain('acft-acc-body--stale')
  })

  it('turns the headings red for an emergency', () => {
    const wrapper = mountAccordion({ emergency: true })
    expect(wrapper.get('.acft-acc-body').classes()).toContain('acft-acc-body--emergency')
    expect(wrapper.get('.acft-acc-body').classes()).not.toContain('acft-acc-body--stale')
  })

  it('passes the track and alert state to its action row', () => {
    const actions = mountAccordion({ tracking: true, alertsOn: false }).findComponent(
      AirAircraftActions,
    )
    expect(actions.props()).toEqual({ tracking: true, alertsOn: false })
  })

  it('re-emits each action', async () => {
    const wrapper = mountAccordion()
    const actions = wrapper.findComponent(AirAircraftActions)
    actions.vm.$emit('track')
    actions.vm.$emit('toggleAlerts')
    actions.vm.$emit('centre')
    expect(wrapper.emitted('track')).toHaveLength(1)
    expect(wrapper.emitted('toggleAlerts')).toHaveLength(1)
    expect(wrapper.emitted('centre')).toHaveLength(1)
  })

  it('has no axe violations while lost in an emergency', async () => {
    const wrapper = mountAccordion({ signalLost: true, emergency: true, tracking: true })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
