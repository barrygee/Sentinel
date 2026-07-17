import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useSdrAutoTune, type UseSdrAutoTuneOptions } from './useSdrAutoTune'
import { defaultBwHz } from '@/components/sdr/sdrPanelUtils'
import type { useNotificationsStore } from '@/stores/notifications'
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

function aosEvent(detail: Record<string, unknown> | undefined): Event {
  return new CustomEvent('sentinel:sdr-tune-external', { detail })
}

function losEvent(detail: Record<string, unknown> | undefined): Event {
  return new CustomEvent('sentinel:sdr-tune-restore', { detail })
}

function createHarness(overrides: Partial<UseSdrAutoTuneOptions> = {}) {
  const addNotification = vi.fn()
  const sendCmd = vi.fn()
  const saveSettings = vi.fn()
  const stop = vi.fn()
  const selectRadio = vi.fn()
  const startRecording = vi.fn().mockResolvedValue(true)
  const stopRecordingIfActive = vi.fn().mockResolvedValue(undefined)
  const sdrAudio = {
    initAudio: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn(),
    setBandwidthHz: vi.fn(),
  }
  const isSocketOpen = vi.fn(() => false)
  const isSocketConnecting = vi.fn(() => false)
  const playing = ref(false)
  const setPlayingState = vi.fn((on: boolean) => {
    playing.value = on
  })
  const options: UseSdrAutoTuneOptions = {
    notificationsStore: () =>
      ({ add: addNotification }) as unknown as ReturnType<typeof useNotificationsStore>,
    playing,
    currentFreqHz: ref(145_000_000),
    currentMode: ref('AM'),
    freqInputVal: ref('145.0000'),
    activeFreqDisplay: ref('145.000 MHz'),
    bwHz: ref(10_000),
    selectedRadioId: ref<number | null>(null),
    knownRadios: ref<SdrRadio[]>([makeRadio()]),
    scanActive: ref(false),
    searchActive: ref(false),
    isRecording: ref(false),
    sdrAudio,
    sendCmd,
    saveSettings,
    setPlayingState,
    stop,
    selectRadio,
    startRecording,
    stopRecordingIfActive,
    isSocketOpen,
    isSocketConnecting,
    ...overrides,
  }
  const autoTune = useSdrAutoTune(options)
  return {
    options,
    autoTune,
    addNotification,
    sendCmd,
    saveSettings,
    setPlayingState,
    stop,
    selectRadio,
    startRecording,
    stopRecordingIfActive,
    sdrAudio,
    isSocketOpen,
    isSocketConnecting,
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSdrAutoTune — AOS while already playing', () => {
  function playingHarness() {
    return createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
    })
  }

  it('retunes the running radio to the downlink and notifies', () => {
    const harness = playingHarness()
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, mode: 'FM', satName: 'NOAA 19', noradId: '33591', token: 'p1' }),
    )
    expect(harness.options.currentFreqHz.value).toBe(137_100_000)
    expect(harness.options.currentMode.value).toBe('NFM') // FM coerced to narrowband
    expect(harness.options.freqInputVal.value).toBe('137.1000')
    expect(harness.sdrAudio.setMode).toHaveBeenCalledWith('NFM')
    expect(harness.options.bwHz.value).toBe(defaultBwHz('NFM'))
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 137_100_000 })
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'mode', mode: 'NFM' })
    expect(sessionStorage.getItem('sdrLastFreqHz')).toBe('137100000')
    expect(sessionStorage.getItem('sdrLastMode')).toBe('NFM')
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'autotune', title: 'NOAA 19 AUTO-TUNED' }),
    )
  })

  it('coerces unknown downlink modes to NFM and passes real ones through', () => {
    const modeCases: Array<[string | undefined, string]> = [
      ['WFM', 'WFM'],
      ['AM', 'AM'],
      ['USB', 'USB'],
      ['LSB', 'LSB'],
      ['CW', 'CW'],
      ['FSK9k6', 'NFM'],
      [undefined, 'NFM'],
    ]
    for (const [downlinkMode, expectedMode] of modeCases) {
      const harness = playingHarness()
      harness.autoTune.onExternalTune(
        aosEvent({ hz: 137_100_000, mode: downlinkMode, token: 'p1' }),
      )
      expect(harness.options.currentMode.value).toBe(expectedMode)
    }
  })

  it('ignores an event without a frequency', () => {
    const harness = playingHarness()
    harness.autoTune.onExternalTune(aosEvent(undefined))
    harness.autoTune.onExternalTune(aosEvent({ hz: 0 }))
    expect(harness.sendCmd).not.toHaveBeenCalled()
    expect(harness.addNotification).not.toHaveBeenCalled()
  })

  it('skips a later overlapping pass while an earlier one holds the radio', () => {
    const harness = playingHarness()
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1' }))
    harness.sendCmd.mockClear()
    harness.autoTune.onExternalTune(aosEvent({ hz: 145_800_000, satName: 'ISS', token: 'p2' }))
    expect(harness.sendCmd).not.toHaveBeenCalled() // not retuned
    expect(harness.options.currentFreqHz.value).toBe(137_100_000)
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'ISS PASS SKIPPED' }),
    )
  })

  it('lets a manual retune release the lock so the next pass takes over', () => {
    const harness = playingHarness()
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1' }))
    harness.options.currentFreqHz.value = 100_000_000 // user retuned away
    harness.autoTune.onExternalTune(aosEvent({ hz: 145_800_000, satName: 'ISS', token: 'p2' }))
    expect(harness.options.currentFreqHz.value).toBe(145_800_000)
  })

  it('auto-starts a recording when the pass requests it', async () => {
    const harness = playingHarness()
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1', record: true }),
    )
    await flushPromises()
    expect(harness.startRecording).toHaveBeenCalledTimes(1)
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'NOAA 19 RECORDING' }),
    )
  })

  it('leaves a manual recording alone instead of taking it over', async () => {
    const harness = createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
      isRecording: ref(true),
    })
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1', record: true }),
    )
    await flushPromises()
    expect(harness.startRecording).not.toHaveBeenCalled()
  })

  it('does not announce a recording that failed to start', async () => {
    const harness = createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
      startRecording: vi.fn().mockResolvedValue(false),
    })
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1', record: true }),
    )
    await flushPromises()
    expect(harness.addNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'NOAA 19 RECORDING' }),
    )
  })
})

