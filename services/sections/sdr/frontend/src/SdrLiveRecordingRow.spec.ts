import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrLiveRecordingRow from './SdrLiveRecordingRow.vue'
import type { LiveRecording } from './sdrRecordings'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const recording: LiveRecording = {
  frequency_hz: 446_006_250,
  mode: 'NFM',
  startedAt: '2026-06-11 11:00',
}

function mountRow(
  props: Partial<{ recording: LiveRecording; squelchOpen: boolean; elapsedSeconds: number }> = {},
) {
  return mount(SdrLiveRecordingRow, {
    props: { recording, squelchOpen: true, elapsedSeconds: 75, ...props },
    attachTo: document.body,
  })
}

describe('SdrLiveRecordingRow', () => {
  it('is a live recording row', () => {
    expect(mountRow().classes()).toEqual(['sdr-recording-row', 'sdr-recording-live'])
  })

  it('shows the frequency to four decimals and the mode', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.sdr-recording-freq-num').text()).toBe('446.0063')
    expect(wrapper.find('.sdr-recording-freq-mode').text()).toBe('- NFM')
  })

  it('leaves the mode out when there is none', () => {
    expect(
      mountRow({ recording: { ...recording, mode: '' } })
        .find('.sdr-recording-freq-mode')
        .exists(),
    ).toBe(false)
  })

  it('reads Recording with a steady dot while the squelch is open', () => {
    const wrapper = mountRow({ squelchOpen: true })
    expect(wrapper.find('.sdr-recording-live-status').text()).toBe('Recording')
    expect(wrapper.find('.sdr-recording-live-dot').classes()).not.toContain(
      'sdr-recording-live-dot--waiting',
    )
  })

  it('reads Waiting with the amber dot while the squelch is closed', () => {
    const wrapper = mountRow({ squelchOpen: false })
    expect(wrapper.find('.sdr-recording-live-status').text()).toBe('Waiting')
    expect(wrapper.find('.sdr-recording-live-dot').classes()).toContain(
      'sdr-recording-live-dot--waiting',
    )
  })

  it('shows the start, the running duration and the size estimated at 96 kB/s', () => {
    const values = mountRow({ elapsedSeconds: 75 })
      .findAll('dd')
      .map((value) => value.text())
    // 75 s × 96000 B/s = 7,200,000 B = 6.9 MB
    expect(values).toEqual(['2026-06-11 11:00', '1:15', '6.9 MB'])
  })

  it('shows 0:00 and 0 B at the start', () => {
    const values = mountRow({ elapsedSeconds: 0 })
      .findAll('dd')
      .map((value) => value.text())
    expect(values.slice(1)).toEqual(['0:00', '0 B'])
  })

  it('emits stop from a named STOP button without the click reaching the row', async () => {
    const rowClicks: string[] = []
    const wrapper = mountRow()
    wrapper.element.parentElement!.addEventListener('click', () => rowClicks.push('row'))
    const stop = wrapper.find('.sdr-recording-stop')
    expect(stop.attributes('aria-label')).toBe('Stop recording')
    expect(stop.text()).toBe('STOP')
    await stop.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(rowClicks).toEqual([])
  })

  it('has no axe violations, recording or waiting', async () => {
    expect(await axe(mountRow({ squelchOpen: true }).html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountRow({ squelchOpen: false }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
