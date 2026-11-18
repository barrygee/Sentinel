import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, reactive, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  WHEEL_COMMIT_DELAY_MS,
  WHEEL_STEP_FRACTION,
  useFrequencyDrag,
  type FrequencyDrag,
  type FrequencyTuningSource,
} from './useFrequencyDrag'

// A 1 MHz span drawn across a 1000 px data box (1100 px element minus 50 px
// gutters each side): 1 px = 1 kHz, so every pixel offset below reads as kHz.
const SPAN_START_HZ = 100_000_000
const SPAN_END_HZ = 101_000_000
const SPAN_CENTRE_HZ = 100_500_000
const INSET_LEFT_PX = 50
const INSET_RIGHT_PX = 50
const ELEMENT_WIDTH_PX = 1100
const ELEMENT_HEIGHT_PX = 200
// The frequency-label gutter is the bottom 20 px: y 180..200 is grabbable.
const INSET_BOTTOM_PX = 20
const GUTTER_TOP_PX = ELEMENT_HEIGHT_PX - INSET_BOTTOM_PX

// ── requestAnimationFrame under test control ────────────────────────────────
let pendingFrames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1
const requestFrame = vi.fn((callback: FrameRequestCallback) => {
  const frameId = nextFrameId++
  pendingFrames.set(frameId, callback)
  return frameId
})
const cancelFrame = vi.fn((frameId: number) => {
  pendingFrames.delete(frameId)
})
function runFrames(): void {
  const frames = [...pendingFrames.values()]
  pendingFrames = new Map()
  for (const frame of frames) frame(0)
}

type Source = FrequencyTuningSource & {
  playing: boolean
  readOnly: boolean
  autoCenterWaterfallOnTune: boolean
  setTuningOffsetHz: Mock<(offsetHz: number) => void>
  requestTune: Mock<(freqHz: number, center?: boolean) => void>
}

interface Harness {
  drag: FrequencyDrag
  source: Source
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
  bandInsetBottomPx: Ref<number>
  livePanOffsetHz: Ref<number>
  applyView: Mock<() => void>
  snapToKnownFreqHz: Mock<(freqHz: number) => number>
  spectrum: HTMLElement
}

let mounted: VueWrapper[] = []

/** A spectrum element with fixed geometry (jsdom lays nothing out). */
function spectrumElement(left = 0, width = ELEMENT_WIDTH_PX): HTMLElement {
  const element = document.createElement('div')
  Object.defineProperty(element, 'clientWidth', { value: width })
  element.getBoundingClientRect = () =>
    ({
      left,
      top: 0,
      right: left + width,
      bottom: ELEMENT_HEIGHT_PX,
      width,
      height: ELEMENT_HEIGHT_PX,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  return element
}

/** Mounts the composable in a throwaway component (its document listeners need a lifecycle). */
function mountDrag(
  options: {
    playing?: boolean
    readOnly?: boolean
    autoCenter?: boolean
    spectrum?: HTMLElement
    /** Visible window as a fraction of the span [from, to]; default the whole span. */
    windowFraction?: [number, number]
  } = {},
): Harness {
  const source = reactive({
    playing: options.playing ?? true,
    readOnly: options.readOnly ?? false,
    autoCenterWaterfallOnTune: options.autoCenter ?? true,
    setTuningOffsetHz: vi.fn<(offsetHz: number) => void>(),
    requestTune: vi.fn<(freqHz: number, center?: boolean) => void>(),
  }) as Source
  const spanStartHz = ref(SPAN_START_HZ)
  const spanEndHz = ref(SPAN_END_HZ)
  const bandInsetBottomPx = ref(INSET_BOTTOM_PX)
  const livePanOffsetHz = ref(0)
  const applyView = vi.fn<() => void>()
  const snapToKnownFreqHz = vi.fn((freqHz: number) => freqHz)
  const spectrum = options.spectrum ?? spectrumElement()
  const [fromFraction, toFraction] = options.windowFraction ?? [0, 1]
  // Like the component's: a window inside the span, shifted by the live pan.
  const zoomWindowHz = (lo: number, hi: number) => ({
    winLo: lo + (hi - lo) * fromFraction + livePanOffsetHz.value,
    winHi: lo + (hi - lo) * toFraction + livePanOffsetHz.value,
  })
  let drag: FrequencyDrag | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        drag = useFrequencyDrag({
          source,
          spectrumElement: () => spectrum,
          spanStartHz,
          spanEndHz,
          bandInsetLeftPx: ref(INSET_LEFT_PX),
          bandInsetRightPx: ref(INSET_RIGHT_PX),
          bandInsetBottomPx,
          livePanOffsetHz,
          zoomWindowHz,
          snapToKnownFreqHz,
          applyView,
        })
        return () => null
      },
    }),
    { attachTo: document.body },
  )
  mounted.push(wrapper)
  return {
    drag: drag as FrequencyDrag,
    source,
    spanStartHz,
    spanEndHz,
    bandInsetBottomPx,
    livePanOffsetHz,
    applyView,
    snapToKnownFreqHz,
    spectrum,
  }
}

