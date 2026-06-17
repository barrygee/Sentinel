import { describe, it, expect, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrDecodePanel from './SdrDecodePanel.vue'
import { useSdrStore } from '@/stores/sdr'

function mountPanel(): VueWrapper {
  return mount(SdrDecodePanel, { attachTo: document.body })
}

describe('SdrDecodePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the empty state when there are no events', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.sdr-decode-empty').text()).toBe('No decoded events yet.')
  })

  it('disables Clear when the log is empty and enables it with events', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
    const clearButton = wrapper.find('.sdr-decode-clear')
    expect((clearButton.element as HTMLButtonElement).disabled).toBe(true)
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    await wrapper.vm.$nextTick()
    expect((clearButton.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('renders one table row per decoded event with its fields', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
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

  it('renders dashes for missing fields and No for sync:false', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
    store.pushDecodeEvent({ type: 'decode_event', sync: false, ts: 1 })
    await wrapper.vm.$nextTick()
    const row = wrapper.find('tbody tr')
    const cells = row.findAll('td').map((cell) => cell.text())
    expect(cells[1]).toBe('—') // mode
    expect(cells[5]).toBe('No') // sync
  })

  it('shows a dash in the sync column when sync is undefined', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    await wrapper.vm.$nextTick()
    const cells = wrapper
      .find('tbody tr')
      .findAll('td')
      .map((cell) => cell.text())
    expect(cells[5]).toBe('—')
  })

  it('reflects the live status text and dot class', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
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

  it('Clear empties the event log', async () => {
    const store = useSdrStore()
    const wrapper = mountPanel()
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', ts: 1 })
    await wrapper.vm.$nextTick()
    await wrapper.find('.sdr-decode-clear').trigger('click')
    expect(store.decodeEvents).toEqual([])
    expect(wrapper.find('.sdr-decode-empty').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const store = useSdrStore()
    store.pushDecodeEvent({ type: 'decode_event', mode: 'DMR', talkgroup: 1, ts: 1 })
    const wrapper = mountPanel()
    await wrapper.vm.$nextTick()
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
