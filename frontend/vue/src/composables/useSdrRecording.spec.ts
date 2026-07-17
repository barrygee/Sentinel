import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useSdrRecording, type UseSdrRecordingOptions } from './useSdrRecording'
import type { SdrRadio } from '@/stores/sdr'

function makeRadio(overrides: Partial<SdrRadio> = {}): SdrRadio {
  return {
    id: 1,
    name: 'RTL-SDR #1',
    host: 'localhost',
    port: 1234,
    enabled: true,
    ...overrides,
  } as SdrRadio
}

function createHarness(overrides: Partial<UseSdrRecordingOptions> = {}) {
  const startAudioRecording = vi.fn().mockResolvedValue(7)
  const stopAudioRecording = vi.fn().mockResolvedValue(null)
  const reloadRecordings = vi.fn().mockResolvedValue(undefined)
  const options: UseSdrRecordingOptions = {
    selectedRadioId: ref<number | null>(1),
    knownRadios: ref<SdrRadio[]>([makeRadio()]),
    currentFreqHz: ref(100_000_000),
    currentMode: ref('NFM'),
    gainDb: ref(30),
    squelch: ref(-120), // squelch wide open by default → no pause at start
    startAudioRecording,
    stopAudioRecording,
    reloadRecordings,
    ...overrides,
  }
  const recording = useSdrRecording(options)
  return { options, recording, startAudioRecording, stopAudioRecording, reloadRecordings }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useSdrRecording — startRecording', () => {
  it('starts a recording with metadata built from the live tune', async () => {
    const { recording, startAudioRecording } = createHarness()
    const started = await recording.startRecording()
    expect(started).toBe(true)
    expect(startAudioRecording).toHaveBeenCalledWith({
      radio_id: 1,
      radio_name: 'RTL-SDR #1',
      frequency_hz: 100_000_000,
      mode: 'NFM',
      gain_db: 30,
      squelch_dbfs: -120,
      sample_rate: 2048000,
    })
    expect(recording.isRecording.value).toBe(true)
    expect(recording.liveRecording.value).toMatchObject({ frequency_hz: 100_000_000, mode: 'NFM' })
    expect(recording.liveElapsedS.value).toBe(0)
    // Squelch is wide open (-120 ≤ -119), so the timer is not paused at start.
    expect(recording.recSquelchOpen.value).toBe(true)
  })

  it('reports failure (and stays idle) when the audio worklet declines to record', async () => {
    const { recording, startAudioRecording } = createHarness({
      startAudioRecording: vi.fn().mockResolvedValue(null),
    })
    void startAudioRecording
    const started = await recording.startRecording()
    expect(started).toBe(false)
    expect(recording.isRecording.value).toBe(false)
    expect(recording.liveRecording.value).toBeNull()
  })

  it('records without a radio name when no radio is selected', async () => {
    const { recording, startAudioRecording } = createHarness({
      selectedRadioId: ref<number | null>(null),
    })
    await recording.startRecording()
    expect(startAudioRecording).toHaveBeenCalledWith(
      expect.objectContaining({ radio_id: null, radio_name: '' }),
    )
  })

  it('starts squelch-paused when an active squelch threshold is set', async () => {
    const { recording } = createHarness({ squelch: ref(-30) })
    await recording.startRecording()
    expect(recording.recSquelchOpen.value).toBe(false)
  })

  it('ticks the live elapsed-seconds display once per second', async () => {
    vi.useFakeTimers()
    const { recording } = createHarness()
    await recording.startRecording()
    vi.advanceTimersByTime(3000)
    expect(recording.liveElapsedS.value).toBe(3)
  })

  it('excludes squelch-paused stretches from the elapsed display', async () => {
    vi.useFakeTimers()
    const { recording } = createHarness()
    await recording.startRecording()
    vi.advanceTimersByTime(2000) // 2s audible
    recording.onRecordingSquelchChange(false) // squelch closes → pause
    vi.advanceTimersByTime(5000) // 5s squelched (not counted)
    recording.onRecordingSquelchChange(true) // squelch opens → resume
    vi.advanceTimersByTime(1000) // 1s audible
    expect(recording.liveElapsedS.value).toBe(3)
  })
})

