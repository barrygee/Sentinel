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

  it('renders two tabs with the messages tab selected by default', () => {
    const wrapper = mountDock()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toBe('Decoded messages')
    expect(tabs[1].text()).toBe('Logs')
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('aria-selected')).toBe('false')
    // Messages empty state visible; logs panel hidden.
    expect(wrapper.find('#sdr-dock-panel-messages .sdr-decode-empty').text()).toBe(
      'No decoded events yet.',
    )
  })

  it('switches between tabs on click', async () => {
    const wrapper = mountDock()
    await wrapper.find('#sdr-dock-tab-logs').trigger('click')
    expect(wrapper.find('#sdr-dock-tab-logs').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('#sdr-dock-panel-logs .sdr-decode-empty').text()).toBe('No log output yet.')
    // Click back to the messages tab.
    await wrapper.find('#sdr-dock-tab-messages').trigger('click')
    expect(wrapper.find('#sdr-dock-tab-messages').attributes('aria-selected')).toBe('true')
  })

  it('moves between tabs with the arrow keys (roving tabindex)', async () => {
    const wrapper = mountDock()
    const tablist = wrapper.find('[role="tablist"]')
    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('#sdr-dock-tab-logs').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('#sdr-dock-tab-logs').attributes('tabindex')).toBe('0')
    expect(wrapper.find('#sdr-dock-tab-messages').attributes('tabindex')).toBe('-1')
    await tablist.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.find('#sdr-dock-tab-messages').attributes('aria-selected')).toBe('true')
  })

  it('ignores non-arrow keys on the tablist', async () => {
    const wrapper = mountDock()
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('#sdr-dock-tab-messages').attributes('aria-selected')).toBe('true')
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
    // DOM order is newest-first; CSS column-reverse flips it visually.
    expect(lines[0].text()).toContain('Inferred header parameters')
    expect(lines[0].classes()).not.toContain('sdr-decode-log-line--error') // "Inferred" embeds err
    expect(lines[1].classes()).toContain('sdr-decode-log-line--error') // CRC ERR
    expect(lines[1].find('.sdr-sr-only').text()).toBe('Error:')
  })

  it('Clear acts on the messages tab and is disabled when empty', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    const clear = wrapper.find('.sdr-decode-clear')
    expect((clear.element as HTMLButtonElement).disabled).toBe(true)
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: 'a log line', ts: 2 })
    await wrapper.vm.$nextTick()
    expect((clear.element as HTMLButtonElement).disabled).toBe(false)
    await clear.trigger('click')
    expect(store.decodeEvents).toEqual([])
    expect(store.decodeLogs).toHaveLength(1) // logs untouched on the messages tab
  })

  it('Clear acts on the logs tab when it is active', async () => {
    const store = useSdrStore()
    const wrapper = mountDock()
    await wrapper.find('#sdr-dock-tab-logs').trigger('click')
    const clear = wrapper.find('.sdr-decode-clear')
    expect((clear.element as HTMLButtonElement).disabled).toBe(true)
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    store.pushDecodeEvent({ type: 'log', line: 'a log line', ts: 2 })
    await wrapper.vm.$nextTick()
    expect((clear.element as HTMLButtonElement).disabled).toBe(false)
    await clear.trigger('click')
    expect(store.decodeLogs).toEqual([])
    expect(store.decodeEvents).toHaveLength(1) // messages untouched on the logs tab
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
