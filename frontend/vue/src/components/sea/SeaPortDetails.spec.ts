import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaPortDetails from './SeaPortDetails.vue'
import type { PortProperties } from './controls/ports/portsData'

const PORT: PortProperties = {
  locode: 'GBSOU',
  name: 'Southampton',
  channels: [
    { label: 'VTS', channel: 12 },
    { label: 'Patrol', channel: 14 },
    { label: 'Calling', channel: 16 },
  ],
}

function mountDetails(overrides: Partial<InstanceType<typeof SeaPortDetails>['$props']> = {}) {
  return mount(SeaPortDetails, {
    props: {
      port: PORT,
      coordinates: [-1.4045, 50.8995],
      sdrConnected: true,
      tuneNotice: false,
      ...overrides,
    },
  })
}

describe('SeaPortDetails', () => {
  it('shows the position in hemisphere notation and one button per channel', () => {
    const wrapper = mountDetails()
    const text = wrapper.text()
    expect(text).toContain('50.8995°N')
    expect(text).toContain('1.4045°W')
    // The row header already names the port; no LOCODE / NAME cells here.
    expect(text).not.toContain('GBSOU')
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.find('.ba-data-cell-label').text())).toEqual([
      'VTS · CH 12',
      'PATROL · CH 14',
      'CALLING · CH 16',
    ])
    expect(wrapper.find('.sea-port-notice').exists()).toBe(false)
  })

  it('handles the other hemispheres', () => {
    const wrapper = mountDetails({ coordinates: [1.31, -33.9] })
    expect(wrapper.text()).toContain('33.9000°S')
    expect(wrapper.text()).toContain('1.3100°E')
  })

  it('omits a channel the plan cannot tune rather than offering a dead button', () => {
    const wrapper = mountDetails({
      port: { ...PORT, channels: [{ label: 'Duplex', channel: 22 }, PORT.channels[2]!] },
    })
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('DUPLEX')
  })

  it('emits the clicked channel and passes the SDR state down', async () => {
    const wrapper = mountDetails({ sdrConnected: false })
    const buttons = wrapper.findAll('button')
    expect(buttons[1]!.attributes('title')).toBe('Connect an SDR to tune')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('tune')).toEqual([[{ label: 'Patrol', channel: 14 }]])
  })

  it('shows the connect-an-SDR hint as a status when asked', () => {
    const wrapper = mountDetails({ tuneNotice: true })
    const notice = wrapper.find('.sea-port-notice')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.text()).toBe('Connect an SDR before tuning')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaPortDetails, {
      props: { port: PORT, coordinates: [-1.4, 50.9], sdrConnected: false, tuneNotice: true },
      attachTo: document.body,
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
