import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingsSection from './SdrRecordingsSection.vue'

enableAutoUnmount(afterEach)

// ── Audio element shims ───────────────────────────────────────────────────────
// jsdom does not implement HTMLMediaElement playback. Back currentTime/duration
// with per-instance WeakMaps so the component's seek/duration logic is testable,
// and stub play()/pause().
const currentTimeStore = new WeakMap<HTMLMediaElement, number>()
const durationStore = new WeakMap<HTMLMediaElement, number>()

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return currentTimeStore.get(this) ?? 0
    },
    set(this: HTMLMediaElement, value: number) {
      currentTimeStore.set(this, value)
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return durationStore.get(this) ?? NaN
    },
  })
})

let playSpy: ReturnType<typeof vi.fn<() => void>>
let pauseSpy: ReturnType<typeof vi.fn<() => void>>

// ── Fetch double ──────────────────────────────────────────────────────────────
interface Recording {
  id: number
  name: string
  notes: string
  frequency_hz: number
  mode: string
  duration_s: number
  file_size_bytes: number
  started_at: string
  has_iq_file: boolean
  radio_id: number | null
  radio_name: string
}

let recordingsPayload: Recording[]
let recordingsOk: boolean
let fetchOverride: ((url: string, opts?: RequestInit) => Promise<unknown>) | null
const fetchCalls: Array<{ url: string; opts?: RequestInit }> = []

function makeRec(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 1,
    name: 'rec1',
    notes: '',
    frequency_hz: 145_000_000,
    mode: 'NFM',
    duration_s: 60,
    file_size_bytes: 2048,
    started_at: '2026-06-11T10:30:45',
    has_iq_file: false,
    radio_id: 1,
    radio_name: 'rtl0',
    ...overrides,
  }
}