/** A press in the gutter at the given x. */
function gutterPoint(clientX: number) {
  return { clientX, clientY: GUTTER_TOP_PX + 5 }
}

function mouseMove(clientX: number): void {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX }))
}

function mouseUp(): void {
  document.dispatchEvent(new MouseEvent('mouseup'))
}

/** A touch event (jsdom has no Touch constructor) carrying the given touches. */
function touchEvent(type: string, touches: { clientX: number }[] = []): Event {
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'touches', { value: touches })
  return event
}

/** A wheel event double whose propagation calls can be inspected. */
function wheel(deltaY: number, deltaMode = 0) {
  return {
    deltaY,
    deltaMode,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as WheelEvent & { preventDefault: Mock; stopImmediatePropagation: Mock }
}

beforeEach(() => {
  pendingFrames = new Map()
  nextFrameId = 1
  requestFrame.mockClear()
  cancelFrame.mockClear()
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useFrequencyDrag — starting a gutter drag', () => {
  it('arms the pan for a press inside the frequency gutter', () => {
    const { drag } = mountDrag()
    expect(drag.isFreqDragActive()).toBe(false)
    expect(drag.freqDragging.value).toBe(false)

    expect(drag.tryStartFreqDrag(gutterPoint(300))).toBe(true)

    expect(drag.isFreqDragActive()).toBe(true)
    expect(drag.freqDragging.value).toBe(true)
  })

  it('arms on the gutter top edge itself', () => {
    const { drag } = mountDrag()
    expect(drag.tryStartFreqDrag({ clientX: 300, clientY: GUTTER_TOP_PX })).toBe(true)
  })

  it('leaves a press just above the gutter to click-to-tune', () => {
    const { drag } = mountDrag()
    expect(drag.tryStartFreqDrag({ clientX: 300, clientY: GUTTER_TOP_PX - 1 })).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
    expect(drag.freqDragging.value).toBe(false)
  })

  it('has no gutter to grab before the spectrum has measured one', () => {
    const { drag, bandInsetBottomPx } = mountDrag()
    bandInsetBottomPx.value = 0
    // y 200 would be inside a zero-height gutter starting at the bottom edge.
    expect(drag.tryStartFreqDrag({ clientX: 300, clientY: ELEMENT_HEIGHT_PX })).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
  })

  it('never pans while the radio is stopped', () => {
    const { drag } = mountDrag({ playing: false })
    expect(drag.tryStartFreqDrag(gutterPoint(300))).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
  })

  it('never pans on a read-only follower', () => {
    const { drag } = mountDrag({ readOnly: true })
    expect(drag.tryStartFreqDrag(gutterPoint(300))).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
  })

  it('never pans before a span has arrived', () => {
    const { drag, spanEndHz } = mountDrag()
    spanEndHz.value = SPAN_START_HZ
    expect(drag.tryStartFreqDrag(gutterPoint(300))).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
  })

  it('never pans when the gutters leave no data box', () => {
    const { drag } = mountDrag({ spectrum: spectrumElement(0, INSET_LEFT_PX + INSET_RIGHT_PX) })
    expect(drag.tryStartFreqDrag(gutterPoint(50))).toBe(false)
    expect(drag.isFreqDragActive()).toBe(false)
  })
})

describe('useFrequencyDrag — dragging with the mouse', () => {
  it('ignores mouse moves and releases when no drag is held', () => {
    const { source } = mountDrag()
    mouseMove(400)
    mouseUp()
    expect(requestFrame).not.toHaveBeenCalled()
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('previews the pan once per animation frame without retuning', () => {
    const { drag, source, livePanOffsetHz, applyView } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))

    mouseMove(310)
    mouseMove(330)
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(applyView).not.toHaveBeenCalled()

    runFrames()
    // Dragged 30 px right at 1 kHz/px: the window slides 30 kHz down.
    expect(livePanOffsetHz.value).toBe(-30_000)
    expect(applyView).toHaveBeenCalledTimes(1)
    expect(source.requestTune).not.toHaveBeenCalled()

    // The next move schedules a fresh frame.
    mouseMove(290)
    expect(requestFrame).toHaveBeenCalledTimes(2)
    runFrames()
    expect(livePanOffsetHz.value).toBe(10_000)
  })

  it('scales the pan by the visible window, not the whole span', () => {
    // A quarter of the span on screen: 250 kHz over 1000 px = 250 Hz/px.
    const { drag, livePanOffsetHz } = mountDrag({ windowFraction: [0.6, 0.85] })
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseMove(340)
    runFrames()
    expect(livePanOffsetHz.value).toBe(-10_000)
  })

  it('retunes the radio centre once, on release, keeping the preview in place', () => {
    const { drag, source, livePanOffsetHz } = mountDrag({ autoCenter: false })
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseMove(200)
    runFrames()

    mouseUp()

    // 100 px left = 100 kHz up; centre forced even with auto-centre off.
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(0)
    expect(source.requestTune).toHaveBeenCalledTimes(1)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ + 100_000, true)
    expect(livePanOffsetHz.value).toBe(100_000)
    expect(drag.isFreqDragActive()).toBe(false)
    expect(drag.freqDragging.value).toBe(false)
  })

  it('commits the last pointer position even when its frame never ran', () => {
    const { drag, source, applyView } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseMove(350)
    const frameId = requestFrame.mock.results[0]?.value as number

    mouseUp()

    expect(cancelFrame).toHaveBeenCalledWith(frameId)
    expect(pendingFrames.size).toBe(0)
    expect(applyView).not.toHaveBeenCalled()
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ - 50_000, true)
  })

  it('does not cancel a frame when none is pending at release', () => {
    const { drag } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseUp()
    expect(cancelFrame).not.toHaveBeenCalled()
  })

  it('rounds the committed centre to a whole hertz', () => {
    // 1,000,333 Hz over 1000 px = 1000.333 Hz/px.
    const { drag, source, spanEndHz } = mountDrag()
    spanEndHz.value = SPAN_START_HZ + 1_000_333
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseMove(303)
    mouseUp()
    // centre 100,500,166.5 − 3 × 1000.333 = 100,497,165.501
    expect(source.requestTune).toHaveBeenCalledWith(100_497_166, true)
  })

  it('stops following the mouse after the release', () => {
    const { drag } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseUp()
    mouseMove(500)
    expect(requestFrame).not.toHaveBeenCalled()
  })
})