describe('useSdrAutoTune — AOS from stopped (hands-free start)', () => {
  it('notifies a failure when no radio is configured', () => {
    const harness = createHarness({ knownRadios: ref<SdrRadio[]>([]) })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19' }))
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system', title: 'NOAA 19 AUTO-TUNE' }),
    )
    expect(harness.selectRadio).not.toHaveBeenCalled()
  })

  it('ignores disabled radios when picking one', () => {
    const harness = createHarness({
      knownRadios: ref<SdrRadio[]>([makeRadio({ enabled: false })]),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19' }))
    expect(harness.selectRadio).not.toHaveBeenCalled()
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system' }),
    )
  })

  it('prefers the last-used radio from sessionStorage', () => {
    sessionStorage.setItem('sdrLastRadioId', '2')
    const harness = createHarness({
      knownRadios: ref<SdrRadio[]>([makeRadio(), makeRadio({ id: 2, name: 'RTL-SDR #2' })]),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000 }))
    expect(harness.selectRadio).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('queues the tune and lets selectRadio + the socket-open drain apply it', async () => {
    const harness = createHarness()
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, mode: 'FM', satName: 'NOAA 19', record: false }),
    )
    expect(harness.selectRadio).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(harness.sendCmd).not.toHaveBeenCalled() // still queued
    // The panel's selectRadio would set the id; simulate it, then the socket opens.
    harness.options.selectedRadioId.value = 1
    harness.autoTune.drainPendingExternalTune()
    await flushPromises()
    expect(harness.sdrAudio.initAudio).toHaveBeenCalledWith(1)
    expect(harness.setPlayingState).toHaveBeenCalledWith(true)
    expect(harness.saveSettings).toHaveBeenCalledTimes(1)
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 137_100_000 })
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'mode', mode: 'NFM' })
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'NOAA 19 AUTO-TUNED' }),
    )
  })

  it('applies immediately when the socket for the same radio is already open', async () => {
    const harness = createHarness({
      selectedRadioId: ref<number | null>(1),
      isSocketOpen: vi.fn(() => true),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000 }))
    await flushPromises()
    expect(harness.selectRadio).not.toHaveBeenCalled()
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 137_100_000 })
  })

  it('waits for a CONNECTING socket instead of re-selecting (open will drain)', () => {
    const harness = createHarness({
      selectedRadioId: ref<number | null>(1),
      isSocketConnecting: vi.fn(() => true),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000 }))
    expect(harness.selectRadio).not.toHaveBeenCalled()
    expect(harness.sendCmd).not.toHaveBeenCalled() // queued for the open handler
  })

  it('drainPendingExternalTune is a no-op with nothing queued', () => {
    const harness = createHarness()
    harness.autoTune.drainPendingExternalTune()
    expect(harness.sendCmd).not.toHaveBeenCalled()
  })

  it('records the pass on the hands-free path once audio is ready', async () => {
    const harness = createHarness({
      selectedRadioId: ref<number | null>(1),
      isSocketOpen: vi.fn(() => true),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19', record: true }))
    await flushPromises()
    expect(harness.startRecording).toHaveBeenCalledTimes(1)
  })
})