function defaultRouter(url: string): Promise<unknown> {
  if (url === '/api/sdr/recordings') {
    return Promise.resolve({ ok: recordingsOk, json: () => Promise.resolve(recordingsPayload) })
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
}

beforeEach(() => {
  recordingsPayload = []
  recordingsOk = true
  fetchOverride = null
  fetchCalls.length = 0
  playSpy = vi.fn()
  pauseSpy = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
    playSpy()
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    pauseSpy()
  })
  global.fetch = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
    fetchCalls.push({ url: String(url), opts })
    return (fetchOverride ?? defaultRouter)(String(url), opts)
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Mount helpers ─────────────────────────────────────────────────────────────
interface Props {
  liveRecording?: { frequency_hz: number; mode: string; startedAt: string } | null
  recSquelchOpen?: boolean
  liveElapsedS?: number
}

function mountSection(props: Props = {}): VueWrapper {
  return mount(SdrRecordingsSection, {
    props: { liveRecording: null, recSquelchOpen: false, liveElapsedS: 0, ...props },
  })
}

// Mount, then load recordings through the exposed reload() so the audio refs are
// registered.
async function mountWithRecordings(recs: Recording[], props: Props = {}): Promise<VueWrapper> {
  recordingsPayload = recs
  const wrapper = mountSection(props)
  await (wrapper.vm as unknown as { reload: () => Promise<void> }).reload()
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

// Click the play button of the i-th saved recording row.
async function clickPlay(wrapper: VueWrapper, rowIndex = 0): Promise<void> {
  await wrapper.findAll('.sdr-recording-play')[rowIndex].trigger('click')
  await wrapper.vm.$nextTick()
}

// =============================================================================
describe('SdrRecordingsSection — empty & loading', () => {
  it('shows the empty message when there are no recordings and nothing live', async () => {
    const wrapper = await mountWithRecordings([])
    expect(wrapper.find('#sdr-recordings-empty').text()).toBe('No recordings.')
  })

  it('reload requests the list with no-store and populates the rows', async () => {
    const wrapper = await mountWithRecordings([makeRec(), makeRec({ id: 2, name: 'rec2' })])
    expect(fetchCalls[0]).toMatchObject({
      url: '/api/sdr/recordings',
      opts: { cache: 'no-store' },
    })
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(2)
    expect(wrapper.find('#sdr-recordings-empty').exists()).toBe(false)
  })

  it('leaves recordings untouched when the list request is non-OK', async () => {
    recordingsOk = false
    const wrapper = await mountWithRecordings([makeRec()])
    // non-OK → recordings stays empty → empty message shows
    expect(wrapper.find('#sdr-recordings-empty').exists()).toBe(true)
  })

  it('swallows a rejected list fetch', async () => {
    fetchOverride = () => Promise.reject(new Error('offline'))
    const wrapper = mountSection()
    await expect(
      (wrapper.vm as unknown as { reload: () => Promise<void> }).reload(),
    ).resolves.toBeUndefined()
    expect(wrapper.find('#sdr-recordings-empty').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrRecordingsSection — row rendering & helpers', () => {
  it('renders the frequency readout, date, duration and size', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ frequency_hz: 145_800_000, duration_s: 95, file_size_bytes: 1_572_864 }),
    ])
    expect(wrapper.find('.sdr-recording-freq-num').text()).toBe('145.8000')
    const meta = wrapper.find('.sdr-recording-meta').text()
    expect(meta).toContain('2026-06-11 10:30') // started_at, T→space, sliced to 16
    expect(meta).toContain('1:35') // 95s → 1:35
    expect(meta).toContain('1.5 MB') // 1572864 bytes
  })

  it('renders an em-dash frequency and an em-dash date when fields are missing', async () => {
    const wrapper = await mountWithRecordings([makeRec({ frequency_hz: 0, started_at: '' })])
    expect(wrapper.find('.sdr-recording-freq-num').text()).toBe('—')
    expect(wrapper.find('.sdr-recording-meta').text()).toContain('—')
  })

  it('falls back to zero duration and size when those fields are missing', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 0, file_size_bytes: 0 })])
    const meta = wrapper.find('.sdr-recording-meta').text()
    expect(meta).toContain('0:00') // duration_s || 0 → fmtDuration(0)
    expect(meta).toContain('0 B') // file_size_bytes || 0 → fmtBytes(0)
  })

  it('formats byte sizes across B / KB / MB thresholds', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ id: 1, file_size_bytes: 512 }),
      makeRec({ id: 2, file_size_bytes: 2048 }),
      makeRec({ id: 3, file_size_bytes: 5_242_880 }),
    ])
    const sizes = wrapper.findAll('.sdr-recording-meta-row').map((row) => row.text())
    expect(sizes.some((text) => text.includes('512 B'))).toBe(true)
    expect(sizes.some((text) => text.includes('2.0 KB'))).toBe(true)
    expect(sizes.some((text) => text.includes('5.0 MB'))).toBe(true)
  })

  it('shows the mode suffix only when a recording has a mode', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ id: 1, mode: 'NFM' }),
      makeRec({ id: 2, mode: '' }),
    ])
    const modes = wrapper.findAll('.sdr-recording-freq-mode')
    expect(modes).toHaveLength(1)
    expect(modes[0].text()).toBe('- NFM')
  })

  it('shows the IQ download button only when the recording has an IQ file', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ id: 1, has_iq_file: true }),
      makeRec({ id: 2, has_iq_file: false }),
    ])
    expect(wrapper.findAll('.sdr-recording-iq')).toHaveLength(1)
  })

  describe('custom sub-name stripping', () => {
    it('shows a genuine custom name', async () => {
      const wrapper = await mountWithRecordings([makeRec({ name: 'My favourite pass' })])
      expect(wrapper.find('.sdr-recording-subname').text()).toBe('My favourite pass')
    })

    it('strips a legacy "Recording <date> <time>" prefix', async () => {
      const wrapper = await mountWithRecordings([
        makeRec({ name: 'Recording 2026-06-11 10:30 ALPHA' }),
      ])
      expect(wrapper.find('.sdr-recording-subname').text()).toBe('ALPHA')
    })

    it('strips a "<date> <time> ·" prefix', async () => {
      const wrapper = await mountWithRecordings([makeRec({ name: '2026-06-11 10:30 · BRAVO' })])
      expect(wrapper.find('.sdr-recording-subname').text()).toBe('BRAVO')
    })

    it('hides the sub-name for an auto-generated freq·mode name', async () => {
      const wrapper = await mountWithRecordings([makeRec({ name: '145.000 MHz · NFM' })])
      expect(wrapper.find('.sdr-recording-subname').exists()).toBe(false)
    })

    it('hides the sub-name when the name is empty', async () => {
      const wrapper = await mountWithRecordings([makeRec({ name: '' })])
      expect(wrapper.find('.sdr-recording-subname').exists()).toBe(false)
    })
  })

  it('shows a saved note when present and not editing', async () => {
    const wrapper = await mountWithRecordings([makeRec({ notes: 'strong signal' })])
    expect(wrapper.find('.sdr-recording-note-text').text()).toBe('strong signal')
  })
})

