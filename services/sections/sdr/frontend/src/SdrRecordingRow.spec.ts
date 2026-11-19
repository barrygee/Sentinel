import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingRow from './SdrRecordingRow.vue'
import type { SdrRecording } from './sdrRecordings'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
})

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function makeRecording(overrides: Partial<SdrRecording> = {}): SdrRecording {
  return {
    id: 4,
    name: 'Recording 2026-06-11 10:30 · Tower',
    notes: 'Approach handover',
    frequency_hz: 118_700_000,
    mode: 'AM',
    duration_s: 61,
    file_size_bytes: 2_000_000,
    started_at: '2026-06-11T10:30:45',
    has_iq_file: true,
    radio_id: 1,
    radio_name: 'rtl0',
    ...overrides,
  }
}

interface RowProps {
  recording: SdrRecording
  editing: boolean
  focusEditorOnMount: boolean
  deleteArmed: boolean
  playing: boolean
  currentTimeSeconds: number
  durationSeconds: number
  noteDraft: string
  registerAudioElement: (element: HTMLAudioElement | null) => void
}

function mountRow(props: Partial<RowProps> = {}) {
  return mount(SdrRecordingRow, {
    props: {
      recording: makeRecording(),
      editing: false,
      focusEditorOnMount: false,
      deleteArmed: false,
      playing: false,
      currentTimeSeconds: 0,
      durationSeconds: 0,
      noteDraft: '',
      registerAudioElement: vi.fn(),
      ...props,
    },
    attachTo: document.body,
  })
}

describe('SdrRecordingRow — content', () => {
  it('shows the frequency and mode in the title', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.sdr-recording-freq-num').text()).toBe('118.7000')
    expect(wrapper.find('.sdr-recording-freq-mode').text()).toBe('- AM')
  })

  it('shows a dash for an unknown frequency', () => {
    expect(
      mountRow({ recording: makeRecording({ frequency_hz: 0 }) })
        .find('.sdr-recording-freq-num')
        .text(),
    ).toBe('—')
  })

  it('shows the custom name, stripped of auto-generated parts', () => {
    expect(mountRow().find('.sdr-recording-subname').text()).toBe('Tower')
  })

  it('shows no name line for an auto-generated name', () => {
    expect(
      mountRow({ recording: makeRecording({ name: '145.5 MHz · NFM' }) })
        .find('.sdr-recording-subname')
        .exists(),
    ).toBe(false)
  })

  it('shows the start, duration and size', () => {
    expect(
      mountRow()
        .findAll('dd')
        .map((value) => value.text()),
    ).toEqual(['2026-06-11 10:30', '1:01', '1.9 MB'])
  })

  it('shows placeholders for a recording with no start, duration or size', () => {
    const recording = makeRecording({
      started_at: '',
      duration_s: undefined as unknown as number,
      file_size_bytes: undefined as unknown as number,
    })
    expect(
      mountRow({ recording })
        .findAll('dd')
        .map((value) => value.text()),
    ).toEqual(['—', '0:00', '0 B'])
  })
})

describe('SdrRecordingRow — note and editor', () => {
  it('shows the saved note while not editing', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.sdr-recording-note-text').text()).toBe('Approach handover')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(false)
  })

  it('shows no note block when there is no note', () => {
    expect(
      mountRow({ recording: makeRecording({ notes: '' }) })
        .find('.sdr-recording-note')
        .exists(),
    ).toBe(false)
  })

  it('swaps the note for the editor, bound to the draft, while editing', async () => {
    const wrapper = mountRow({ editing: true, noteDraft: 'draft text' })
    expect(wrapper.find('.sdr-recording-note').exists()).toBe(false)
    const textarea = wrapper.find('textarea')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('draft text')
    await textarea.setValue('typed')
    expect(wrapper.emitted('update:noteDraft')).toEqual([['typed']])
  })

  it('passes the focus request to the editor and re-emits its report', () => {
    const wrapper = mountRow({ editing: true, focusEditorOnMount: true })
    expect(document.activeElement).toBe(wrapper.find('textarea').element)
    expect(wrapper.emitted('editorFocused')).toHaveLength(1)
  })

  it('does not focus the editor without a request', () => {
    const wrapper = mountRow({ editing: true, focusEditorOnMount: false })
    expect(document.activeElement).not.toBe(wrapper.find('textarea').element)
    expect(wrapper.emitted('editorFocused')).toBeUndefined()
  })

  it('re-emits the editor’s close (CANCEL and Escape) and save', async () => {
    const wrapper = mountRow({ editing: true })
    await wrapper.find('.sdr-recording-edit-cancel').trigger('click')
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    expect(wrapper.emitted('closeEdit')).toHaveLength(2)
    expect(wrapper.emitted('saveEdit')).toEqual([[]])
  })
})

