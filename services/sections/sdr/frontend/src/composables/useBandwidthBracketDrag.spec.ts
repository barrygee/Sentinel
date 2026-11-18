import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, reactive, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { AccordionPlugin, Plot } from 'sigplot'
import {
  MIN_BW_HZ,
  useBandwidthBracketDrag,
  type BandwidthBracketDrag,
  type BracketTuningSource,
} from './useBandwidthBracketDrag'
import type { SdrMode } from '../stores/sdr'

const HZ_PER_MHZ = 1e6
const TUNED_HZ = 145_500_000
const BANDWIDTH_HZ = 12_500
const SAMPLE_RATE_HZ = 2_048_000

// Each plot element sits ELEMENT_LEFT_PX from the viewport's left edge; its
// data box (sigplot's Mx) spans x 50..1050 and y 10..190 inside it. Accordion
// edge/centre positions are canvas pixels, i.e. relative to the element.
const ELEMENT_LEFT_PX = 10
const DATA_BOX = { l: 50, r: 1050, t: 10, b: 190 }
const INSIDE_Y = 100
// The passband's edges and centre, in element pixels.
const EDGE_LOW_PX = 400
const EDGE_HIGH_PX = 600
const CENTRE_PX = 500
// sigplot's grab tolerance is the line width + 5 px; the bracket's lines are
// 20 px wide, so 25 px either side.
const GRAB_TOLERANCE_PX = 25

/** A sigplot AccordionPlugin double: fluent accessors and the internal flags the composable pokes. */
class FakeAccordion {
  static instances: FakeAccordion[] = []
  readonly options: Record<string, unknown>
  centerValue = 0
  widthValue = 0
  minWidthValue = 0
  maxWidthValue = 0
  displayValue = false
  dragging = false
  edge_dragging = false
  properties:
    | {
        loc_1?: number
        loc_2?: number
        center_location?: number
        edge_line_style?: { lineWidth?: number }
        center_line_style?: { lineWidth?: number }
      }
    | undefined
  /** Called on every centre write, to observe what the composable reports mid-write. */
  onCenterWrite: (() => void) | null = null

  constructor(options: Record<string, unknown> = {}) {
    this.options = options
    this.properties = {
      loc_1: EDGE_LOW_PX,
      loc_2: EDGE_HIGH_PX,
      center_location: CENTRE_PX,
      edge_line_style: { lineWidth: 20 },
      center_line_style: { lineWidth: 20 },
    }
    FakeAccordion.instances.push(this)
  }

  center(value?: number): number | this {
    if (value === undefined) return this.centerValue
    this.onCenterWrite?.()
    this.centerValue = value
    return this
  }
  width(value?: number): number | this {
    if (value === undefined) return this.widthValue
    this.widthValue = value
    return this
  }
  min_width(value?: number): number | this {
    if (value === undefined) return this.minWidthValue
    this.minWidthValue = value
    return this
  }
  max_width(value?: number): number | this {
    if (value === undefined) return this.maxWidthValue
    this.maxWidthValue = value
    return this
  }
  display(value?: boolean): boolean | this {
    if (value === undefined) return this.displayValue
    this.displayValue = value
    return this
  }
}

interface FakePlot {
  add_plugin: Mock<(plugin: unknown, zorder?: number) => void>
  remove_plugin: Mock<(plugin: unknown) => void>
  _Mx?: { l: number; r: number; t: number; b: number; wid_canvas?: HTMLCanvasElement }
  canvas: HTMLCanvasElement
}

function fakePlot(): FakePlot {
  const canvas = document.createElement('canvas')
  return {
    add_plugin: vi.fn(),
    remove_plugin: vi.fn(),
    _Mx: { ...DATA_BOX, wid_canvas: canvas },
    canvas,
  }
}

/** A plot element with fixed geometry (jsdom lays nothing out). */
function plotElement(left = ELEMENT_LEFT_PX): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      left,
      top: 0,
      right: left + 1100,
      bottom: 200,
      width: 1100,
      height: 200,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  return element
}

type Source = BracketTuningSource & {
  currentFreqHz: number
  bwHz: number
  sampleRate: number
  playing: boolean
  currentMode: SdrMode
  readOnly: boolean
  requestTune: Mock<(freqHz: number) => void>
  requestBandwidth: Mock<(bandwidthHz: number) => void>
}

interface Harness {
  bracket: BandwidthBracketDrag
  source: Source
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
  livePanOffsetHz: Ref<number>
  snapToKnownFreqHz: Mock<(freqHz: number) => number>
  spectrumPlot: FakePlot
  waterfallPlot: FakePlot
  plots: { spectrum: FakePlot | null; waterfall: FakePlot | null }
  elements: { spectrum: HTMLElement | null; waterfall: HTMLElement | null }
  /** Attaches the accordions and returns them: [spectrum, waterfall, spectrum carrier, waterfall carrier]. */
  attach: () => [FakeAccordion, FakeAccordion, FakeAccordion, FakeAccordion]
}

let mounted: VueWrapper[] = []