// =============================================================================
describe('SdrRecordingsSection — filtering', () => {
  function recs() {
    return [
      makeRec({ id: 1, name: 'Alpha', notes: 'clear', radio_name: 'rtl0', mode: 'NFM' }),
      makeRec({ id: 2, name: 'Bravo', notes: 'noisy', radio_name: 'airspy', mode: 'AM' }),
    ]
  }

  it('returns all recordings when the filter is empty', async () => {
    const wrapper = await mountWithRecordings(recs())
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(2)
  })

  it('filters by name, notes, radio name and mode (case-insensitive)', async () => {
    const wrapper = await mountWithRecordings(recs())
    const input = wrapper.find('.sdr-recordings-search-input')
    await input.setValue('alpha') // name
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(1)
    await input.setValue('noisy') // notes
    expect(wrapper.find('.sdr-recording-freq-mode').text()).toBe('- AM')
    await input.setValue('airspy') // radio_name
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(1)
    await input.setValue('nfm') // mode
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(1)
  })

  it('handles recordings with empty searchable fields without matching them', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ id: 1, name: '', notes: '', radio_name: '', mode: '' }),
    ])
    await wrapper.find('.sdr-recordings-search-input').setValue('zzz')
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(0)
    expect(wrapper.find('#sdr-recordings-empty').exists()).toBe(true)
  })

  it('clears the filter via the clear button', async () => {
    const wrapper = await mountWithRecordings(recs())
    const input = wrapper.find('.sdr-recordings-search-input')
    await input.setValue('alpha')
    expect(wrapper.find('.sdr-recordings-search-clear').exists()).toBe(true)
    await wrapper.find('.sdr-recordings-search-clear').trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('.sdr-recording-row')).toHaveLength(2)
  })
})