describe('useSdrRecording — stop / toggle / manual-change', () => {
  it('stopRecordingIfActive finalises the clip and reloads the recordings list twice', async () => {
    vi.useFakeTimers()
    const { recording, stopAudioRecording, reloadRecordings } = createHarness()
    await recording.startRecording()
    await recording.stopRecordingIfActive()
    expect(recording.isRecording.value).toBe(false)
    expect(recording.liveRecording.value).toBeNull()
    expect(stopAudioRecording).toHaveBeenCalledWith({ frequency_hz: 100_000_000, mode: 'NFM' })
    expect(reloadRecordings).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000) // the delayed re-reload picks up the finalised clip
    expect(reloadRecordings).toHaveBeenCalledTimes(2)
  })

  it('stopRecordingIfActive is a no-op while idle', async () => {
    const { recording, stopAudioRecording } = createHarness()
    await recording.stopRecordingIfActive()
    expect(stopAudioRecording).not.toHaveBeenCalled()
  })

  it('toggleRecording starts when idle and stops when recording', async () => {
    const { recording, startAudioRecording, stopAudioRecording } = createHarness()
    await recording.toggleRecording()
    expect(startAudioRecording).toHaveBeenCalledTimes(1)
    expect(recording.isRecording.value).toBe(true)
    await recording.toggleRecording()
    expect(stopAudioRecording).toHaveBeenCalledTimes(1)
    expect(recording.isRecording.value).toBe(false)
  })

  it('endRecordingOnManualChange stops an in-progress recording', async () => {
    const { recording, stopAudioRecording } = createHarness()
    await recording.startRecording()
    recording.endRecordingOnManualChange()
    await flushPromises()
    expect(stopAudioRecording).toHaveBeenCalledTimes(1)
    expect(recording.isRecording.value).toBe(false)
  })

  it('endRecordingOnManualChange is a no-op while idle', async () => {
    const { recording, stopAudioRecording } = createHarness()
    recording.endRecordingOnManualChange()
    await flushPromises()
    expect(stopAudioRecording).not.toHaveBeenCalled()
  })
})

describe('useSdrRecording — squelch pause accounting', () => {
  it('ignores squelch changes while not recording', () => {
    const { recording } = createHarness()
    recording.onRecordingSquelchChange(false)
    expect(recording.recSquelchOpen.value).toBe(true) // untouched
  })

  it('leaves state alone when squelch reports the current open state again', async () => {
    const { recording } = createHarness()
    await recording.startRecording()
    recording.onRecordingSquelchChange(true) // already open — neither arm taken
    expect(recording.recSquelchOpen.value).toBe(true)
  })

  it('leaves state alone when squelch reports the current closed state again', async () => {
    const { recording } = createHarness({ squelch: ref(-30) })
    await recording.startRecording()
    expect(recording.recSquelchOpen.value).toBe(false)
    recording.onRecordingSquelchChange(false) // already closed — neither arm taken
    expect(recording.recSquelchOpen.value).toBe(false)
  })
})

describe('useSdrRecording — unmount cleanup', () => {
  it('clearLiveRecordingTimer stops the elapsed ticker without ending the recording', async () => {
    vi.useFakeTimers()
    const { recording } = createHarness()
    await recording.startRecording()
    vi.advanceTimersByTime(2000)
    expect(recording.liveElapsedS.value).toBe(2)
    recording.clearLiveRecordingTimer()
    vi.advanceTimersByTime(5000)
    expect(recording.liveElapsedS.value).toBe(2) // ticker stopped
    expect(recording.isRecording.value).toBe(true) // recording state survives
  })

  it('clearLiveRecordingTimer is a no-op when no timer is running', () => {
    const { recording } = createHarness()
    expect(() => recording.clearLiveRecordingTimer()).not.toThrow()
  })
})
