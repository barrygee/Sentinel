/**
 * The saved-recording shape the SDR section's `/api/sdr/recordings` returns,
 * the live recording the panel tracks while REC runs, and the pure helpers
 * the RECORDINGS tab's rows format them with.
 */

/** One saved recording, as `/api/sdr/recordings` lists it. */
export interface SdrRecording {
  id: number
  name: string
  notes: string
  frequency_hz: number
  mode: string
  duration_s: number
  file_size_bytes: number
  started_at: string
  has_iq_file: boolean
  /** True while the IQ is still being copied from the radio hub to the SDR section. */
  iq_file_pending?: boolean
  radio_id: number | null
  radio_name: string
}

/** The recording in progress (REC is on), shown pinned above the saved ones. */
export interface LiveRecording {
  frequency_hz: number
  mode: string
  startedAt: string
}

/** The file a recording's download fetches: its audio or its raw IQ. */
export type RecordingDownloadKind = 'wav' | 'iq'

/**
 * Bytes per second of the WAV being written (48 kHz, 16-bit mono), used to
 * estimate the live recording's size from its elapsed time.
 */
export const LIVE_RECORDING_BYTES_PER_SECOND = 96000

/** The recording's frequency as the big MHz readout, or "—" when unknown. */
export function recordingFrequencyNumber(frequencyHz: number): string {
  return frequencyHz ? (frequencyHz / 1e6).toFixed(4) : '—'
}

/**
 * A custom, user-given name, shown as a small sub-line under the frequency.
 * Strips any legacy auto-generated "Recording <date>" / "YYYY-MM-DD HH:MM ·"
 * or a bare "<freq> MHz · MODE", so only a real, meaningful name surfaces.
 */
export function recordingCustomName(recording: SdrRecording): string {
  return (recording.name || '')
    .replace(/^Recording\s+/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?:\s*·\s*)?/, '')
    .replace(/^\d+(?:\.\d+)?\s*MHz(?:\s*·\s*[A-Z]+)?$/i, '')
    .trim()
}

/** The start time as "YYYY-MM-DD HH:MM", or "—" when the recording has none. */
export function recordingStartedLabel(startedAt: string): string {
  return startedAt ? startedAt.replace('T', ' ').slice(0, 16) : '—'
}

/** A length in seconds as "M:SS" (seconds rounded). */
export function formatRecordingDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60),
    wholeSeconds = Math.round(seconds % 60)
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`
}

/** A size in bytes as B / KB / MB with one decimal. */
export function formatRecordingSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

/** A playback position in seconds as "MM:SS" (seconds floored). */
export function formatPlaybackClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60),
    wholeSeconds = Math.floor(seconds % 60)
  return String(minutes).padStart(2, '0') + ':' + String(wholeSeconds).padStart(2, '0')
}

/** Where a recording's audio is served (also the `<audio>` source). */
export function recordingAudioUrl(recordingId: number): string {
  return `/api/sdr/recordings/${recordingId}/file`
}

/** Saves a recording's WAV or raw IQ (`.u8`) through a throwaway link. */
export function downloadRecording(recording: SdrRecording, kind: RecordingDownloadKind): void {
  const link = document.createElement('a')
  link.href =
    kind === 'wav' ? recordingAudioUrl(recording.id) : `/api/sdr/recordings/${recording.id}/iq`
  link.download = `${recording.name}.${kind === 'wav' ? 'wav' : 'u8'}`
  link.click()
}
