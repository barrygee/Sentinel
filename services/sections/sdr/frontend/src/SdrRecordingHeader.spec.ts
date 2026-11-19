import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingHeader from './SdrRecordingHeader.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountHeader(frequencyNumber = '118.7000', mode = 'AM', trailing = '') {
  return mount(SdrRecordingHeader, {
    props: { frequencyNumber, mode },
    slots: trailing ? { default: trailing } : {},
    attachTo: document.body,
  })
}

describe('SdrRecordingHeader', () => {
  it('shows the frequency number, the MHz unit and the mode', () => {
    const wrapper = mountHeader('118.7000', 'AM')
    expect(wrapper.find('.sdr-recording-freq-num').text()).toBe('118.7000')
    expect(wrapper.find('.sdr-recording-freq-unit').text()).toBe('MHz')
    expect(wrapper.find('.sdr-recording-freq-mode').text()).toBe('- AM')
  })

  it('leaves the mode out when there is none', () => {
    expect(mountHeader('—', '').find('.sdr-recording-freq-mode').exists()).toBe(false)
  })

  it('puts the default slot after the frequency, inside the title line', () => {
    const wrapper = mountHeader('1.0000', 'FM', '<span class="trailing">x</span>')
    const children = [...wrapper.element.children].map((child) => child.className)
    expect(children).toEqual(['sdr-recording-freq', 'trailing'])
  })

  it('has no axe violations', async () => {
    expect(await axe(mountHeader().html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
