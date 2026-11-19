import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingNoteLabel from './SdrRecordingNoteLabel.vue'

enableAutoUnmount(afterEach)

describe('SdrRecordingNoteLabel', () => {
  it('captions a note "NOTES"', () => {
    const wrapper = mount(SdrRecordingNoteLabel)
    expect(wrapper.text()).toBe('NOTES')
    expect(wrapper.classes()).toEqual(['sdr-recording-note-label'])
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrRecordingNoteLabel, { attachTo: document.body })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