describe('SdrRecordingRow — actions', () => {
  it('passes editing and armed state to the glyphs', () => {
    const wrapper = mountRow({ editing: true, deleteArmed: true })
    expect(wrapper.find('.sdr-recording-edit').classes()).toContain('sdr-recording-edit--active')
    expect(wrapper.find('.sdr-recording-del--confirm').exists()).toBe(true)
  })

  it('re-emits each glyph click', async () => {
    const wrapper = mountRow()
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.find('button[aria-label="Delete"]').trigger('click')
    await wrapper.setProps({ deleteArmed: true })
    await wrapper.find('button[aria-label="Confirm delete"]').trigger('click')
    await wrapper.find('button[aria-label="Cancel delete"]').trigger('click')
    expect(wrapper.emitted('toggleEdit')).toHaveLength(1)
    expect(wrapper.emitted('armDelete')).toHaveLength(1)
    expect(wrapper.emitted('confirmDelete')).toHaveLength(1)
    expect(wrapper.emitted('cancelDelete')).toHaveLength(1)
  })
})

describe('SdrRecordingRow — playback', () => {
  it('re-emits play clicks and shows the stop state while playing', async () => {
    const wrapper = mountRow()
    await wrapper.find('.sdr-recording-play').trigger('click')
    expect(wrapper.emitted('togglePlay')).toHaveLength(1)
    await wrapper.setProps({ playing: true })
    expect(wrapper.find('.sdr-recording-play').attributes('aria-label')).toBe('Stop')
    expect(wrapper.classes()).toContain('sdr-recording-playing')
  })

  it('shows the progress bar only while playing, fed the position', () => {
    expect(mountRow().find('.sdr-recording-progress').exists()).toBe(false)
    const playing = mountRow({ playing: true, currentTimeSeconds: 30, durationSeconds: 60 })
    expect(playing.find('.sdr-recording-time').text()).toBe('00:30 / 01:00')
    expect(playing.findAll('.sdr-recording-seg--on')).toHaveLength(14)
  })

  it('re-emits a seek with its fraction', async () => {
    const wrapper = mountRow({ playing: true, durationSeconds: 60 })
    const segments = wrapper.find('.sdr-recording-segments')
    segments.element.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect
    segments.element.dispatchEvent(new MouseEvent('click', { clientX: 40, bubbles: true }))
    expect(wrapper.emitted('seek')).toEqual([[0.4]])
  })

  it('passes the IQ state to the pills', () => {
    expect(
      mountRow({ recording: makeRecording({ has_iq_file: false }) })
        .find('.sdr-recording-iq')
        .exists(),
    ).toBe(false)
    const pending = mountRow({ recording: makeRecording({ iq_file_pending: true }) })
    expect(pending.find('.sdr-recording-iq').attributes('disabled')).toBeDefined()
    const landed = mountRow({ recording: makeRecording({ iq_file_pending: undefined }) })
    expect(landed.find('.sdr-recording-iq').attributes('disabled')).toBeUndefined()
  })

  it.each([
    [
      '.sdr-recording-export',
      '/api/sdr/recordings/4/file',
      'Recording 2026-06-11 10:30 · Tower.wav',
    ],
    ['.sdr-recording-iq', '/api/sdr/recordings/4/iq', 'Recording 2026-06-11 10:30 · Tower.u8'],
  ])('downloads from %s', async (selector, href, filename) => {
    const link = document.createElement('a')
    link.click = vi.fn()
    const wrapper = mountRow()
    vi.spyOn(document, 'createElement').mockReturnValue(link)
    await wrapper.find(selector).trigger('click')
    expect(link.getAttribute('href')).toBe(href)
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
  })
})

describe('SdrRecordingRow — audio element', () => {
  it('renders a hidden <audio> for the recording outside the content column', () => {
    const audio = mountRow().find('.sdr-recording-row > audio')
    expect(audio.attributes('src')).toBe('/api/sdr/recordings/4/file')
    expect(audio.attributes('style')).toContain('display: none')
  })

  it('registers the element on mount and unregisters it on unmount', () => {
    const registerAudioElement = vi.fn()
    const wrapper = mountRow({ registerAudioElement })
    const audio = wrapper.find('audio').element
    expect(registerAudioElement).toHaveBeenCalledWith(audio)
    wrapper.unmount()
    expect(registerAudioElement).toHaveBeenLastCalledWith(null)
  })

  it.each([
    ['loadedmetadata', 'audioMetadata'],
    ['timeupdate', 'audioTimeUpdate'],
    ['ended', 'audioEnded'],
  ])('re-emits the element’s %s as %s', async (domEvent, emitted) => {
    const wrapper = mountRow()
    await wrapper.find('audio').trigger(domEvent)
    expect(wrapper.emitted(emitted)).toHaveLength(1)
  })
})

describe('SdrRecordingRow — accessibility', () => {
  // axe over a whole row is slow on a loaded machine; give it room.
  const AXE_TIMEOUT_MS = 60000

  it(
    'has no axe violations at rest',
    async () => {
      expect(await axe(mountRow().html(), AXE_OPTIONS)).toHaveNoViolations()
    },
    AXE_TIMEOUT_MS,
  )

  it(
    'has no axe violations editing, armed and playing',
    async () => {
      const wrapper = mountRow({
        editing: true,
        deleteArmed: true,
        playing: true,
        durationSeconds: 60,
      })
      expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
    },
    AXE_TIMEOUT_MS,
  )
})
