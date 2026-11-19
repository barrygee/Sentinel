import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingMeta from './SdrRecordingMeta.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('SdrRecordingMeta', () => {
  const wrapperProps = { date: '2026-06-11 10:30', duration: '1:01', size: '1.9 MB' }

  it('labels each value as a description-list term', () => {
    const wrapper = mount(SdrRecordingMeta, { props: wrapperProps })
    const rows = wrapper
      .findAll('.sdr-recording-meta-row')
      .map((row) => [row.find('dt').text(), row.find('dd').text()])
    expect(rows).toEqual([
      ['Date', '2026-06-11 10:30'],
      ['Duration', '1:01'],
      ['Size', '1.9 MB'],
    ])
  })

  it('renders as a <dl>', () => {
    expect(mount(SdrRecordingMeta, { props: wrapperProps }).element.tagName).toBe('DL')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrRecordingMeta, { props: wrapperProps, attachTo: document.body })
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