// =============================================================================
describe('SdrRecordingsSection — live recording row', () => {
  it('renders the live row with Recording status when the squelch is open', () => {
    const wrapper = mountSection({
      liveRecording: { frequency_hz: 145_500_000, mode: 'NFM', startedAt: '2026-06-11 10:30' },
      recSquelchOpen: true,
      liveElapsedS: 65,
    })
    const live = wrapper.find('.sdr-recording-live')
    expect(live.exists()).toBe(true)
    expect(live.find('.sdr-recording-live-status').text()).toContain('Recording')
    expect(live.find('.sdr-recording-live-dot--waiting').exists()).toBe(false)
    expect(live.find('.sdr-recording-freq-num').text()).toBe('145.5000')
    expect(live.text()).toContain('1:05') // duration 65s
  })

  it('renders the live row with Waiting status and the waiting dot when squelch is closed', () => {
    const wrapper = mountSection({
      liveRecording: { frequency_hz: 145_500_000, mode: '', startedAt: '2026-06-11 10:30' },
      recSquelchOpen: false,
      liveElapsedS: 0,
    })
    expect(wrapper.find('.sdr-recording-live-status').text()).toContain('Waiting')
    expect(wrapper.find('.sdr-recording-live-dot--waiting').exists()).toBe(true)
    // No mode → no mode suffix in the live row.
    expect(wrapper.find('.sdr-recording-live .sdr-recording-freq-mode').exists()).toBe(false)
  })

  it('emits stop-recording when the live STOP button is clicked', async () => {
    const wrapper = mountSection({
      liveRecording: { frequency_hz: 145_500_000, mode: 'NFM', startedAt: 'now' },
      recSquelchOpen: true,
      liveElapsedS: 1,
    })
    await wrapper.find('.sdr-recording-stop').trigger('click')
    expect(wrapper.emitted('stop-recording')).toHaveLength(1)
  })

  it('hides the empty message while a live recording is shown even with no saved rows', async () => {
    const wrapper = await mountWithRecordings([], {
      liveRecording: { frequency_hz: 1, mode: 'NFM', startedAt: 'now' },
    })
    expect(wrapper.find('#sdr-recordings-empty').exists()).toBe(false)
  })
})

// =============================================================================
describe('SdrRecordingsSection — playback', () => {
  it('starts playback, marks the row playing and emits playback-active', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await clickPlay(wrapper)
    expect(playSpy).toHaveBeenCalled()
    expect(wrapper.find('.sdr-recording-row').classes()).toContain('sdr-recording-playing')
    expect(wrapper.emitted('playback-active')).toEqual([[true]])
    expect(wrapper.find('.sdr-recording-progress').exists()).toBe(true)
  })

  it('stops playback when the same row is toggled again', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await clickPlay(wrapper) // start
    await clickPlay(wrapper) // stop
    expect(pauseSpy).toHaveBeenCalled()
    expect(wrapper.find('.sdr-recording-row').classes()).not.toContain('sdr-recording-playing')
    expect(wrapper.emitted('playback-active')).toEqual([[true], [false]])
  })

  it('switches playback to another row, pausing the previous, without re-emitting active', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 1 }), makeRec({ id: 2 })])
    await clickPlay(wrapper, 0)
    pauseSpy.mockClear()
    await clickPlay(wrapper, 1)
    expect(pauseSpy).toHaveBeenCalled() // previous paused
    expect(wrapper.findAll('.sdr-recording-row')[1].classes()).toContain('sdr-recording-playing')
    // null→id then id→id (still non-null) → only the first emit fires.
    expect(wrapper.emitted('playback-active')).toEqual([[true]])
  })

  it('seeds duration from audio metadata when already finite', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 60 })])
    const audio = wrapper.find('audio').element as HTMLAudioElement
    durationStore.set(audio, 123) // metadata already loaded & finite
    await clickPlay(wrapper)
    expect(wrapper.find('.sdr-recording-time').text()).toContain('/ 02:03') // 123s
  })

  it('falls back to the recorded duration_s when metadata is not finite', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 75 })])
    await clickPlay(wrapper) // duration NaN → falls back to 75s
    expect(wrapper.find('.sdr-recording-time').text()).toContain('/ 01:15')
  })

  it('updates duration on loadedmetadata once it becomes finite', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 10 })])
    await clickPlay(wrapper)
    const audio = wrapper.find('audio')
    durationStore.set(audio.element as HTMLAudioElement, 200)
    await audio.trigger('loadedmetadata')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-time').text()).toContain('/ 03:20')
  })

  it('ignores loadedmetadata for a row that is not the playing one', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 1 }), makeRec({ id: 2 })])
    await clickPlay(wrapper, 0)
    const otherAudio = wrapper.findAll('audio')[1]
    durationStore.set(otherAudio.element as HTMLAudioElement, 999)
    await otherAudio.trigger('loadedmetadata')
    await wrapper.vm.$nextTick()
    // Playing row 1 still reflects its own duration_s (60s), not 999.
    expect(wrapper.find('.sdr-recording-time').text()).toContain('/ 01:00')
  })

  it('advances the progress bar and time on timeupdate', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 100 })])
    await clickPlay(wrapper)
    const audio = wrapper.find('audio')
    const element = audio.element as HTMLAudioElement
    durationStore.set(element, 100)
    element.currentTime = 50
    await audio.trigger('timeupdate')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-time').text()).toContain('00:50')
    // 50% of 28 segments lit → 14
    expect(wrapper.findAll('.sdr-recording-seg--on')).toHaveLength(14)
  })

  it('revises the duration on timeupdate when a finite duration appears late', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 100 })])
    await clickPlay(wrapper) // recordingDuration seeded to 100 (duration_s)
    const audio = wrapper.find('audio')
    const element = audio.element as HTMLAudioElement
    durationStore.set(element, 250) // a longer finite duration revealed mid-play
    element.currentTime = 25
    await audio.trigger('timeupdate')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-time').text()).toContain('/ 04:10') // 250s
  })

  it('advances time without touching duration when metadata stays non-finite', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 80 })])
    await clickPlay(wrapper) // duration NaN → recordingDuration falls back to 80
    const audio = wrapper.find('audio')
    ;(audio.element as HTMLAudioElement).currentTime = 40 // durationStore left unset → NaN
    await audio.trigger('timeupdate')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-time').text()).toContain('00:40 / 01:20')
  })

  it('ignores timeupdate for a non-playing row', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 1 }), makeRec({ id: 2 })])
    await clickPlay(wrapper, 0)
    const otherAudio = wrapper.findAll('audio')[1]
    ;(otherAudio.element as HTMLAudioElement).currentTime = 30
    await otherAudio.trigger('timeupdate')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-time').text()).toContain('00:00 /')
  })

  it('resets when playback ends', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await clickPlay(wrapper)
    await wrapper.find('audio').trigger('ended')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-row').classes()).not.toContain('sdr-recording-playing')
    expect(wrapper.emitted('playback-active')).toEqual([[true], [false]])
  })

  it('ignores an ended event for a row that is not playing', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 1 }), makeRec({ id: 2 })])
    await clickPlay(wrapper, 0)
    await wrapper.findAll('audio')[1].trigger('ended')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sdr-recording-row')[0].classes()).toContain('sdr-recording-playing')
  })
})