describe('useSdrAutoTune — LOS restore', () => {
  function tunedFromPlayingHarness() {
    const harness = createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
    })
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, mode: 'FM', satName: 'NOAA 19', token: 'p1' }),
    )
    harness.sendCmd.mockClear()
    harness.addNotification.mockClear()
    return harness
  }

  it('does nothing without a snapshot', () => {
    const harness = createHarness()
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1' }))
    expect(harness.stop).not.toHaveBeenCalled()
    expect(harness.sendCmd).not.toHaveBeenCalled()
  })

  it('ignores a stale LOS whose token no longer owns the snapshot', () => {
    const harness = tunedFromPlayingHarness()
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'other-pass' }))
    expect(harness.sendCmd).not.toHaveBeenCalled()
    // The owning pass's LOS still restores afterwards.
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1', satName: 'NOAA 19' }))
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 145_000_000 })
  })

  it('retunes back to the pre-AOS frequency/mode when it was playing before', () => {
    const harness = tunedFromPlayingHarness()
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1', satName: 'NOAA 19' }))
    expect(harness.options.currentFreqHz.value).toBe(145_000_000)
    expect(harness.options.currentMode.value).toBe('AM')
    expect(harness.sdrAudio.setMode).toHaveBeenCalledWith('AM')
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 145_000_000 })
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'mode', mode: 'AM' })
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'NOAA 19 PASS ENDED',
        detail: expect.stringContaining('Restored SDR'),
      }),
    )
  })

  it('stops playback when the radio was idle before AOS', async () => {
    const harness = createHarness({
      selectedRadioId: ref<number | null>(1),
      isSocketOpen: vi.fn(() => true),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1' }))
    await flushPromises() // hands-free start applied; playing is now true
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1', satName: 'NOAA 19' }))
    expect(harness.stop).toHaveBeenCalledTimes(1)
    expect(harness.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'NOAA 19 PASS ENDED',
        detail: 'Stopped SDR (was idle before pass)',
      }),
    )
  })

  it('leaves the radio alone when the user retuned away mid-pass', () => {
    const harness = tunedFromPlayingHarness()
    harness.options.currentFreqHz.value = 100_000_000 // manual retune
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1' }))
    expect(harness.sendCmd).not.toHaveBeenCalled()
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('leaves the radio alone when a sweep took over after the pass', () => {
    const harness = createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
      scanActive: ref(false),
    })
    harness.autoTune.onExternalTune(aosEvent({ hz: 137_100_000, token: 'p1' }))
    harness.sendCmd.mockClear()
    harness.options.scanActive.value = true
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1' }))
    expect(harness.sendCmd).not.toHaveBeenCalled()
  })

  it('finalises an auto-started recording at LOS even after a manual retune', async () => {
    const harness = createHarness({
      playing: ref(true),
      selectedRadioId: ref<number | null>(1),
    })
    harness.autoTune.onExternalTune(
      aosEvent({ hz: 137_100_000, satName: 'NOAA 19', token: 'p1', record: true }),
    )
    await flushPromises()
    harness.options.currentFreqHz.value = 100_000_000 // retuned away mid-pass
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1' }))
    expect(harness.stopRecordingIfActive).toHaveBeenCalledTimes(1)
    expect(harness.sendCmd).toHaveBeenCalledTimes(2) // only the AOS tune+mode, no restore
  })

  it('never stops a manual recording the user began (startedRecording unset)', () => {
    const harness = tunedFromPlayingHarness()
    harness.autoTune.onExternalTuneRestore(losEvent({ token: 'p1' }))
    expect(harness.stopRecordingIfActive).not.toHaveBeenCalled()
  })
})
