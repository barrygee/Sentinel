import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LocalHotspotClient } from '../../api/types'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import HotspotClientsTable from './HotspotClientsTable.vue'

const LEASE_END = 1_700_000_000_000
const CLIENTS: LocalHotspotClient[] = [
  {
    mac_address: 'aa:aa',
    ip_address: '10.42.0.10',
    hostname: 'phone',
    lease_expires_at_ms: LEASE_END,
    expired: false,
  },
  {
    mac_address: 'bb:bb',
    ip_address: '10.42.0.11',
    hostname: null,
    lease_expires_at_ms: 0,
    expired: true,
  },
]

describe('HotspotClientsTable', () => {
  it('says the connections cannot be read when the lease list is unavailable', () => {
    const wrapper = mount(HotspotClientsTable, { props: { clients: null } })
    expect(wrapper.get('.sdr-devices-empty').text()).toBe(
      'The hotspot’s connections can’t be read.',
    )
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('says nothing is connected for an empty list', () => {
    const wrapper = mount(HotspotClientsTable, { props: { clients: [] } })
    expect(wrapper.get('.sdr-devices-empty').text()).toBe('Nothing is connected.')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('tells the two empty states apart', () => {
    const unreadable = mount(HotspotClientsTable, { props: { clients: null } }).text()
    const empty = mount(HotspotClientsTable, { props: { clients: [] } }).text()
    expect(unreadable).not.toBe(empty)
  })

  it('has column headers for name, address, lease and a hidden actions column', () => {
    const wrapper = mount(HotspotClientsTable, { props: { clients: CLIENTS } })
    const headers = wrapper.findAll('th')
    expect(headers.map((header) => header.attributes('scope'))).toEqual([
      'col',
      'col',
      'col',
      'col',
    ])
    expect(headers.slice(0, 3).map((header) => header.text())).toEqual(['NAME', 'ADDRESS', 'LEASE'])
    expect(headers[3]!.get('.sr-only').text()).toBe('Actions')
  })

  it('lists each client by hostname, else MAC, with its address and lease', () => {
    const wrapper = mount(HotspotClientsTable, { props: { clients: CLIENTS } })
    const [live, expired] = wrapper.findAll('tbody tr')
    const cells = (row: typeof live) => row!.findAll('td').map((cell) => cell.text())
    expect(cells(live)[0]).toBe('phone')
    expect(cells(live)[1]).toBe('10.42.0.10')
    expect(cells(live)[2]).toBe(`Until ${new Date(LEASE_END).toLocaleTimeString()}`)
    expect(cells(expired)[0]).toBe('bb:bb')
    expect(cells(expired)[2]).toBe('Expired')
  })

  it('emits the MAC of the client whose RELEASE is pressed, named for that client', async () => {
    const wrapper = mount(HotspotClientsTable, { props: { clients: CLIENTS } })
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Release phone',
      'Release bb:bb',
    ])
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('release')).toEqual([['bb:bb']])
  })

  it('has no accessibility violations', async () => {
    await expectNoAxeViolations(mount(HotspotClientsTable, { props: { clients: CLIENTS } }))
    await expectNoAxeViolations(mount(HotspotClientsTable, { props: { clients: null } }))
  })
})
