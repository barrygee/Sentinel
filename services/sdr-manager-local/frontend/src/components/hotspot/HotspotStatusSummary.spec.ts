import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LocalHotspotState } from '../../api/types'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeHotspotState } from '../../testing/factories'
import HotspotStatusSummary from './HotspotStatusSummary.vue'

function rows(overrides: Partial<LocalHotspotState>): Record<string, string> {
  const wrapper = mount(HotspotStatusSummary, { props: { state: makeHotspotState(overrides) } })
  return Object.fromEntries(
    wrapper.findAll('div').map((row) => [row.get('dt').text(), row.get('dd').text()]),
  )
}

describe('HotspotStatusSummary', () => {
  it.each([
    [{ configured: false, active: true, enabled: true }, 'Not set up'],
    [{ configured: true, active: true, enabled: true }, 'Running, starts with this machine'],
    [{ configured: true, active: true, enabled: false }, 'Running'],
    [{ configured: true, active: false, enabled: true }, 'Stopped, starts with this machine'],
    [{ configured: true, active: false, enabled: false }, 'Stopped'],
  ])('reads %j as "%s"', (overrides, expected) => {
    expect(rows(overrides).STATUS).toBe(expected)
  })

  it('shows the network, interface and address when they are known', () => {
    expect(rows({ ssid: 'Field', interface: 'wlan1', gateway_address: '10.42.0.1' })).toEqual({
      STATUS: 'Stopped',
      NETWORK: 'Field',
      INTERFACE: 'wlan1',
      ADDRESS: '10.42.0.1',
    })
  })

  it('says when the network name is hidden', () => {
    expect(rows({ ssid: 'Field', hidden: true }).NETWORK).toBe('Field (hidden)')
  })

  it('leaves out the rows that have nothing to say', () => {
    expect(rows({ ssid: null, interface: null, gateway_address: null })).toEqual({
      STATUS: 'Stopped',
    })
  })

  it('has no accessibility violations', async () => {
    await expectNoAxeViolations(
      mount(HotspotStatusSummary, {
        props: { state: makeHotspotState({ gateway_address: '10.42.0.1' }) },
      }),
    )
  })
})