function mountBracket(
  options: { mode?: SdrMode; readOnly?: boolean; playing?: boolean } = {},
): Harness {
  const source = reactive({
    currentFreqHz: TUNED_HZ,
    bwHz: BANDWIDTH_HZ,
    sampleRate: SAMPLE_RATE_HZ,
    playing: options.playing ?? true,
    currentMode: options.mode ?? 'NFM',
    readOnly: options.readOnly ?? false,
    requestTune: vi.fn<(freqHz: number) => void>(),
    requestBandwidth: vi.fn<(bandwidthHz: number) => void>(),
  }) as Source
  const spanStartHz = ref(TUNED_HZ - SAMPLE_RATE_HZ / 2)
  const spanEndHz = ref(TUNED_HZ + SAMPLE_RATE_HZ / 2)
  const livePanOffsetHz = ref(0)
  const snapToKnownFreqHz = vi.fn((freqHz: number) => freqHz)
  const spectrumPlot = fakePlot()
  const waterfallPlot = fakePlot()
  const plots: Harness['plots'] = { spectrum: spectrumPlot, waterfall: waterfallPlot }
  const elements: Harness['elements'] = { spectrum: plotElement(), waterfall: plotElement() }
  let bracket: BandwidthBracketDrag | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        bracket = useBandwidthBracketDrag({
          source,
          spectrumPlot: () => plots.spectrum as unknown as Plot | null,
          waterfallPlot: () => plots.waterfall as unknown as Plot | null,
          spectrumElement: () => elements.spectrum,
          waterfallElement: () => elements.waterfall,
          spanStartHz,
          spanEndHz,
          livePanOffsetHz,
          snapToKnownFreqHz,
        })
        return () => null
      },
    }),
    { attachTo: document.body },
  )
  mounted.push(wrapper)
  const built = bracket as BandwidthBracketDrag
  return {
    bracket: built,
    source,
    spanStartHz,
    spanEndHz,
    livePanOffsetHz,
    snapToKnownFreqHz,
    spectrumPlot,
    waterfallPlot,
    plots,
    elements,
    attach: () => {
      FakeAccordion.instances = []
      built.attachAccordions(
        FakeAccordion as unknown as typeof AccordionPlugin,
        spectrumPlot as unknown as Plot,
        waterfallPlot as unknown as Plot,
      )
      const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = FakeAccordion.instances
      return [
        spectrum as FakeAccordion,
        waterfall as FakeAccordion,
        spectrumCarrier as FakeAccordion,
        waterfallCarrier as FakeAccordion,
      ]
    },
  }
}

function mouse(type: string, init: MouseEventInit = {}): void {
  document.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
}

/** Grabs `accordion` the way sigplot does: its own mousedown sets a flag, then the document sees the press. */
function grab(accordion: FakeAccordion, edge = false): void {
  if (edge) accordion.edge_dragging = true
  else accordion.dragging = true
  mouse('mousedown', { buttons: 1 })
}

/** sigplot moving the grabbed spectrum accordion (MHz) during its own mousemove, then the document event. */
function dragSpectrumTo(spectrum: FakeAccordion, centerHz: number, widthHz: number): void {
  spectrum.centerValue = centerHz / HZ_PER_MHZ
  spectrum.widthValue = widthHz / HZ_PER_MHZ
  mouse('mousemove', { buttons: 1 })
}

/** The same for the waterfall accordion (Hz). */
function dragWaterfallTo(waterfall: FakeAccordion, centerHz: number, widthHz: number): void {
  waterfall.centerValue = centerHz
  waterfall.widthValue = widthHz
  mouse('mousemove', { buttons: 1 })
}

/** A touch event (jsdom has no Touch constructor) carrying the given touches. */
function touchEvent(
  type: string,
  touches: { clientX: number; clientY: number }[] = [],
  changedTouches = touches,
): TouchEvent {
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'touches', { value: touches })
  Object.defineProperty(event, 'changedTouches', { value: changedTouches })
  return event as TouchEvent
}

/** A viewport point at element-relative x (and inside the data box vertically by default). */
function point(elementX: number, clientY = INSIDE_Y) {
  return { clientX: ELEMENT_LEFT_PX + elementX, clientY }
}

/** Starts a touch on the bracket and returns what it dispatched at the plot canvas. */
function recordCanvas(plot: FakePlot): MouseEvent[] {
  const events: MouseEvent[] = []
  for (const type of ['mousedown', 'mousemove', 'mouseup']) {
    plot.canvas.addEventListener(type, (event) => events.push(event as MouseEvent))
  }
  return events
}

beforeEach(() => {
  // vitest's jsdom `window` is a merged global, not a brand-correct Window, so
  // jsdom's MouseEvent rejects the bridge's `view: window` ("member view is not
  // of type Window"; real browsers accept it). Strip the field and build a real
  // MouseEvent, as SdrWaterfall.spec.ts does.
  const RealMouseEvent = window.MouseEvent
  function StubbedMouseEvent(type: string, init?: MouseEventInit): MouseEvent {
    const { view: _unusedView, ...rest } = init ?? {}
    return Reflect.construct(RealMouseEvent, [type, rest], RealMouseEvent) as MouseEvent
  }
  StubbedMouseEvent.prototype = RealMouseEvent.prototype
  vi.stubGlobal('MouseEvent', StubbedMouseEvent)
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
  FakeAccordion.instances = []
  vi.unstubAllGlobals()
})

describe('useBandwidthBracketDrag — attaching the accordions', () => {
  it('builds a shaded passband and a white carrier line on the spectrum', () => {
    const { attach } = mountBracket()
    const [spectrum, , spectrumCarrier] = attach()
    expect(spectrum.options).toMatchObject({
      mode: 'absolute',
      direction: 'vertical',
      draw_center_line: true,
      draw_edge_lines: false,
      shade_area: true,
      fill_style: { fillStyle: '#00aaff', opacity: 0.12 },
      center_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 20 },
      edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 20 },
    })
    expect(spectrumCarrier.options).toMatchObject({
      shade_area: false,
      center_line_style: { strokeStyle: '#ffffff', lineWidth: 1 },
      edge_line_style: { lineWidth: 0 },
    })
  })

  it('leaves the waterfall passband unshaded and dims its carrier line', () => {
    const { attach } = mountBracket()
    const [, waterfall, , waterfallCarrier] = attach()
    expect(waterfall.options).toMatchObject({
      shade_area: false,
      // The invisible 20 px hit zones survive, so the bracket stays grabbable.
      center_line_style: { lineWidth: 20 },
      edge_line_style: { lineWidth: 20 },
    })
    expect(waterfallCarrier.options).toMatchObject({
      shade_area: false,
      center_line_style: { strokeStyle: 'rgba(255,255,255,0.55)', lineWidth: 1 },
    })
  })

  it('adds the passband and carrier to their own plot at z-order 1', () => {
    const { attach, spectrumPlot, waterfallPlot } = mountBracket()
    const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    expect(spectrumPlot.add_plugin.mock.calls).toEqual([
      [spectrum, 1],
      [spectrumCarrier, 1],
    ])
    expect(waterfallPlot.add_plugin.mock.calls).toEqual([
      [waterfall, 1],
      [waterfallCarrier, 1],
    ])
  })

  it('pins the new accordions to the tuned frequency straight away', () => {
    const { attach } = mountBracket()
    const [spectrum, waterfall] = attach()
    expect(spectrum.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(waterfall.centerValue).toBe(TUNED_HZ)
  })
})

