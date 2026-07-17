import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useSdrFreqDigitWheel, type UseSdrFreqDigitWheelOptions } from './useSdrFreqDigitWheel'

// Give every element a measurable per-character width so the digit hit-test
// resolves (same technique as SdrPanel.spec.ts): each character is 10px wide,
// so clientX 25 lands on the third character of the measured string.
function mockCharWidths() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = (this.textContent ?? '').length * 10
    return {
      left: 0,
      top: 0,
      right: width,
      bottom: 12,
      width,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
  })
}

interface Harness {
  options: UseSdrFreqDigitWheelOptions
  onFreqWheel: (wheelEvent: WheelEvent) => void
  inputElement: HTMLInputElement
  sendCmd: ReturnType<typeof vi.fn>
  saveSettings: ReturnType<typeof vi.fn>
  endRecordingOnManualChange: ReturnType<typeof vi.fn>
}

function createHarness(overrides: Partial<UseSdrFreqDigitWheelOptions> = {}): Harness {
  const inputElement = document.createElement('input')
  document.body.appendChild(inputElement)
  const sendCmd = vi.fn()
  const saveSettings = vi.fn()
  const endRecordingOnManualChange = vi.fn()
  const options: UseSdrFreqDigitWheelOptions = {
    freqInputRef: ref<HTMLInputElement | null>(inputElement),
    currentFreqHz: ref(100_000_000),
    freqInputVal: ref('100.0000'),
    activeFreqDisplay: ref('100.000 MHz'),
    tuningDisabled: ref(false),
    scanActive: ref(false),
    playing: ref(true),
    selectedRadioId: ref<number | null>(1),
    endRecordingOnManualChange,
    sendCmd,
    saveSettings,
    ...overrides,
  }
  const { onFreqWheel } = useSdrFreqDigitWheel(options)
  return { options, onFreqWheel, inputElement, sendCmd, saveSettings, endRecordingOnManualChange }
}

// A wheel notch over a given x position. deltaY < 0 is scroll-up (step up).
function wheelAt(clientX: number, deltaY = -100): WheelEvent {
  return new WheelEvent('wheel', { deltaY, clientX })
}

beforeEach(() => {
  mockCharWidths()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('useSdrFreqDigitWheel', () => {
  it('steps the frequency by the place value of the digit under the cursor', () => {
    const harness = createHarness()
    // "100.0000": clientX 25 → index 2 → the 1-MHz digit.
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(101_000_000)
    expect(harness.options.freqInputVal.value).toBe('101.0000')
    expect(harness.options.activeFreqDisplay.value).toBe('101.000 MHz')
  })

  it('steps a decimal digit down by its sub-MHz place value', () => {
    const harness = createHarness()
    // "100.0000": clientX 45 → index 4 → the 0.1-MHz digit; scroll-down steps down.
    harness.onFreqWheel(wheelAt(45, +100))
    expect(harness.options.currentFreqHz.value).toBe(99_900_000)
    expect(harness.options.freqInputVal.value).toBe('99.9000')
  })

  it('commits the settled frequency to hardware after the 250ms debounce, coalescing notches', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const harness = createHarness()
    harness.onFreqWheel(wheelAt(25))
    harness.onFreqWheel(wheelAt(25)) // second notch re-arms the debounce
    expect(harness.sendCmd).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(harness.endRecordingOnManualChange).toHaveBeenCalledTimes(1)
    expect(harness.sendCmd).toHaveBeenCalledTimes(1)
    expect(harness.sendCmd).toHaveBeenCalledWith({ cmd: 'tune', frequency_hz: 102_000_000 })
    expect(sessionStorage.getItem('sdrLastFreqHz')).toBe('102000000')
    expect(harness.saveSettings).toHaveBeenCalledTimes(1)
  })

  it('updates the display live but schedules no hardware commit while not playing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const harness = createHarness({ playing: ref(false) })
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(101_000_000)
    vi.advanceTimersByTime(1000)
    expect(harness.sendCmd).not.toHaveBeenCalled()
    expect(harness.saveSettings).not.toHaveBeenCalled()
  })

  it('ignores the wheel while tuning is disabled (read-only follower / no radio)', () => {
    const harness = createHarness({ tuningDisabled: ref(true) })
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('ignores the wheel while a scan sweep owns the tuner', () => {
    const harness = createHarness({ scanActive: ref(true) })
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('does nothing when the frequency input element is not mounted', () => {
    const harness = createHarness({ freqInputRef: ref<HTMLInputElement | null>(null) })
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('does nothing while no frequency is tuned (currentFreqHz 0)', () => {
    const harness = createHarness({ currentFreqHz: ref(0) })
    harness.onFreqWheel(wheelAt(25))
    expect(harness.options.currentFreqHz.value).toBe(0)
    expect(harness.options.freqInputVal.value).toBe('100.0000')
  })

  it('ignores a wheel over the decimal point', () => {
    const harness = createHarness()
    // "100.0000": clientX 35 → index 3 → the '.' character.
    harness.onFreqWheel(wheelAt(35))
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('ignores a wheel beyond the last character (no digit under the cursor)', () => {
    const harness = createHarness()
    // "100.0000" is 8 chars → 80px; clientX 95 is past the end.
    harness.onFreqWheel(wheelAt(95))
    expect(harness.options.currentFreqHz.value).toBe(100_000_000)
  })

  it('creates the hidden measuring mirror once and reuses it across notches', () => {
    const harness = createHarness()
    harness.onFreqWheel(wheelAt(25)) // creates the mirror
    harness.onFreqWheel(wheelAt(25)) // reuses it
    const mirrors = Array.from(document.body.querySelectorAll('span')).filter(
      (candidateSpan) => candidateSpan.style.visibility === 'hidden',
    )
    expect(mirrors).toHaveLength(1)
  })
})