// =============================================================================
describe('SdrRecordingsSection — seeking', () => {
  it('seeks to the clicked fraction of the block bar', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 100 })])
    const audio = wrapper.find('audio').element as HTMLAudioElement
    durationStore.set(audio, 100)
    await clickPlay(wrapper)
    const segments = wrapper.find('.sdr-recording-segments')
    vi.spyOn(segments.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      right: 200,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    await segments.trigger('click', { clientX: 100 }) // 50% → 50s
    expect(audio.currentTime).toBe(50)
    // The bar also stops mousedown propagation (so dragging doesn't bubble).
    await segments.trigger('mousedown')
    expect(wrapper.find('.sdr-recording-segments').exists()).toBe(true)
  })

  it('does not seek when nothing is playing', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await clickPlay(wrapper)
    const audio = wrapper.find('audio').element as HTMLAudioElement
    durationStore.set(audio, 100)
    // Stop playback → progress bar disappears; call the handler via a fresh play+stop.
    await clickPlay(wrapper) // stop
    // With nothing playing the progress bar isn't rendered, so seeking is unreachable
    // through the UI; assert the bar is gone.
    expect(wrapper.find('.sdr-recording-segments').exists()).toBe(false)
  })

  it('does not seek when the duration is zero', async () => {
    const wrapper = await mountWithRecordings([makeRec({ duration_s: 0 })])
    await clickPlay(wrapper) // duration 0 (NaN metadata, duration_s 0)
    const audio = wrapper.find('audio').element as HTMLAudioElement
    const segments = wrapper.find('.sdr-recording-segments')
    await segments.trigger('click', { clientX: 100 })
    expect(audio.currentTime).toBe(0) // unchanged — guard returned early
  })
})

