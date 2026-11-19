import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  LIVE_RECORDING_BYTES_PER_SECOND,
  downloadRecording,
  formatPlaybackClock,
  formatRecordingDuration,
  formatRecordingSize,
  recordingAudioUrl,
  recordingCustomName,
  recordingFrequencyNumber,
  recordingStartedLabel,
  type SdrRecording,
} from './sdrRecordings'

function makeRecording(overrides: Partial<SdrRecording> = {}): SdrRecording {
  return {
    id: 7,
    name: 'Tower',
    notes: '',
    frequency_hz: 118_700_000,
    mode: 'AM',
    duration_s: 10,
    file_size_bytes: 100,
    started_at: '2026-06-11T10:30:45',
    has_iq_file: false,
    radio_id: 1,
    radio_name: 'rtl0',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LIVE_RECORDING_BYTES_PER_SECOND', () => {
  it('is the byte rate of a 48 kHz 16-bit mono WAV', () => {
    expect(LIVE_RECORDING_BYTES_PER_SECOND).toBe(48000 * 2)
  })
})

describe('recordingFrequencyNumber', () => {
  it.each([
    [118_700_000, '118.7000'],
    [446_006_250, '446.0063'],
    [1, '0.0000'],
  ])('formats %d Hz as %s MHz to four decimals', (frequencyHz, expected) => {
    expect(recordingFrequencyNumber(frequencyHz)).toBe(expected)
  })

  it('shows a dash when the frequency is unknown (0)', () => {
    expect(recordingFrequencyNumber(0)).toBe('—')
  })
})

describe('recordingCustomName', () => {
  it.each([
    ['Tower', 'Tower'],
    ['  Tower  ', 'Tower'],
    ['Recording 2026-06-11 10:30 · Tower', 'Tower'],
    ['recording Tower', 'Tower'],
    ['2026-06-11T10:30 · Tower', 'Tower'],
    ['2026-06-11 10:30Tower', 'Tower'],
    ['Recording 2026-06-11 10:30', ''],
    ['145.5 MHz · NFM', ''],
    ['145 mhz', ''],
    ['145.5 MHz · NFM extra', '145.5 MHz · NFM extra'],
    ['', ''],
  ])('turns %j into %j', (name, expected) => {
    expect(recordingCustomName(makeRecording({ name }))).toBe(expected)
  })

  it('treats a missing name as empty', () => {
    expect(recordingCustomName(makeRecording({ name: undefined as unknown as string }))).toBe('')
  })
})

describe('recordingStartedLabel', () => {
  it('drops the T and the seconds', () => {
    expect(recordingStartedLabel('2026-06-11T10:30:45')).toBe('2026-06-11 10:30')
  })

  it('shows a dash when there is no start time', () => {
    expect(recordingStartedLabel('')).toBe('—')
  })
})

describe('formatRecordingDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59.4, '0:59'],
    [61, '1:01'],
    [600, '10:00'],
  ])('formats %d s as %s', (seconds, expected) => {
    expect(formatRecordingDuration(seconds)).toBe(expected)
  })

  it('rounds the seconds (not floors)', () => {
    expect(formatRecordingDuration(5.6)).toBe('0:06')
  })
})

describe('formatRecordingSize', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048575, '1024.0 KB'],
    [1048576, '1.0 MB'],
    [7_200_000, '6.9 MB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatRecordingSize(bytes)).toBe(expected)
  })
})

describe('formatPlaybackClock', () => {
  it.each([
    [0, '00:00'],
    [9.9, '00:09'],
    [61, '01:01'],
    [3599, '59:59'],
    [6000, '100:00'],
  ])('formats %d s as %s, seconds floored', (seconds, expected) => {
    expect(formatPlaybackClock(seconds)).toBe(expected)
  })
})

describe('recordingAudioUrl', () => {
  it('points at the recording file endpoint', () => {
    expect(recordingAudioUrl(42)).toBe('/api/sdr/recordings/42/file')
  })
})

describe('downloadRecording', () => {
  function captureLink(): { link: HTMLAnchorElement; click: ReturnType<typeof vi.fn> } {
    const link = document.createElement('a')
    const click = vi.fn()
    link.click = click
    vi.spyOn(document, 'createElement').mockReturnValue(link)
    return { link, click }
  }

  it('saves the WAV as <name>.wav', () => {
    const { link, click } = captureLink()
    downloadRecording(makeRecording({ id: 3, name: 'Tower' }), 'wav')
    expect(link.getAttribute('href')).toBe('/api/sdr/recordings/3/file')
    expect(link.download).toBe('Tower.wav')
    expect(click).toHaveBeenCalledOnce()
  })

  it('saves the raw IQ as <name>.u8', () => {
    const { link, click } = captureLink()
    downloadRecording(makeRecording({ id: 3, name: 'Tower' }), 'iq')
    expect(link.getAttribute('href')).toBe('/api/sdr/recordings/3/iq')
    expect(link.download).toBe('Tower.u8')
    expect(click).toHaveBeenCalledOnce()
  })
})