describe('useBandwidthBracketDrag — applyMarker', () => {
  it('does nothing before the accordions exist', () => {
    const { bracket } = mountBracket()
    expect(() => bracket.applyMarker()).not.toThrow()
    expect(FakeAccordion.instances).toHaveLength(0)
  })

  it('places the spectrum bracket in MHz and the waterfall bracket in Hz', () => {
    const { attach } = mountBracket()
    const [spectrum, waterfall] = attach()
    expect(spectrum.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(spectrum.widthValue).toBe(BANDWIDTH_HZ / HZ_PER_MHZ)
    expect(spectrum.minWidthValue).toBe(MIN_BW_HZ / HZ_PER_MHZ)
    expect(spectrum.maxWidthValue).toBe(SAMPLE_RATE_HZ / HZ_PER_MHZ)
    expect(waterfall.centerValue).toBe(TUNED_HZ)
    expect(waterfall.widthValue).toBe(BANDWIDTH_HZ)
    expect(waterfall.minWidthValue).toBe(MIN_BW_HZ)
    expect(waterfall.maxWidthValue).toBe(SAMPLE_RATE_HZ)
  })

  it('gives the carrier lines a fixed 1 Hz width on the carrier', () => {
    const { attach } = mountBracket()
    const [, , spectrumCarrier, waterfallCarrier] = attach()
    expect(spectrumCarrier.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(spectrumCarrier.widthValue).toBe(1 / HZ_PER_MHZ)
    expect(spectrumCarrier.minWidthValue).toBe(1 / HZ_PER_MHZ)
    expect(spectrumCarrier.maxWidthValue).toBe(SAMPLE_RATE_HZ / HZ_PER_MHZ)
    expect(waterfallCarrier.centerValue).toBe(TUNED_HZ)
    expect(waterfallCarrier.widthValue).toBe(1)
    expect(waterfallCarrier.minWidthValue).toBe(1)
    expect(waterfallCarrier.maxWidthValue).toBe(SAMPLE_RATE_HZ)
  })

  it('follows a store change when called again', () => {
    const { attach, bracket, source } = mountBracket()
    const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    source.currentFreqHz = 433_920_000
    source.bwHz = 25_000
    bracket.applyMarker()
    expect(spectrum.centerValue).toBe(433.92)
    expect(spectrum.widthValue).toBe(0.025)
    expect(waterfall.centerValue).toBe(433_920_000)
    expect(waterfall.widthValue).toBe(25_000)
    expect(spectrumCarrier.centerValue).toBe(433.92)
    expect(waterfallCarrier.centerValue).toBe(433_920_000)
  })

  it('falls back to a 10 kHz passband when the store has no bandwidth', () => {
    const { attach, bracket, source } = mountBracket()
    const [, waterfall] = attach()
    source.bwHz = 0
    bracket.applyMarker()
    expect(waterfall.widthValue).toBe(10_000)
  })

  it('never draws a passband narrower than the minimum', () => {
    const { attach, bracket, source } = mountBracket()
    const [, waterfall] = attach()
    source.bwHz = MIN_BW_HZ - 1
    bracket.applyMarker()
    expect(waterfall.widthValue).toBe(MIN_BW_HZ)
  })

  it('limits the drag width to the span when the sample rate is unknown', () => {
    const { attach, bracket, source, spanStartHz, spanEndHz } = mountBracket()
    const [, waterfall, , waterfallCarrier] = attach()
    source.sampleRate = 0
    spanStartHz.value = 100_000_000
    spanEndHz.value = 101_000_000
    bracket.applyMarker()
    expect(waterfall.maxWidthValue).toBe(1_000_000)
    expect(waterfallCarrier.maxWidthValue).toBe(1_000_000)
  })

  it('limits the drag width to the passband itself when neither rate nor span is known', () => {
    const { attach, bracket, source, spanStartHz, spanEndHz } = mountBracket()
    const [, waterfall] = attach()
    source.sampleRate = 0
    spanStartHz.value = 0
    spanEndHz.value = 0
    bracket.applyMarker()
    expect(waterfall.maxWidthValue).toBe(BANDWIDTH_HZ)
  })

  it('shifts the drawn bracket and carrier by the live pan offset', () => {
    const { attach, bracket, livePanOffsetHz } = mountBracket()
    const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    livePanOffsetHz.value = 50_000
    bracket.applyMarker()
    expect(waterfall.centerValue).toBe(TUNED_HZ + 50_000)
    expect(spectrum.centerValue).toBe((TUNED_HZ + 50_000) / HZ_PER_MHZ)
    expect(spectrumCarrier.centerValue).toBe((TUNED_HZ + 50_000) / HZ_PER_MHZ)
    expect(waterfallCarrier.centerValue).toBe(TUNED_HZ + 50_000)
  })

  it('shows all four accordions while playing and hides them when stopped', () => {
    const { attach, bracket, source } = mountBracket()
    const accordions = attach()
    expect(accordions.map((accordion) => accordion.displayValue)).toEqual([true, true, true, true])
    source.playing = false
    bracket.applyMarker()
    expect(accordions.map((accordion) => accordion.displayValue)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('reports its own writes as in progress, and only while they run', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum] = attach()
    const seenDuringWrite: boolean[] = []
    spectrum.onCenterWrite = () => seenDuringWrite.push(bracket.isWritingBracket())
    bracket.applyMarker()
    expect(seenDuringWrite).toEqual([true])
    expect(bracket.isWritingBracket()).toBe(false)
  })

  it('clears the write guard even when an accordion write throws', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum] = attach()
    spectrum.onCenterWrite = () => {
      throw new Error('canvas gone')
    }
    expect(() => bracket.applyMarker()).toThrow('canvas gone')
    expect(bracket.isWritingBracket()).toBe(false)
  })
})

describe('useBandwidthBracketDrag — detaching the accordions', () => {
  it('removes each accordion from its own plot', () => {
    const { attach, bracket, spectrumPlot, waterfallPlot } = mountBracket()
    const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    bracket.detachAccordions()
    expect(spectrumPlot.remove_plugin.mock.calls).toEqual([[spectrum], [spectrumCarrier]])
    expect(waterfallPlot.remove_plugin.mock.calls).toEqual([[waterfall], [waterfallCarrier]])
  })

  it('stops applyMarker touching the removed accordions', () => {
    const { attach, bracket, source } = mountBracket()
    const [spectrum, waterfall] = attach()
    bracket.detachAccordions()
    source.currentFreqHz = 100_000_000
    bracket.applyMarker()
    expect(spectrum.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(waterfall.centerValue).toBe(TUNED_HZ)
  })

  it('forgets both passband accordions, so neither can be grabbed or report a drag', () => {
    const harness = mountBracket()
    const [spectrum, waterfall] = harness.attach()
    harness.bracket.detachAccordions()
    spectrum.dragging = true
    waterfall.dragging = true
    expect(harness.bracket.isBracketDragActive()).toBe(false)
    const at = point(CENTRE_PX)
    expect(
      harness.bracket.tryStartBracketTouch(touchEvent('touchstart', [at]), at as Touch, true),
    ).toBe(false)
  })

  it('keeps removing the rest when one removal throws', () => {
    const { attach, bracket, spectrumPlot, waterfallPlot } = mountBracket()
    const [, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    spectrumPlot.remove_plugin.mockImplementation(() => {
      throw new Error('plugin list gone')
    })
    waterfallPlot.remove_plugin.mockImplementation(() => {
      throw new Error('plugin list gone')
    })
    expect(() => bracket.detachAccordions()).not.toThrow()
    expect(spectrumPlot.remove_plugin).toHaveBeenCalledWith(spectrumCarrier)
    expect(waterfallPlot.remove_plugin.mock.calls).toEqual([[waterfall], [waterfallCarrier]])
  })

  it('copes with plots that are already gone, and with nothing attached', () => {
    const { attach, bracket, plots } = mountBracket()
    expect(() => bracket.detachAccordions()).not.toThrow()
    attach()
    plots.spectrum = null
    plots.waterfall = null
    expect(() => bracket.detachAccordions()).not.toThrow()
  })
})

describe('useBandwidthBracketDrag — whether a bracket drag is under way', () => {
  it('is false at rest', () => {
    const { attach, bracket } = mountBracket()
    expect(bracket.isBracketDragActive()).toBe(false)
    attach()
    expect(bracket.isBracketDragActive()).toBe(false)
  })

  it("is true as soon as sigplot flags either accordion as dragged, before the document's mousedown", () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    spectrum.dragging = true
    expect(bracket.isBracketDragActive()).toBe(true)
    spectrum.dragging = false
    waterfall.edge_dragging = true
    expect(bracket.isBracketDragActive()).toBe(true)
  })

  it('stays true for a started drag even once the flags are gone', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum] = attach()
    grab(spectrum)
    spectrum.dragging = false
    expect(bracket.isBracketDragActive()).toBe(true)
  })

  it('ignores a document mousedown that grabbed no accordion', () => {
    const { attach, bracket } = mountBracket()
    attach()
    mouse('mousedown', { buttons: 1 })
    expect(bracket.isBracketDragActive()).toBe(false)
  })

  it('ignores document presses before the accordions exist', () => {
    const { bracket } = mountBracket()
    expect(() => mouse('mousedown', { buttons: 1 })).not.toThrow()
    expect(bracket.isBracketDragActive()).toBe(false)
  })
})

