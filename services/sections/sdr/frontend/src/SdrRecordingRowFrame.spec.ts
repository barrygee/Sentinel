import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingRowFrame from './SdrRecordingRowFrame.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountFrame(props: { playing?: boolean } = {}, attrs: Record<string, string> = {}) {
  return mount(SdrRecordingRowFrame, {
    props,
    attrs,
    slots: {
      default: '<span class="inside">content</span>',
      'after-content': '<audio class="outside"></audio>',
    },
    attachTo: document.body,
  })
}

describe('SdrRecordingRowFrame', () => {
  it('puts the default slot inside the padded content column', () => {
    const wrapper = mountFrame()
    expect(wrapper.find('.sdr-recording-row > .sdr-recording-content > .inside').exists()).toBe(
      true,
    )
  })

  it('puts the after-content slot beside the content column, outside its padding', () => {
    const wrapper = mountFrame()
    expect(wrapper.find('.sdr-recording-row > audio.outside').exists()).toBe(true)
    expect(wrapper.find('.sdr-recording-content audio').exists()).toBe(false)
  })

  it('tints the row only while playing', () => {
    expect(mountFrame().classes()).not.toContain('sdr-recording-playing')
    expect(mountFrame({ playing: false }).classes()).not.toContain('sdr-recording-playing')
    expect(mountFrame({ playing: true }).classes()).toContain('sdr-recording-playing')
  })

  it('merges a class from the parent onto its root', () => {
    expect(mountFrame({}, { class: 'sdr-recording-live' }).classes()).toEqual([
      'sdr-recording-row',
      'sdr-recording-live',
    ])
  })

  it('renders nothing extra without slot content', () => {
    const wrapper = mount(SdrRecordingRowFrame)
    expect(wrapper.find('.sdr-recording-content').text()).toBe('')
    expect(wrapper.element.children).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    expect(await axe(mountFrame({ playing: true }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