describe('useFrequencyDrag — dragging by touch', () => {
  it('pans with the first touch and stops the page scrolling', () => {
    const { drag, livePanOffsetHz } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    const move = touchEvent('touchmove', [{ clientX: 320 }])

    document.dispatchEvent(move)

    // Only a non-passive listener can cancel the scroll.
    expect(move.defaultPrevented).toBe(true)
    expect(requestFrame).toHaveBeenCalledTimes(1)
    document.dispatchEvent(touchEvent('touchmove', [{ clientX: 330 }]))
    expect(requestFrame).toHaveBeenCalledTimes(1)
    runFrames()
    expect(livePanOffsetHz.value).toBe(-30_000)
  })

  it('leaves page scrolling alone when no drag is held', () => {
    mountDrag()
    const move = touchEvent('touchmove', [{ clientX: 320 }])
    document.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(false)
    expect(requestFrame).not.toHaveBeenCalled()
  })

  it('commits on touchend', () => {
    const { drag, source } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    document.dispatchEvent(touchEvent('touchmove', [{ clientX: 250 }]))
    document.dispatchEvent(touchEvent('touchend'))
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(0)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ + 50_000, true)
    expect(drag.isFreqDragActive()).toBe(false)
  })

  it('ignores touchend when no drag is held', () => {
    const { source } = mountDrag()
    document.dispatchEvent(touchEvent('touchend'))
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('abandons the pan on touchcancel without retuning', () => {
    const { drag, source, livePanOffsetHz, applyView } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    document.dispatchEvent(touchEvent('touchmove', [{ clientX: 320 }]))
    runFrames()
    expect(livePanOffsetHz.value).toBe(-20_000)
    applyView.mockClear()
    document.dispatchEvent(touchEvent('touchmove', [{ clientX: 340 }]))
    const frameId = requestFrame.mock.results[1]?.value as number

    document.dispatchEvent(touchEvent('touchcancel'))

    expect(cancelFrame).toHaveBeenCalledWith(frameId)
    expect(livePanOffsetHz.value).toBe(0)
    expect(applyView).toHaveBeenCalledTimes(1)
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(source.setTuningOffsetHz).not.toHaveBeenCalled()
    expect(drag.isFreqDragActive()).toBe(false)
    expect(drag.freqDragging.value).toBe(false)
  })

  it('stops listening once the component unmounts', () => {
    const { drag, source } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    mounted[0]?.unmount()
    mounted = []
    document.dispatchEvent(touchEvent('touchend'))
    expect(source.requestTune).not.toHaveBeenCalled()
  })
})

describe('useFrequencyDrag — abortFreqDrag', () => {
  it('does nothing when no drag is held', () => {
    const { drag, livePanOffsetHz, applyView } = mountDrag()
    livePanOffsetHz.value = 40_000
    drag.abortFreqDrag()
    expect(livePanOffsetHz.value).toBe(40_000)
    expect(applyView).not.toHaveBeenCalled()
  })

  it('snaps a held pan back without a pending frame to cancel', () => {
    const { drag, livePanOffsetHz, applyView, source } = mountDrag()
    drag.tryStartFreqDrag(gutterPoint(300))
    mouseMove(330)
    runFrames()
    applyView.mockClear()

    drag.abortFreqDrag()

    expect(cancelFrame).not.toHaveBeenCalled()
    expect(livePanOffsetHz.value).toBe(0)
    expect(applyView).toHaveBeenCalledTimes(1)
    expect(source.requestTune).not.toHaveBeenCalled()
    // A later release has nothing to commit.
    mouseUp()
    expect(source.requestTune).not.toHaveBeenCalled()
  })
})

describe('useFrequencyDrag — wheel pan', () => {
  it('pans one notch toward higher frequencies on a scroll up', () => {
    const { drag, livePanOffsetHz, applyView, source } = mountDrag()
    const event = wheel(-100)

    drag.onPlotWheel(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopImmediatePropagation).toHaveBeenCalled()
    expect(drag.freqDragging.value).toBe(true)
    runFrames()
    // 12% of the 1 MHz window.
    expect(WHEEL_STEP_FRACTION).toBe(0.12)
    expect(livePanOffsetHz.value).toBe(120_000)
    expect(applyView).toHaveBeenCalledTimes(1)
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('reads line-mode deltas as three lines per notch', () => {
    const { drag, livePanOffsetHz } = mountDrag()
    drag.onPlotWheel(wheel(3, 1))
    runFrames()
    expect(livePanOffsetHz.value).toBe(-120_000)
  })

  it('moves a fraction of a notch for a fine trackpad scroll', () => {
    const { drag, livePanOffsetHz } = mountDrag()
    drag.onPlotWheel(wheel(25))
    runFrames()
    expect(livePanOffsetHz.value).toBe(-30_000)
  })

  it('steps by the visible window when zoomed in', () => {
    // 200 kHz on screen → 24 kHz per notch.
    const { drag, livePanOffsetHz } = mountDrag({ windowFraction: [0.1, 0.3] })
    drag.onPlotWheel(wheel(-100))
    runFrames()
    expect(livePanOffsetHz.value).toBe(24_000)
  })

  it('accumulates a burst and retunes once, after the burst settles', () => {
    const { drag, source, livePanOffsetHz } = mountDrag({ autoCenter: false })
    drag.onPlotWheel(wheel(-100))
    drag.onPlotWheel(wheel(-100))
    expect(requestFrame).toHaveBeenCalledTimes(1)
    runFrames()
    expect(livePanOffsetHz.value).toBe(240_000)

    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS - 1)
    expect(source.requestTune).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(WHEEL_COMMIT_DELAY_MS).toBe(250)
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(0)
    expect(source.requestTune).toHaveBeenCalledTimes(1)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ + 240_000, true)
    expect(drag.freqDragging.value).toBe(false)
    // The preview holds until the retuned frame lands.
    expect(livePanOffsetHz.value).toBe(240_000)
    expect(cancelFrame).not.toHaveBeenCalled()
  })

  it('restarts the settle delay on every tick', () => {
    const { drag, source } = mountDrag()
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(200)
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS - 1)
    expect(source.requestTune).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(source.requestTune).toHaveBeenCalledTimes(1)
  })

  it('cancels a frame still pending when the burst commits', () => {
    const { drag, applyView, source } = mountDrag()
    drag.onPlotWheel(wheel(-100))
    const frameId = requestFrame.mock.results[0]?.value as number
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(cancelFrame).toHaveBeenCalledWith(frameId)
    expect(pendingFrames.size).toBe(0)
    expect(applyView).not.toHaveBeenCalled()
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ + 120_000, true)
  })

  it('starts a burst from where a held pan left the window', () => {
    const { drag, source, livePanOffsetHz } = mountDrag()
    livePanOffsetHz.value = 50_000
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_CENTRE_HZ + 170_000, true)
  })

  it('starts the next burst afresh from the held offset', () => {
    const { drag, source } = mountDrag()
    drag.onPlotWheel(wheel(-100))
    runFrames()
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    // Window still shifted 120 kHz (the retuned frame hasn't landed).
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(source.requestTune).toHaveBeenLastCalledWith(SPAN_CENTRE_HZ + 240_000, true)
  })

  it('starts the next burst from wherever the radio has since been tuned', () => {
    const { drag, source, spanStartHz, spanEndHz, livePanOffsetHz } = mountDrag()
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    // The operator types a new frequency: a 105 MHz frame lands, pan cleared.
    spanStartHz.value = 105_000_000
    spanEndHz.value = 106_000_000
    livePanOffsetHz.value = 0
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(source.requestTune).toHaveBeenLastCalledWith(105_620_000, true)
  })

  it('rounds the committed centre to a whole hertz', () => {
    const { drag, source, spanEndHz } = mountDrag()
    // 1,000,005 Hz span: 12% is 120,000.6 Hz; centre 100,500,002.5.
    spanEndHz.value = SPAN_START_HZ + 1_000_005
    drag.onPlotWheel(wheel(-100))
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(source.requestTune).toHaveBeenCalledWith(100_620_003, true)
  })

  it.each([
    ['the radio is stopped', { playing: false }],
    ['this is a read-only follower', { readOnly: true }],
  ])('leaves the wheel to the page when %s', (_reason, options) => {
    const { drag, source } = mountDrag(options)
    const event = wheel(-100)
    drag.onPlotWheel(event)
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled()
    expect(drag.freqDragging.value).toBe(false)
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('leaves the wheel to the page before a span has arrived', () => {
    const { drag, source, spanEndHz } = mountDrag()
    spanEndHz.value = SPAN_START_HZ
    const event = wheel(-100)
    drag.onPlotWheel(event)
    vi.advanceTimersByTime(WHEEL_COMMIT_DELAY_MS)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(requestFrame).not.toHaveBeenCalled()
    expect(source.requestTune).not.toHaveBeenCalled()
  })
})