describe('useBandwidthBracketDrag — mirroring a drag onto the other plot', () => {
  it('copies the dragged spectrum bracket (MHz) onto the waterfall (Hz)', () => {
    const { attach } = mountBracket()
    const [spectrum, waterfall, spectrumCarrier, waterfallCarrier] = attach()
    grab(spectrum)
    dragSpectrumTo(spectrum, 145_600_000, 20_000)
    expect(waterfall.centerValue).toBeCloseTo(145_600_000, 3)
    expect(waterfall.widthValue).toBeCloseTo(20_000, 3)
    expect(spectrumCarrier.centerValue).toBeCloseTo(145.6, 9)
    expect(waterfallCarrier.centerValue).toBeCloseTo(145_600_000, 3)
  })

  it('copies the dragged waterfall bracket (Hz) onto the spectrum (MHz)', () => {
    const { attach } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_400_000, 8_000)
    expect(spectrum.centerValue).toBe(145.4)
    expect(spectrum.widthValue).toBe(0.008)
  })

  it('reads a symmetric-mode edge drag as a plain centred resize', () => {
    const { attach } = mountBracket({ mode: 'AM' })
    const [spectrum, waterfall, , waterfallCarrier] = attach()
    grab(waterfall, true)
    dragWaterfallTo(waterfall, 145_501_000, 30_000)
    expect(spectrum.centerValue).toBe(145.501)
    expect(spectrum.widthValue).toBe(0.03)
    expect(waterfallCarrier.centerValue).toBe(145_501_000)
  })

  it('keeps the carrier pinned and widens to the upper edge for a USB edge drag', () => {
    const { attach } = mountBracket({ mode: 'USB' })
    const [spectrum, waterfall, , waterfallCarrier] = attach()
    grab(waterfall, true)
    // sigplot grew the bracket symmetrically: its upper edge is now at
    // 145_500_500 + 3_000 = 145_503_500, so 3.5 kHz above the carrier.
    dragWaterfallTo(waterfall, 145_500_500, 6_000)
    expect(waterfall.centerValue).toBe(TUNED_HZ)
    expect(waterfall.widthValue).toBe(3_500)
    expect(spectrum.widthValue).toBe(0.0035)
    expect(waterfallCarrier.centerValue).toBe(TUNED_HZ)
  })

  it('widens to the lower edge for an LSB edge drag', () => {
    const { attach } = mountBracket({ mode: 'LSB' })
    const [spectrum, waterfall] = attach()
    grab(spectrum, true)
    // Lower edge: 145_499_000 - 2_000 = 145_497_000, 3 kHz below the carrier.
    dragSpectrumTo(spectrum, 145_499_000, 4_000)
    expect(waterfall.centerValue).toBeCloseTo(TUNED_HZ, 3)
    expect(waterfall.widthValue).toBeCloseTo(3_000, 3)
  })

  it('never resizes an SSB passband below the minimum width', () => {
    const { attach } = mountBracket({ mode: 'USB' })
    const [, waterfall] = attach()
    grab(waterfall, true)
    dragWaterfallTo(waterfall, TUNED_HZ, 100)
    expect(waterfall.widthValue).toBe(MIN_BW_HZ)
  })

  it('moves the carrier with the bracket for an SSB move drag', () => {
    const { attach } = mountBracket({ mode: 'USB' })
    const [spectrum, waterfall, , waterfallCarrier] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_510_000, 2_700)
    expect(spectrum.centerValue).toBe(145.51)
    expect(spectrum.widthValue).toBe(0.0027)
    expect(waterfallCarrier.centerValue).toBe(145_510_000)
  })

  it('writes nothing when no accordion is being dragged', () => {
    const { attach } = mountBracket()
    const [spectrum, waterfall] = attach()
    waterfall.centerValue = 1
    mouse('mousemove', { buttons: 1 })
    expect(spectrum.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(waterfall.centerValue).toBe(1)
  })

  it('ignores mouse movement before the accordions exist', () => {
    mountBracket()
    expect(() => mouse('mousemove', { buttons: 1 })).not.toThrow()
  })

  it('reports its mirror writes as its own while they run', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(spectrum)
    const seenDuringWrite: boolean[] = []
    waterfall.onCenterWrite = () => seenDuringWrite.push(bracket.isWritingBracket())
    dragSpectrumTo(spectrum, 145_600_000, BANDWIDTH_HZ)
    expect(seenDuringWrite).toEqual([true])
    expect(bracket.isWritingBracket()).toBe(false)
  })

  it('clears the write guard after mirroring, even when a write throws', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall)
    spectrum.onCenterWrite = () => {
      throw new Error('canvas gone')
    }
    waterfall.centerValue = 145_400_000
    // The listener's throw is reported, not propagated, by dispatchEvent.
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.addEventListener('error', (event) => event.preventDefault(), { once: true })
    mouse('mousemove', { buttons: 1 })
    reported.mockRestore()
    expect(bracket.isWritingBracket()).toBe(false)
  })
})