// =============================================================================
describe('SdrRecordingsSection — download', () => {
  it('downloads the WAV with the recording name', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 5, name: 'pass5' })])
    const anchors: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = realCreate(tag)
      if (tag === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(() => {})
        anchors.push(element as HTMLAnchorElement)
      }
      return element
    })
    await wrapper.find('.sdr-recording-export').trigger('click')
    expect(anchors[0].href).toContain('/api/sdr/recordings/5/file')
    expect(anchors[0].download).toBe('pass5.wav')
  })

  it('downloads the IQ file with a .u8 extension', async () => {
    const wrapper = await mountWithRecordings([
      makeRec({ id: 6, name: 'pass6', has_iq_file: true }),
    ])
    const anchors: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = realCreate(tag)
      if (tag === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(() => {})
        anchors.push(element as HTMLAnchorElement)
      }
      return element
    })
    await wrapper.find('.sdr-recording-iq').trigger('click')
    expect(anchors[0].href).toContain('/api/sdr/recordings/6/iq')
    expect(anchors[0].download).toBe('pass6.u8')
  })
})

// =============================================================================
describe('SdrRecordingsSection — inline edit accordion', () => {
  it('opens the edit panel seeded with the recording note and focuses the textarea', async () => {
    const wrapper = await mountWithRecordings([makeRec({ notes: 'existing note' })])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.vm.$nextTick()
    const textarea = wrapper.find('.sdr-recording-edit-note')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('existing note')
    // Saved read-only note is hidden while editing.
    expect(wrapper.find('.sdr-recording-note-text').exists()).toBe(false)
  })

  it('toggles the edit panel closed when the pencil is clicked again', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(true)
    await wrapper.find('.sdr-recording-edit').trigger('click')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(false)
  })

  it('closes the panel via the CANCEL button', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.find('.sdr-recording-edit-cancel').trigger('click')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(false)
  })

  it('stops propagation of clicks inside the edit panel (stays open)', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.find('.sdr-recording-edit-panel').trigger('click')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(true)
  })

  it('closes the panel on Escape in the textarea', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.find('.sdr-recording-edit-note').trigger('keydown.esc')
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(false)
  })

  it('shows the NOTES label in the panel only when there is note text', async () => {
    const wrapper = await mountWithRecordings([makeRec({ notes: '' })])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.vm.$nextTick()
    // Empty note → no label inside the edit panel.
    expect(wrapper.find('.sdr-recording-edit-panel .sdr-recording-note-label').exists()).toBe(false)
    await wrapper.find('.sdr-recording-edit-note').setValue('typed note')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-edit-panel .sdr-recording-note-label').exists()).toBe(true)
  })

  it('saves the edited note via PATCH and reloads', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 9, name: 'rec9' })])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.find('.sdr-recording-edit-note').setValue('updated')
    fetchCalls.length = 0
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    await flushPromises()
    const patch = fetchCalls.find((call) => call.opts?.method === 'PATCH')
    expect(patch?.url).toBe('/api/sdr/recordings/9')
    expect(patch?.opts?.body).toBe(JSON.stringify({ name: 'rec9', notes: 'updated' }))
    // reload re-requested the list
    expect(fetchCalls.some((call) => call.url === '/api/sdr/recordings')).toBe(true)
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(false)
  })

  it('does not PATCH when the name would be empty', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 9, name: '' })])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    fetchCalls.length = 0
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    await flushPromises()
    expect(fetchCalls.some((call) => call.opts?.method === 'PATCH')).toBe(false)
  })

  it('swallows a rejected PATCH', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 9, name: 'rec9' })])
    await wrapper.find('.sdr-recording-edit').trigger('click')
    fetchOverride = (url, opts) =>
      opts?.method === 'PATCH' ? Promise.reject(new Error('fail')) : defaultRouter(url)
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    await flushPromises()
    // The panel stays open because the catch skipped closeEditAccordion.
    expect(wrapper.find('.sdr-recording-edit-panel').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrRecordingsSection — inline delete', () => {
  it('arms, confirms and DELETEs a recording, then reloads', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 4 })])
    await wrapper.find('.sdr-recording-del').trigger('click') // arm
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-del--confirm').exists()).toBe(true)
    fetchCalls.length = 0
    await wrapper.find('.sdr-recording-del--confirm').trigger('click')
    await flushPromises()
    const del = fetchCalls.find((call) => call.opts?.method === 'DELETE')
    expect(del?.url).toBe('/api/sdr/recordings/4')
    expect(fetchCalls.some((call) => call.url === '/api/sdr/recordings')).toBe(true)
  })

  it('cancels the armed delete', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 4 })])
    await wrapper.find('.sdr-recording-del').trigger('click') // arm
    await wrapper.vm.$nextTick()
    await wrapper.find('.sdr-recording-del--cancel').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-recording-del--confirm').exists()).toBe(false)
    expect(wrapper.find('.sdr-recording-del').exists()).toBe(true)
  })

  it('swallows a rejected DELETE', async () => {
    const wrapper = await mountWithRecordings([makeRec({ id: 4 })])
    await wrapper.find('.sdr-recording-del').trigger('click')
    await wrapper.vm.$nextTick()
    fetchOverride = (url, opts) =>
      opts?.method === 'DELETE' ? Promise.reject(new Error('fail')) : defaultRouter(url)
    await wrapper.find('.sdr-recording-del--confirm').trigger('click')
    await flushPromises()
    // The catch swallowed the rejection; the bin was disarmed (confirmDelId reset).
    expect(wrapper.find('.sdr-recording-del--confirm').exists()).toBe(false)
    expect(wrapper.find('.sdr-recording-del').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrRecordingsSection — scroll hint', () => {
  it('shows the hint when the list overflows and is not scrolled to the bottom', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    const wrap = wrapper.find('#sdr-recordings-list-wrap').element
    Object.defineProperty(wrap, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(wrap, 'clientHeight', { value: 100, configurable: true })
    Object.defineProperty(wrap, 'scrollTop', { value: 0, configurable: true, writable: true })
    await wrapper.find('#sdr-recordings-list-wrap').trigger('scroll')
    const hint = wrapper.find('#sdr-recordings-scroll-hint').element as HTMLElement
    expect(hint.style.display).toBe('flex')
  })

  it('hides the hint when scrolled to the bottom', async () => {
    const wrapper = await mountWithRecordings([makeRec()])
    const wrap = wrapper.find('#sdr-recordings-list-wrap').element
    Object.defineProperty(wrap, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(wrap, 'clientHeight', { value: 100, configurable: true })
    Object.defineProperty(wrap, 'scrollTop', { value: 400, configurable: true, writable: true })
    await wrapper.find('#sdr-recordings-list-wrap').trigger('scroll')
    const hint = wrapper.find('#sdr-recordings-scroll-hint').element as HTMLElement
    expect(hint.style.display).toBe('none')
  })
})

// =============================================================================
describe('SdrRecordingsSection — accessibility', () => {
  it('has no axe violations with rows, a live recording and an open editor', async () => {
    const wrapper = await mountWithRecordings(
      [makeRec({ id: 1, notes: 'a note', has_iq_file: true })],
      {
        liveRecording: { frequency_hz: 145_000_000, mode: 'NFM', startedAt: 'now' },
        recSquelchOpen: true,
      },
    )
    await wrapper.find('.sdr-recording-edit').trigger('click')
    await wrapper.vm.$nextTick()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
