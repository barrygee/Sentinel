import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingNote from './SdrRecordingNote.vue'

enableAutoUnmount(afterEach)

describe('SdrRecordingNote', () => {
  it('shows the note under a NOTES caption', () => {
    const wrapper = mount(SdrRecordingNote, { props: { notes: 'Coastguard call' } })
    expect(wrapper.find('.sdr-recording-note-label').text()).toBe('NOTES')
    expect(wrapper.find('.sdr-recording-note-text').text()).toBe('Coastguard call')
  })

  it('renders the note as text, never as markup', () => {
    const wrapper = mount(SdrRecordingNote, { props: { notes: '<b>bold</b>' } })
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.find('.sdr-recording-note-text').text()).toBe('<b>bold</b>')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrRecordingNote, { props: { notes: 'n' }, attachTo: document.body })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