describe('useFrequencyDrag — click-to-tune', () => {
  it('retunes the radio onto the clicked frequency with auto-centre on', () => {
    const { drag, source, spectrum } = mountDrag({ autoCenter: true })
    drag.tuneToClientX(spectrum, INSET_LEFT_PX + 250)
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(0)
    expect(source.requestTune).toHaveBeenCalledTimes(1)
    expect(source.requestTune.mock.calls[0]).toEqual([SPAN_START_HZ + 250_000])
  })

  it('demodulates the clicked frequency by offset with auto-centre off', () => {
    const { drag, source, spectrum } = mountDrag({ autoCenter: false })
    drag.tuneToClientX(spectrum, INSET_LEFT_PX + 250)
    // 250 kHz below the radio's centre.
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(-250_000)
    expect(source.requestTune.mock.calls[0]).toEqual([SPAN_START_HZ + 250_000])
  })

  it('measures from the plot element’s own left edge', () => {
    const element = spectrumElement(400)
    const { drag, source } = mountDrag({ spectrum: element })
    drag.tuneToClientX(element, 400 + INSET_LEFT_PX + 600)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_START_HZ + 600_000)
  })

  it('clamps a click in the left gutter to the window’s low edge', () => {
    const { drag, source, spectrum } = mountDrag()
    drag.tuneToClientX(spectrum, 10)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_START_HZ)
  })

  it('clamps a click in the right gutter to the window’s high edge', () => {
    const { drag, source, spectrum } = mountDrag()
    drag.tuneToClientX(spectrum, ELEMENT_WIDTH_PX - 10)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_END_HZ)
  })

  it('maps the click inside the visible window when zoomed', () => {
    // Window 100.6–100.8 MHz: halfway across is 100.7 MHz.
    const { drag, source, spectrum } = mountDrag({ windowFraction: [0.6, 0.8] })
    drag.tuneToClientX(spectrum, INSET_LEFT_PX + 500)
    expect(source.requestTune).toHaveBeenCalledWith(100_700_000)
  })

  it('snaps onto a nearby known frequency, from the whole-hertz click', () => {
    const { drag, source, spectrum, snapToKnownFreqHz } = mountDrag({ autoCenter: false })
    snapToKnownFreqHz.mockReturnValue(100_251_000)
    // 0.0004 px past 250 lands 0.4 Hz off a whole hertz: the snap sees it rounded.
    drag.tuneToClientX(spectrum, INSET_LEFT_PX + 250.0004)
    expect(snapToKnownFreqHz).toHaveBeenCalledWith(100_250_000)
    expect(source.setTuningOffsetHz).toHaveBeenCalledWith(100_251_000 - SPAN_CENTRE_HZ)
    expect(source.requestTune).toHaveBeenCalledWith(100_251_000)
  })

  it('clears a held pan, tuning inside the shifted window the operator sees', () => {
    const { drag, source, spectrum, livePanOffsetHz } = mountDrag()
    livePanOffsetHz.value = 300_000
    drag.tuneToClientX(spectrum, INSET_LEFT_PX + 100)
    expect(source.requestTune).toHaveBeenCalledWith(SPAN_START_HZ + 400_000)
    expect(livePanOffsetHz.value).toBe(0)
  })

  it('does nothing before a span has arrived', () => {
    const { drag, source, spectrum, spanEndHz } = mountDrag()
    spanEndHz.value = SPAN_START_HZ - 1
    drag.tuneToClientX(spectrum, 300)
    expect(source.setTuningOffsetHz).not.toHaveBeenCalled()
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('does nothing when the gutters leave no data box', () => {
    const narrow = spectrumElement(0, INSET_LEFT_PX + INSET_RIGHT_PX)
    const { drag, source, livePanOffsetHz } = mountDrag({ spectrum: narrow })
    livePanOffsetHz.value = 5_000
    drag.tuneToClientX(narrow, 50)
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(livePanOffsetHz.value).toBe(5_000)
  })
})