describe('useBandwidthBracketDrag — committing a drag', () => {
  it('retunes to the moved carrier, snapped to a known frequency', () => {
    const { attach, source, snapToKnownFreqHz } = mountBracket()
    const [spectrum, waterfall] = attach()
    snapToKnownFreqHz.mockImplementation(() => 145_600_000)
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_598_765.4, BANDWIDTH_HZ)
    mouse('mouseup')
    expect(snapToKnownFreqHz).toHaveBeenCalledWith(145_598_765)
    expect(source.requestTune).toHaveBeenCalledWith(145_600_000)
    expect(source.requestBandwidth).not.toHaveBeenCalled()
    // Both brackets settle on the snapped carrier straight away.
    expect(waterfall.centerValue).toBe(145_600_000)
    expect(spectrum.centerValue).toBe(145.6)
  })

  it('changes only the bandwidth when the bracket was resized in place', () => {
    const { attach, source, snapToKnownFreqHz } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall, true)
    dragWaterfallTo(waterfall, TUNED_HZ, 20_000.6)
    mouse('mouseup')
    expect(source.requestBandwidth).toHaveBeenCalledWith(20_001)
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(snapToKnownFreqHz).not.toHaveBeenCalled()
    expect(spectrum.widthValue).toBeCloseTo(0.0200006, 9)
    expect(waterfall.widthValue).toBe(20_000.6)
  })

  it('commits both when the bracket moved and changed width', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, 15_000)
    mouse('mouseup')
    expect(source.requestTune).toHaveBeenCalledWith(145_550_000)
    expect(source.requestBandwidth).toHaveBeenCalledWith(15_000)
  })

  it('treats a nudge of 1 Hz or less as a click and commits nothing', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, TUNED_HZ + 1, BANDWIDTH_HZ + 1)
    mouse('mouseup')
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(source.requestBandwidth).not.toHaveBeenCalled()
  })

  it('commits a move of just over 1 Hz', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, TUNED_HZ + 2, BANDWIDTH_HZ + 2)
    mouse('mouseup')
    expect(source.requestTune).toHaveBeenCalledWith(TUNED_HZ + 2)
    expect(source.requestBandwidth).toHaveBeenCalledWith(BANDWIDTH_HZ + 2)
  })

  it('measures the move from where the drag started, not from a mid-drag re-pin', () => {
    const { attach, bracket, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_520_000, BANDWIDTH_HZ)
    // A store round-trip re-pins the bracket mid-drag at the dragged value…
    source.currentFreqHz = 145_520_000
    bracket.applyMarker()
    mouse('mouseup')
    // …but the commit still sees the move from the original carrier.
    expect(source.requestTune).toHaveBeenCalledWith(145_520_000)
  })

  it('measures the move from the bracket as drawn when grabbed, not from the store', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    // The store moved on but the bracket has not been re-pinned yet.
    source.currentFreqHz = 145_000_000
    grab(waterfall)
    mouse('mouseup')
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('releases sigplot’s drag flags after a commit and after a click', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall, true)
    spectrum.dragging = true
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    mouse('mouseup')
    expect([spectrum.dragging, spectrum.edge_dragging]).toEqual([false, false])
    expect([waterfall.dragging, waterfall.edge_dragging]).toEqual([false, false])
    expect(bracket.isBracketDragActive()).toBe(false)

    grab(waterfall)
    mouse('mouseup')
    expect(waterfall.dragging).toBe(false)
    expect(bracket.isBracketDragActive()).toBe(false)
  })

  it('never retunes from a read-only follower, but still releases the flags', () => {
    const { attach, source } = mountBracket({ readOnly: true })
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, 20_000)
    mouse('mouseup')
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(source.requestBandwidth).not.toHaveBeenCalled()
    expect(waterfall.dragging).toBe(false)
  })

  it('ignores a mouseup that ends no drag', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    waterfall.centerValue = 145_550_000
    mouse('mouseup')
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('ignores a mouseup before the accordions exist', () => {
    const { source } = mountBracket()
    expect(() => mouse('mouseup')).not.toThrow()
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('commits on the first buttonless mousemove when the mouseup was missed', () => {
    const { attach, bracket, source } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    // The button was released outside the window; now the pointer is back.
    waterfall.centerValue = 145_560_000
    mouse('mousemove', { buttons: 0 })
    // It commits where the bracket ended up and releases the drag, instead of
    // treating the move as more dragging.
    expect(source.requestTune).toHaveBeenCalledWith(145_560_000)
    expect(spectrum.centerValue).toBe(145.56)
    expect(waterfall.dragging).toBe(false)
    expect(bracket.isBracketDragActive()).toBe(false)
  })

  it('keeps following the pointer while the button is held', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    expect(source.requestTune).not.toHaveBeenCalled()
  })
})

