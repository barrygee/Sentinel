import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrDecodeDock from './SdrDecodeDock.vue'
import { useSdrStore } from '@/stores/sdr'

function mountDock(): VueWrapper {
  return mount(SdrDecodeDock, { attachTo: document.body })
}

describe('SdrDecodeDock', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders both panels side by side, each headed and showing its own empty state', () => {
    const wrapper = mountDock()
    const columns = wrapper.findAll('.sdr-decode-dock-column')
    expect(columns).toHaveLength(2)
    // Both headings present at once — no tab switching.
    expect(wrapper.find('#sdr-dock-heading-messages').text()).toBe('Decoded messages')
    expect(wrapper.find('#sdr-dock-heading-logs').text()).toBe('Logs')
    // Both empty states are visible simultaneously, one per column.
    expect(columns[0].find('.sdr-decode-empty').text()).toBe('No decoded events yet.')
    expect(columns[1].find('.sdr-decode-empty').text()).toBe('No log output yet.')
  })

  it('places each column Clear button in a footer below its list, not in the header', () => {
    const wrapper = mountDock()
    const footers = wrapper.findAll('.sdr-decode-dock-column-footer')
    expect(footers).toHaveLength(2)
    // Each footer owns exactly one Clear button; headers carry none.
    expect(footers[0].find('.sdr-decode-clear').exists()).toBe(true)
    expect(footers[1].find('.sdr-decode-clear').exists()).toBe(true)
    expect(wrapper.findAll('.sdr-decode-dock-column-header .sdr-decode-clear')).toHaveLength(0)
  })

  it('renders one table row per decoded event with its fields', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    store.pushDecodeEvent({
      type: 'decode_event',
      mode: 'P25',
      talkgroup: 1234,
      source: 9876,
      color_code: 1,
      sync: true,
      ts: Date.UTC(2026, 0, 1, 12, 0, 0),
    })
    await wrapper.vm.$nextTick()
    const cells = wrapper.findAll('tbody td').map((cell) => cell.text())
    expect(cells).toContain('P25')
    expect(cells).toContain('1234')
    expect(cells).toContain('9876')
    expect(cells).toContain('1')
    expect(cells).toContain('Yes')
  })

  it('renders dashes for missing fields, No for sync:false and dash for undefined sync', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    store.pushDecodeEvent({ type: 'decode_event', sync: false, ts: 1 })
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 2 })
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('tbody tr')
    // Newest first: row 0 = DMR (sync undefined → —), row 1 = sync:false (No)
    expect(rows[0].findAll('td')[5].text()).toBe('—')
    expect(rows[1].findAll('td')[1].text()).toBe('—') // mode missing
    expect(rows[1].findAll('td')[5].text()).toBe('No')
  })

  it('renders raw log lines newest-first, with error lines flagged and a screen-reader prefix', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    store.pushDecodeEvent({ type: 'log', line: 'Sync: +DMR slot1 [slot2] | IDLE', ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: '-YSF DCH (CRC ERR)', ts: 2 })
    store.pushDecodeEvent({ type: 'log', line: 'Inferred header parameters', ts: 3 })
    await wrapper.vm.$nextTick()
    const lines = wrapper.findAll('.sdr-decode-log-line')
    // Newest-first in both DOM and visual order (top of the list), matching the
    // decoded-messages table above it.
    expect(lines[0].text()).toContain('Inferred header parameters')
    expect(lines[0].classes()).not.toContain('sdr-decode-log-line--error') // "Inferred" embeds err
    expect(lines[1].classes()).toContain('sdr-decode-log-line--error') // CRC ERR
    expect(lines[1].find('.sdr-sr-only').text()).toBe('Error:')
  })

  it('the messages Clear clears only events and is disabled when empty', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    // findAll order follows the template: [0] = messages column, [1] = logs column.
    const messagesClear = wrapper.findAll('.sdr-decode-clear')[0]
    expect((messagesClear.element as HTMLButtonElement).disabled).toBe(true)
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: 'a log line', ts: 2 })
    await wrapper.vm.$nextTick()
    expect((messagesClear.element as HTMLButtonElement).disabled).toBe(false)
    await messagesClear.trigger('click')
    expect(store.decodeEvents).toEqual([])
    expect(store.decodeLogs).toHaveLength(1) // logs untouched
  })

  it('the logs Clear clears only logs and is disabled when empty', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    const logsClear = wrapper.findAll('.sdr-decode-clear')[1]
    expect((logsClear.element as HTMLButtonElement).disabled).toBe(true)
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: 'a log line', ts: 2 })
    await wrapper.vm.$nextTick()
    expect((logsClear.element as HTMLButtonElement).disabled).toBe(false)
    await logsClear.trigger('click')
    expect(store.decodeLogs).toEqual([])
    expect(store.decodeEvents).toHaveLength(1) // messages untouched
  })

  it('hides the trunk indicator until trunk tracking is enabled', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    expect(wrapper.find('.sdr-decode-trunk').exists()).toBe(false)
    store.setTrunkEnabled(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-trunk').exists()).toBe(true)
  })

  it('shows the waiting state when trunking with no channel followed yet', async () => {
    const store = useSdrStore()
    store.setTrunkEnabled(true)
    const wrapper = mountDock()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-trunk').text()).toBe('Trunking — waiting for control channel')
    // No channel followed → idle dot inside the trunk indicator.
    expect(wrapper.find('.sdr-decode-trunk .sdr-decode-dot--idle').exists()).toBe(true)
  })

  it('shows the control-channel state with an idle dot and MHz frequency', async () => {
    const store = useSdrStore()
    store.setTrunkEnabled(true)
    store.trunkFollowedHz = 453_012_500
    store.trunkOnControlChannel = true
    const wrapper = mountDock()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-trunk').text()).toBe('Control channel — 453.0125 MHz')
    expect(wrapper.find('.sdr-decode-trunk .sdr-decode-dot--idle').exists()).toBe(true)
  })

  it('shows the following-call state with a synced dot when off the control channel', async () => {
    const store = useSdrStore()
    store.setTrunkEnabled(true)
    store.trunkFollowedHz = 451_500_000
    store.trunkOnControlChannel = false
    const wrapper = mountDock()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-trunk').text()).toBe('Following call — 451.5000 MHz')
    expect(wrapper.find('.sdr-decode-trunk .sdr-decode-dot--synced').exists()).toBe(true)
  })

  it('reflects the live status text and dot class', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    expect(wrapper.find('.sdr-decode-status').text()).toBe('Decoder offline')
    expect(wrapper.find('.sdr-decode-dot--offline').exists()).toBe(true)

    store.setDecodeStatus({ decoder_reachable: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-status').text()).toBe('No sync')
    expect(wrapper.find('.sdr-decode-dot--idle').exists()).toBe(true)

    store.setDecodeStatus({ sync: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-status').text()).toBe('Synced — decoding')
    expect(wrapper.find('.sdr-decode-dot--synced').exists()).toBe(true)
  })

  it('aligns to the open side panel when the sidebar is open at mount', () => {
    sessionStorage.setItem('sentinel_sidebar_open', '1')
    const wrapper = mountDock()
    expect(wrapper.find('.sdr-decode-dock').classes()).not.toContain('panel-closed')
  })

  it('is panel-closed when the sidebar is closed, and follows the sidebar-state event', async () => {
    const wrapper = mountDock()
    expect(wrapper.find('.sdr-decode-dock').classes()).toContain('panel-closed')
    document.dispatchEvent(new CustomEvent('sentinel:sidebar-state', { detail: { open: true } }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-dock').classes()).not.toContain('panel-closed')
  })

  it('removes the sidebar-state listener on unmount', () => {
    const wrapper = mountDock()
    wrapper.unmount()
    // Dispatching after unmount must not throw (listener detached).
    expect(() =>
      document.dispatchEvent(new CustomEvent('sentinel:sidebar-state', { detail: { open: true } })),
    ).not.toThrow()
  })

  it('has no accessibility violations', async () => {
    const store = useSdrStore()
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', talkgroup: 1, ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: 'Sync: +DMR slot1 [slot2] | IDLE', ts: 2 })
    const wrapper = mountDock()
    await wrapper.vm.$nextTick()
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
