import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingPlaybackControls from './SdrRecordingPlaybackControls.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountControls(
  props: { playing?: boolean; hasIqFile?: boolean; iqFilePending?: boolean } = {},
) {
  return mount(SdrRecordingPlaybackControls, {
    props: {
      playing: props.playing ?? false,
      hasIqFile: props.hasIqFile ?? false,
      iqFilePending: props.iqFilePending ?? false,
    },
    attachTo: document.body,
  })
}

describe('SdrRecordingPlaybackControls — play', () => {
  it('names the button Play with a triangle while stopped', () => {
    const play = mountControls().find('.sdr-recording-play')
    expect(play.attributes('aria-label')).toBe('Play')
    expect(play.attributes('title')).toBe('Play')
    expect(play.find('polygon').exists()).toBe(true)
    expect(play.findAll('rect')).toHaveLength(0)
  })

  it('names the button Stop with pause bars while playing', () => {
    const play = mountControls({ playing: true }).find('.sdr-recording-play')
    expect(play.attributes('aria-label')).toBe('Stop')
    expect(play.attributes('title')).toBe('Stop')
    expect(play.find('polygon').exists()).toBe(false)
    expect(play.findAll('rect')).toHaveLength(2)
  })

  it('emits togglePlay', async () => {
    const wrapper = mountControls()
    await wrapper.find('.sdr-recording-play').trigger('click')
    expect(wrapper.emitted('togglePlay')).toHaveLength(1)
  })
})

describe('SdrRecordingPlaybackControls — downloads', () => {
  it('always offers the WAV download', async () => {
    const wrapper = mountControls()
    const download = wrapper.find('.sdr-recording-export')
    expect(download.text()).toBe('DOWNLOAD')
    expect(download.attributes('aria-label')).toBe('Download WAV')
    await download.trigger('click')
    expect(wrapper.emitted('download')).toEqual([['wav']])
  })

  it('offers no IQ download without an IQ file', () => {
    expect(mountControls().find('.sdr-recording-iq').exists()).toBe(false)
  })

  it('offers an enabled IQ download once the file has landed', async () => {
    const wrapper = mountControls({ hasIqFile: true })
    const iq = wrapper.find('.sdr-recording-iq')
    expect(iq.text()).toBe('DOWNLOAD IQ')
    expect(iq.attributes('aria-label')).toBe('Download IQ')
    expect(iq.attributes('title')).toBe('Download IQ')
    expect(iq.attributes('disabled')).toBeUndefined()
    await iq.trigger('click')
    expect(wrapper.emitted('download')).toEqual([['iq']])
  })

  it('disables the IQ download as COPYING IQ… while the file is still copying', async () => {
    const wrapper = mountControls({ hasIqFile: true, iqFilePending: true })
    const iq = wrapper.find('.sdr-recording-iq')
    expect(iq.text()).toBe('COPYING IQ…')
    expect(iq.attributes('aria-label')).toBe('IQ still copying from the radio hub')
    expect(iq.attributes('title')).toBe('IQ still copying from the radio hub')
    expect(iq.attributes('disabled')).toBeDefined()
    await iq.trigger('click')
    expect(wrapper.emitted('download')).toBeUndefined()
  })

  it('keeps its clicks from reaching the row', async () => {
    const rowClicks: string[] = []
    const wrapper = mountControls({ hasIqFile: true })
    wrapper.element.parentElement!.addEventListener('click', () => rowClicks.push('row'))
    for (const button of wrapper.findAll('button')) await button.trigger('click')
    expect(rowClicks).toEqual([])
  })

  it('has no axe violations in each state', async () => {
    expect(await axe(mountControls().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(mountControls({ playing: true, hasIqFile: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
    expect(
      await axe(mountControls({ hasIqFile: true, iqFilePending: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
  })
})