describe('useBandwidthBracketDrag — aborting a drag', () => {
  it('snaps the brackets back to the tuned state without committing', () => {
    const { attach, bracket, source } = mountBracket()
    const [spectrum, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, 20_000)
    bracket.abortAccDrag()
    expect(source.requestTune).not.toHaveBeenCalled()
    expect(source.requestBandwidth).not.toHaveBeenCalled()
    expect(waterfall.centerValue).toBe(TUNED_HZ)
    expect(spectrum.centerValue).toBe(TUNED_HZ / HZ_PER_MHZ)
    expect(waterfall.dragging).toBe(false)
    expect(bracket.isBracketDragActive()).toBe(false)
  })

  it('aborts on a cancelled pointer gesture', () => {
    const { attach, source } = mountBracket()
    const [, waterfall] = attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    document.dispatchEvent(new Event('pointercancel'))
    expect(waterfall.centerValue).toBe(TUNED_HZ)
    mouse('mouseup')
    expect(source.requestTune).not.toHaveBeenCalled()
  })

  it('does nothing when no drag is under way', () => {
    const { attach, bracket } = mountBracket()
    const [, waterfall] = attach()
    waterfall.centerValue = 1
    bracket.abortAccDrag()
    expect(waterfall.centerValue).toBe(1)
  })
})

describe('useBandwidthBracketDrag — resize cursor', () => {
  it('turns on within the grab tolerance of either edge, on either plot', () => {
    const { attach, bracket } = mountBracket()
    attach()
    mouse('mousemove', point(EDGE_LOW_PX + GRAB_TOLERANCE_PX - 1))
    expect(bracket.nearEdge.value).toBe(true)
    mouse('mousemove', point(EDGE_HIGH_PX - GRAB_TOLERANCE_PX + 1))
    expect(bracket.nearEdge.value).toBe(true)
  })

  it('turns off at the tolerance and between the edges', () => {
    const { attach, bracket } = mountBracket()
    attach()
    mouse('mousemove', point(EDGE_LOW_PX + 1))
    expect(bracket.nearEdge.value).toBe(true)
    mouse('mousemove', point(EDGE_LOW_PX + GRAB_TOLERANCE_PX))
    expect(bracket.nearEdge.value).toBe(false)
    mouse('mousemove', point(CENTRE_PX))
    expect(bracket.nearEdge.value).toBe(false)
  })

  it('uses the waterfall when only its edge is close', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum] = attach()
    spectrum.properties = { ...spectrum.properties, loc_1: 900, loc_2: 950 }
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(true)
  })

  it('stays off outside the data box', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    // Edges right on the data box's sides, so only the box test rules them out.
    for (const accordion of [spectrum, waterfall]) {
      accordion.properties = { ...accordion.properties, loc_1: DATA_BOX.l, loc_2: DATA_BOX.r }
    }
    mouse('mousemove', point(DATA_BOX.l - 1))
    expect(bracket.nearEdge.value).toBe(false)
    mouse('mousemove', point(DATA_BOX.r + 1))
    expect(bracket.nearEdge.value).toBe(false)
    mouse('mousemove', point(DATA_BOX.l, DATA_BOX.t - 1))
    expect(bracket.nearEdge.value).toBe(false)
    mouse('mousemove', point(DATA_BOX.l, DATA_BOX.b + 1))
    expect(bracket.nearEdge.value).toBe(false)
    mouse('mousemove', point(DATA_BOX.l, DATA_BOX.b))
    expect(bracket.nearEdge.value).toBe(true)
  })

  it('holds for the whole of a resize drag, wherever the pointer goes', () => {
    const { attach, bracket } = mountBracket()
    const [, waterfall] = attach()
    waterfall.edge_dragging = true
    mouse('mousemove', point(-500, -500))
    expect(bracket.nearEdge.value).toBe(true)
  })

  it('falls back to a 1 px line when the accordion has no edge width', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    for (const accordion of [spectrum, waterfall]) {
      accordion.properties = { loc_1: EDGE_LOW_PX, loc_2: EDGE_HIGH_PX }
    }
    mouse('mousemove', point(EDGE_LOW_PX + 5))
    expect(bracket.nearEdge.value).toBe(true)
    mouse('mousemove', point(EDGE_LOW_PX + 6))
    expect(bracket.nearEdge.value).toBe(false)
  })

  it('stays off until sigplot has drawn the edges', () => {
    const { attach, bracket } = mountBracket()
    const [spectrum, waterfall] = attach()
    spectrum.properties = undefined
    waterfall.properties = { loc_1: EDGE_LOW_PX }
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
    waterfall.properties = { loc_2: EDGE_LOW_PX }
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
  })

  it('stays off without a data box, an element, or the accordions', () => {
    const { attach, bracket, spectrumPlot, waterfallPlot, elements, plots } = mountBracket()
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
    attach()
    delete spectrumPlot._Mx
    delete waterfallPlot._Mx
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
    spectrumPlot._Mx = { ...DATA_BOX }
    waterfallPlot._Mx = { ...DATA_BOX }
    elements.spectrum = null
    elements.waterfall = null
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
    elements.spectrum = plotElement()
    plots.spectrum = null
    mouse('mousemove', point(EDGE_LOW_PX))
    expect(bracket.nearEdge.value).toBe(false)
  })
})

describe('useBandwidthBracketDrag — starting a touch on the bracket', () => {
  function touchOn(
    harness: Harness,
    elementX: number,
    onSpectrum = true,
    clientY = INSIDE_Y,
  ): { started: boolean; event: TouchEvent } {
    const at = point(elementX, clientY)
    const event = touchEvent('touchstart', [at])
    vi.spyOn(event, 'preventDefault')
    vi.spyOn(event, 'stopImmediatePropagation')
    const started = harness.bracket.tryStartBracketTouch(event, at as Touch, onSpectrum)
    return { started, event }
  }

  it('bridges a touch on the bracket centre into a sigplot mousedown', () => {
    const harness = mountBracket()
    harness.attach()
    const canvasEvents = recordCanvas(harness.spectrumPlot)
    const { started, event } = touchOn(harness, CENTRE_PX + GRAB_TOLERANCE_PX - 1)
    expect(started).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopImmediatePropagation).toHaveBeenCalled()
    expect(canvasEvents).toHaveLength(1)
    expect(canvasEvents[0]).toMatchObject({
      type: 'mousedown',
      clientX: ELEMENT_LEFT_PX + CENTRE_PX + GRAB_TOLERANCE_PX - 1,
      clientY: INSIDE_Y,
      button: 0,
      buttons: 1,
      bubbles: true,
    })
  })

  it('grabs within the edge tolerance of either edge', () => {
    const harness = mountBracket()
    const [spectrum] = harness.attach()
    // Move the centre well away so only the edges can match.
    spectrum.properties = { ...spectrum.properties, center_location: 900 }
    expect(touchOn(harness, EDGE_LOW_PX - GRAB_TOLERANCE_PX + 1).started).toBe(true)
    expect(touchOn(harness, EDGE_HIGH_PX + GRAB_TOLERANCE_PX - 1).started).toBe(true)
    expect(touchOn(harness, EDGE_HIGH_PX + GRAB_TOLERANCE_PX).started).toBe(false)
  })

  it('leaves a touch away from the bracket to sigplot', () => {
    const harness = mountBracket()
    harness.attach()
    const canvasEvents = recordCanvas(harness.spectrumPlot)
    const { started, event } = touchOn(harness, EDGE_HIGH_PX + GRAB_TOLERANCE_PX + 100)
    expect(started).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled()
    expect(canvasEvents).toHaveLength(0)
  })

  it('stops exactly at the centre tolerance', () => {
    const harness = mountBracket()
    const [spectrum] = harness.attach()
    spectrum.properties = { ...spectrum.properties, loc_1: 100, loc_2: 200 }
    expect(touchOn(harness, CENTRE_PX + GRAB_TOLERANCE_PX).started).toBe(false)
  })

  it('falls back to 1 px lines when the accordion has no line widths', () => {
    const harness = mountBracket()
    const [spectrum] = harness.attach()
    spectrum.properties = { loc_1: EDGE_LOW_PX, loc_2: EDGE_HIGH_PX, center_location: CENTRE_PX }
    expect(touchOn(harness, EDGE_LOW_PX + 5).started).toBe(true)
    expect(touchOn(harness, CENTRE_PX + 5).started).toBe(true)
    expect(touchOn(harness, CENTRE_PX + 6).started).toBe(false)
  })

  it('ignores edges and centre sigplot has not drawn yet', () => {
    const harness = mountBracket()
    const [spectrum] = harness.attach()
    spectrum.properties = {}
    expect(touchOn(harness, EDGE_LOW_PX).started).toBe(false)
    spectrum.properties = undefined
    expect(touchOn(harness, EDGE_LOW_PX).started).toBe(false)
  })

  it('ignores a touch outside the data box', () => {
    const harness = mountBracket()
    const [spectrum] = harness.attach()
    spectrum.properties = { ...spectrum.properties, loc_1: DATA_BOX.l, loc_2: DATA_BOX.r }
    expect(touchOn(harness, DATA_BOX.l - 1).started).toBe(false)
    expect(touchOn(harness, DATA_BOX.r + 1).started).toBe(false)
    expect(touchOn(harness, DATA_BOX.l, true, DATA_BOX.t - 1).started).toBe(false)
    expect(touchOn(harness, DATA_BOX.l, true, DATA_BOX.b + 1).started).toBe(false)
    expect(touchOn(harness, DATA_BOX.l, true, DATA_BOX.t).started).toBe(true)
  })

  it('uses the waterfall plot and its own accordion for a touch on the waterfall', () => {
    const harness = mountBracket()
    const [spectrum, waterfall] = harness.attach()
    spectrum.properties = {}
    waterfall.properties = { center_location: 700, center_line_style: { lineWidth: 20 } }
    // The waterfall sits 300 px further right, so only its own rect maps the
    // touch onto its centre line.
    harness.elements.waterfall = plotElement(ELEMENT_LEFT_PX + 300)
    const spectrumEvents = recordCanvas(harness.spectrumPlot)
    const waterfallEvents = recordCanvas(harness.waterfallPlot)
    expect(touchOn(harness, 1000, false).started).toBe(true)
    expect(waterfallEvents.map((event) => event.type)).toEqual(['mousedown'])
    expect(spectrumEvents).toHaveLength(0)
    expect(touchOn(harness, 700, true).started).toBe(false)
  })

  it('claims the touch but dispatches nothing when the plot has no widget canvas', () => {
    const harness = mountBracket()
    harness.attach()
    const canvasEvents = recordCanvas(harness.spectrumPlot)
    harness.spectrumPlot._Mx = { ...DATA_BOX }
    const { started, event } = touchOn(harness, CENTRE_PX)
    expect(started).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(canvasEvents).toHaveLength(0)
  })

  it('ignores a touch before the accordions exist, or without a plot, element or data box', () => {
    const harness = mountBracket()
    expect(touchOn(harness, CENTRE_PX).started).toBe(false)
    harness.attach()
    harness.plots.spectrum = null
    expect(touchOn(harness, CENTRE_PX).started).toBe(false)
    harness.plots.spectrum = harness.spectrumPlot
    harness.elements.spectrum = null
    expect(touchOn(harness, CENTRE_PX).started).toBe(false)
    harness.elements.spectrum = plotElement()
    delete harness.spectrumPlot._Mx
    expect(touchOn(harness, CENTRE_PX).started).toBe(false)
  })
})

describe('useBandwidthBracketDrag — following a bridged touch', () => {
  function startBridge(harness: Harness): MouseEvent[] {
    harness.attach()
    const canvasEvents = recordCanvas(harness.spectrumPlot)
    const at = point(CENTRE_PX)
    harness.bracket.tryStartBracketTouch(touchEvent('touchstart', [at]), at as Touch, true)
    return canvasEvents
  }

  it('turns each touchmove into a held-button mousemove and stops the page scrolling', () => {
    const harness = mountBracket()
    const canvasEvents = startBridge(harness)
    const move = touchEvent('touchmove', [point(CENTRE_PX + 40, 120)])
    document.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(true)
    expect(canvasEvents[1]).toMatchObject({
      type: 'mousemove',
      clientX: ELEMENT_LEFT_PX + CENTRE_PX + 40,
      clientY: 120,
      buttons: 1,
    })
  })

  it('ends with a buttonless mouseup where the finger lifted', () => {
    const harness = mountBracket()
    const canvasEvents = startBridge(harness)
    document.dispatchEvent(touchEvent('touchend', [], [point(CENTRE_PX + 60, 130)]))
    expect(canvasEvents[1]).toMatchObject({
      type: 'mouseup',
      clientX: ELEMENT_LEFT_PX + CENTRE_PX + 60,
      clientY: 130,
      buttons: 0,
    })
    // The bridge is closed: later touches are left alone.
    const move = touchEvent('touchmove', [point(CENTRE_PX)])
    document.dispatchEvent(move)
    document.dispatchEvent(touchEvent('touchend', [], [point(CENTRE_PX)]))
    expect(move.defaultPrevented).toBe(false)
    expect(canvasEvents).toHaveLength(2)
  })

  it('leaves touches alone when no bridge was started', () => {
    const harness = mountBracket()
    harness.attach()
    const canvasEvents = recordCanvas(harness.spectrumPlot)
    const move = touchEvent('touchmove', [point(CENTRE_PX)])
    document.dispatchEvent(move)
    document.dispatchEvent(touchEvent('touchend', [], [point(CENTRE_PX)]))
    expect(move.defaultPrevented).toBe(false)
    expect(canvasEvents).toHaveLength(0)
  })

  it('aborts the drag on a cancelled touch instead of committing it', () => {
    const harness = mountBracket()
    const [, waterfall] = harness.attach()
    const at = point(CENTRE_PX)
    harness.bracket.tryStartBracketTouch(touchEvent('touchstart', [at]), at as Touch, true)
    // Stand in for sigplot reacting to the bridged mousedown/mousemove.
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    document.dispatchEvent(touchEvent('touchcancel'))
    expect(waterfall.centerValue).toBe(TUNED_HZ)
    expect(harness.source.requestTune).not.toHaveBeenCalled()
    expect(harness.bracket.isBracketDragActive()).toBe(false)
    // The bridge is closed: a later touchmove is left to the page.
    const move = touchEvent('touchmove', [point(CENTRE_PX)])
    document.dispatchEvent(move)
    expect(move.defaultPrevented).toBe(false)
  })

  it('ignores a touchcancel when no bridge is open', () => {
    const harness = mountBracket()
    const [, waterfall] = harness.attach()
    grab(waterfall)
    dragWaterfallTo(waterfall, 145_550_000, BANDWIDTH_HZ)
    document.dispatchEvent(touchEvent('touchcancel'))
    // The mouse drag carries on and still commits.
    expect(waterfall.centerValue).toBe(145_550_000)
    mouse('mouseup')
    expect(harness.source.requestTune).toHaveBeenCalledWith(145_550_000)
  })
})
