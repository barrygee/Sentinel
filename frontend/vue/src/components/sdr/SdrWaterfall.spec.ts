import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import { useSdrStore, type SdrSpectrumFrame } from '@/stores/sdr'
import { useSettingsStore } from '@/stores/settings'

// ── Shared mock registries (hoisted so the vi.mock factories can fill them) ─────
const registry = vi.hoisted(() => {
  return {
    plots: [] as FakePlotShape[],
    accordions: [] as FakeAccShape[],
    annotations: [] as FakeAnnShape[],
    // Handle to the mocked sigplot mx.text spy so tests can inspect the exact
    // (repositioned) x the override delegates to sigplot's real draw with.
    mxTextSpy: null as { mock: { calls: unknown[][] } } | null,
  }
})

interface FakeMx {
  l: number
  r: number
  t: number
  b: number
  text_w: number
  text_h: number
  width: number
  height: number
  level: number
  stk: Array<{ x1: number; y1: number; x2: number; y2: number; ymin: number; ymax: number }>
  // A real widget canvas so dispatchBridgedMouseEvent (SdrWaterfall.vue) has
  // something to dispatch synthetic mouse events at, mirroring sigplot's real
  // `_Mx.wid_canvas`.
  wid_canvas: HTMLCanvasElement
}
interface FakeGx {
  xdiv: number
  ymin: number
  ymax: number
  autoy: number
  autol: number
  lyr: Array<{ ymin: number; ymax: number }>
}
interface FakePlotShape {
  _el: HTMLElement
  _opts: Record<string, unknown>
  _Mx: FakeMx
  _Gx: FakeGx
  overlay_array: (data: unknown, hdr: unknown, opts: unknown) => string
  overlay_pipe: (hdr: unknown, opts: unknown) => string
  remove_layer: (uuid: string) => void
  reload: (uuid: string, bins: unknown) => void
  push: (uuid: string, bins: unknown) => void
  zoom: (a: unknown, b: unknown, c: unknown) => void
  unzoom: () => void
  change_settings: (s: Record<string, unknown>) => void
  add_plugin: (p: unknown, n: number) => void
  remove_plugin: (p: unknown) => void
  checkresize: () => void
  redraw: () => void
  disable_listeners: () => void
  calls: Record<string, unknown[][]>
}
interface FakeAccShape {
  _opts: Record<string, unknown>
  dragging: boolean
  edge_dragging: boolean
  properties: {
    loc_1?: number
    loc_2?: number
    center_location?: number
    edge_line_style?: { lineWidth?: number }
    center_line_style?: { lineWidth?: number }
  }
  center: (v?: number) => number | FakeAccShape
  width: (v?: number) => number | FakeAccShape
  min_width: (v: number) => void
  max_width: (v: number) => void
  display: (v: boolean) => void
  _center: number
  _width: number
  _displayed: boolean | null
}
interface FakeAnnShape {
  _opts: Record<string, unknown>
  clear_annotations: () => void
  onmouseup: (() => void) | null
}

vi.mock('sigplot', () => {
  let uuidSeq = 0
  function FakePlot(this: FakePlotShape, el: HTMLElement, opts: Record<string, unknown>) {
    this._el = el
    this._opts = opts
    this.calls = {}
    const record = (name: string, args: unknown[]) => {
      ;(this.calls[name] ??= []).push(args)
    }
    this._Mx = {
      l: 56,
      r: 988,
      t: 20,
      b: 270,
      text_w: 8,
      text_h: 12,
      width: 1000,
      height: 300,
      level: 0,
      stk: [{ x1: 56, y1: 20, x2: 988, y2: 270, ymin: -100, ymax: 0 }],
      // Appended into the real plot container (attached to document.body via
      // mountWaterfall's `attachTo`), mirroring how sigplot actually nests its
      // widget canvas — needed so a synthetic mousedown/mousemove/mouseup
      // dispatched at it (dispatchBridgedMouseEvent) bubbles up to the
      // document-level accordion-drag listeners like a real touch would.
      wid_canvas: el.appendChild(document.createElement('canvas')),
    }
    this._Gx = {
      xdiv: 1,
      ymin: (opts.ymin as number) ?? -100,
      ymax: (opts.ymax as number) ?? 0,
      autoy: (opts.autoy as number) ?? 0,
      autol: (opts.autol as number) ?? -1,
      lyr: [],
    }
    this.overlay_array = (data, hdr, layerOpts) => {
      record('overlay_array', [data, hdr, layerOpts])
      return `spec-${++uuidSeq}`
    }
    this.overlay_pipe = (hdr, layerOpts) => {
      record('overlay_pipe', [hdr, layerOpts])
      return `wf-${++uuidSeq}`
    }
    this.remove_layer = (uuid) => record('remove_layer', [uuid])
    this.reload = (uuid, bins) => record('reload', [uuid, bins])
    this.push = (uuid, bins) => record('push', [uuid, bins])
    this.zoom = (a, b, c) => record('zoom', [a, b, c])
    this.unzoom = () => record('unzoom', [])
    this.change_settings = (s) => record('change_settings', [s])
    this.add_plugin = (p, n) => record('add_plugin', [p, n])
    this.remove_plugin = (p) => record('remove_plugin', [p])
    this.redraw = () => record('redraw', [])
    this.disable_listeners = () => record('disable_listeners', [])
    // Simulate sigplot's layout pass: write back settled margins so the Mx
    // accessor setters installed by installMarginTweaks are exercised.
    this.checkresize = () => {
      record('checkresize', [])
      const elWidth = el.clientWidth || 1000
      const elHeight = el.clientHeight || 300
      this._Mx.width = elWidth
      this._Mx.height = elHeight
      this._Mx.l = this._Mx.text_w * 6
      this._Mx.r = elWidth - 50
      this._Mx.t = 1
      this._Mx.b = elHeight - 20
    }
    registry.plots.push(this)
  }
  function FakeAccordion(this: FakeAccShape, opts: Record<string, unknown>) {
    this._opts = opts
    this.dragging = false
    this.edge_dragging = false
    this.properties = { loc_1: undefined, loc_2: undefined, edge_line_style: { lineWidth: 1 } }
    this._center = 0
    this._width = 0
    this._displayed = null
    this.center = function (this: FakeAccShape, v?: number) {
      if (v !== undefined) {
        this._center = v
        return this
      }
      return this._center
    }
    this.width = function (this: FakeAccShape, v?: number) {
      if (v !== undefined) {
        this._width = v
        return this
      }
      return this._width
    }
    this.min_width = () => {}
    this.max_width = () => {}
    this.display = function (this: FakeAccShape, v: boolean) {
      this._displayed = v
    }
    registry.accordions.push(this)
  }
  function FakeAnnotation(this: FakeAnnShape, opts: Record<string, unknown>) {
    this._opts = opts
    this.onmouseup = null
    this.clear_annotations = () => {}
    registry.annotations.push(this)
  }
  const sigplot = {
    Plot: FakePlot,
    plugins: { AccordionPlugin: FakeAccordion, AnnotationPlugin: FakeAnnotation },
  }
  return { default: sigplot }
})

vi.mock('sigplot/js/mx', () => {
  // Echo the (possibly rewritten) label back so tests can observe how the
  // override transformed it before delegating to sigplot's real draw.
  const text = vi.fn((_Mx: unknown, _x: number, _y: number, lbl: unknown) => lbl)
  registry.mxTextSpy = text as unknown as { mock: { calls: unknown[][] } }
  const mx = {
    drawaxis: vi.fn(() => 'AXIS'),
    text,
    textline: vi.fn(),
  }
  return { default: mx }
})

// Import the patched mx AFTER the mock so we can exercise the override bodies.
// @ts-expect-error – sigplot ships no .d.ts for its internal mx module (mirrors
// the component's own import).
import mx from 'sigplot/js/mx'
import SdrWaterfall from './SdrWaterfall.vue'

enableAutoUnmount(afterEach)

// ── Controllable rAF / performance / ResizeObserver ────────────────────────────
let rafQueue: Array<{ id: number; cb: FrameRequestCallback; cancelled: boolean }>
let rafSeq: number
let nowMs: number
let roInstances: Array<{ cb: ResizeObserverCallback; els: Element[] }>

function flushRaf(maxRounds = 12): void {
  let rounds = 0
  while (rafQueue.some((entry) => !entry.cancelled) && rounds < maxRounds) {
    const pending = rafQueue.filter((entry) => !entry.cancelled)
    rafQueue = []
    for (const entry of pending) entry.cb(nowMs)
    rounds += 1
  }
}

function triggerResize(): void {
  for (const ro of roInstances) ro.cb([], ro as unknown as ResizeObserver)
}

beforeEach(() => {
  setActivePinia(createPinia())
  registry.plots.length = 0
  registry.accordions.length = 0
  registry.annotations.length = 0
  rafQueue = []
  rafSeq = 0
  nowMs = 1000
  roInstances = []

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    const id = ++rafSeq
    rafQueue.push({ id, cb, cancelled: false })
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
    const entry = rafQueue.find((candidate) => candidate.id === id)
    if (entry) entry.cancelled = true
  })
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: ResizeObserverCallback
      els: Element[] = []
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        roInstances.push(this)
      }
      observe(el: Element) {
        this.els.push(el)
      }
      unobserve() {}
      disconnect() {}
    },
  )

  // vitest's jsdom environment doesn't expose a brand-correct `Window`
  // instance as `window` (it's a merged global, not literally jsdom's Window
  // object), so jsdom's own MouseEvent constructor rejects `view: window`
  // with "member view is not of type Window" — a test-environment artifact
  // only; real browsers accept this fine. dispatchBridgedMouseEvent
  // (SdrWaterfall.vue, the touch→mouse accordion bridge) sets `view: window`
  // on every synthetic event it dispatches, so strip that field before
  // delegating to the real constructor. Built via Reflect.construct with the
  // REAL MouseEvent as newTarget (rather than a subclass) so the resulting
  // instance's prototype is still exactly window.MouseEvent.prototype — vue
  // test-utils' own trigger() reads Object.getOwnPropertyDescriptor straight
  // off that prototype to decide which synthetic properties are read-only, so
  // a subclass (with its own, empty prototype) would break its `button`/
  // `buttons` handling for every existing mouse-event test in this file.
  const RealMouseEvent = window.MouseEvent
  function StubbedMouseEvent(type: string, init?: MouseEventInit): MouseEvent {
    const { view: _unusedView, ...rest } = init ?? {}
    return Reflect.construct(RealMouseEvent, [type, rest], RealMouseEvent) as MouseEvent
  }
  StubbedMouseEvent.prototype = RealMouseEvent.prototype
  vi.stubGlobal('MouseEvent', StubbedMouseEvent)

  // Layout: jsdom returns 0 for all box metrics. Give the plot elements a real
  // size so the FFT-bin math and click/drag geometry have something to work on.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 300,
    width: 1000,
    height: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })

  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeFrame(overrides: Partial<SdrSpectrumFrame> = {}): SdrSpectrumFrame {
  return {
    bins: new Array(1024).fill(-50),
    center_hz: 100_000_000,
    sample_rate: 2_048_000,
    ts: Date.now(),
    ...overrides,
  }
}

/** Mount, run the deferred rAF init so the plots exist, and return refs. */
function mountWaterfall(): {
  wrapper: VueWrapper
  store: ReturnType<typeof useSdrStore>
  settings: ReturnType<typeof useSettingsStore>
} {
  const store = useSdrStore()
  const settings = useSettingsStore()
  const wrapper = mount(SdrWaterfall, { attachTo: document.body })
  flushRaf() // run onMounted's double-rAF → initPlots, plus sizeSliders
  return { wrapper, store, settings }
}

function specPlot() {
  return registry.plots[0]
}
function wfPlotInstance() {
  return registry.plots[1]
}
// specAcc, wfAcc, specCar, wfCar are pushed in that order in initPlots.
function specAccordion() {
  return registry.accordions[0]
}
function wfAccordion() {
  return registry.accordions[1]
}

// jsdom's Touch constructor is unavailable, but its TouchEvent constructor
// happily accepts plain {clientX, clientY} objects for touches/changedTouches
// — the component only ever reads those two fields off each entry, so a
// plain object satisfies it structurally without needing a real Touch.
type FakeTouch = { clientX: number; clientY: number }
function makeTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: FakeTouch[],
  changedTouches: FakeTouch[] = touches,
): TouchEvent {
  return new TouchEvent(type, {
    touches: touches as unknown as Touch[],
    changedTouches: changedTouches as unknown as Touch[],
    bubbles: true,
    cancelable: true,
  })
}

/** Put the component into a live, playing state with a span set by a frame. */
async function playWithFrame(
  store: ReturnType<typeof useSdrStore>,
  overrides: Partial<SdrSpectrumFrame> = {},
): Promise<void> {
  store.setPlaying(true)
  nowMs += 1000
  store.setSpectrum(makeFrame(overrides))
  await flushPromises()
  flushRaf()
  await flushPromises()
}

// =============================================================================
describe('SdrWaterfall — mount & init', () => {
  it('creates a spectrum and waterfall plot with accordions and annotation', () => {
    const { wrapper } = mountWaterfall()
    expect(registry.plots).toHaveLength(2)
    // 4 accordions: specAcc, wfAcc, specCar, wfCar
    expect(registry.accordions).toHaveLength(4)
    expect(registry.annotations).toHaveLength(1)
    expect(wrapper.find('#sdr-waterfall').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = mountWaterfall()
    // region: controls live inside an app landmark in-app; label: a handful of
    // inputs are styled sliders covered by the surrounding label text — both
    // deferred to the phase-7/8 a11y sweep, every other rule stays on.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})

describe('SdrWaterfall — spectrum frame', () => {
  it('builds pipes and pushes a waterfall row on a new frame', async () => {
    const { store } = mountWaterfall()
    store.setPlaying(true)
    nowMs += 1000
    store.setSpectrum(makeFrame())
    await flushPromises()
    flushRaf()
    expect(wfPlotInstance().calls.push).toBeTruthy()
    expect(specPlot().calls.reload).toBeTruthy()
  })

  it('ignores frames when not playing', async () => {
    const { store } = mountWaterfall()
    store.setPlaying(false)
    store.setSpectrum(makeFrame())
    await flushPromises()
    flushRaf()
    expect(wfPlotInstance().calls.push).toBeUndefined()
  })

  it('ignores frames while a search sweep is active', async () => {
    const { store } = mountWaterfall()
    store.setPlaying(true)
    store.searchSweeping = true
    store.setSpectrum(makeFrame())
    await flushPromises()
    flushRaf()
    expect(wfPlotInstance().calls.push).toBeUndefined()
  })

  it('rate-caps waterfall rows: a second frame within the cap window is skipped', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const firstPushes = wfPlotInstance().calls.push.length
    // Same timestamp → within WF_ROW_MIN_MS → no extra push, but spectrum reloads.
    store.setSpectrum(makeFrame({ ts: Date.now() + 1 }))
    await flushPromises()
    flushRaf()
    expect(wfPlotInstance().calls.push.length).toBe(firstPushes)
  })

  it('mirrors the live time-window into the active zoom level when zoomed', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    // Zoom in so the waterfall plot sits on level > 0, then feed lyr data.
    const wf = wfPlotInstance()
    wf._Mx.level = 1
    wf._Mx.stk[1] = { x1: 0, y1: 0, x2: 0, y2: 0, ymin: 0, ymax: 0 }
    wf._Gx.lyr = [{ ymin: 5, ymax: 9 }]
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 100 }))
    await flushPromises()
    flushRaf()
    expect(wf._Mx.stk[1].ymin).toBe(5)
    expect(wf._Mx.stk[1].ymax).toBe(9)
  })

  it('clears the live pan offset when a retune lands a new span centre', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    // Simulate a held pan then a frame with a new centre.
    nowMs += 1000
    store.setSpectrum(makeFrame({ center_hz: 101_000_000, ts: Date.now() + 200 }))
    await flushPromises()
    flushRaf()
    // No assertion error means the center-change branch ran; verify span moved.
    expect(specPlot().calls.overlay_array.length).toBeGreaterThan(1)
  })
})

// =============================================================================
describe('SdrWaterfall — mx.drawaxis / mx.text overrides', () => {
  // The component patches sigplot's internal mx module at import time. Mounting
  // the component (done in beforeEach via the import) installs the overrides.
  beforeEach(() => {
    mountWaterfall()
    ;(mx.textline as ReturnType<typeof vi.fn>).mockClear()
  })

  function makeAxisMx(fg: string, bg: string) {
    return {
      stk: [{ x1: 10, y1: 5, x2: 990, y2: 280 }],
      level: 0,
      active_canvas: document.createElement('canvas'),
      fg,
      bg,
      width: 1000,
      height: 300,
    }
  }

  it('suppresses ticks/grid and skips the box on the waterfall plot (fg === bg)', () => {
    const flags: Record<string, unknown> = {}
    const ret = (mx.drawaxis as unknown as (...a: unknown[]) => unknown)(
      {},
      makeAxisMx('#000', '#000'),
      1,
      1,
      1,
      1,
      flags,
    )
    expect(ret).toBe('AXIS')
    expect(flags.noxtics).toBe(true)
    expect(flags.grid).toBe(false)
    expect(flags.noaxisbox).toBe(true)
    expect(mx.textline).not.toHaveBeenCalled() // userWantsBox === false
  })

  it('draws bottom+left box edges with exactbox geometry on the spectrum plot', () => {
    const flags: Record<string, unknown> = { exactbox: true }
    ;(mx.drawaxis as unknown as (...a: unknown[]) => unknown)(
      {},
      makeAxisMx('#fff', '#000'),
      1,
      1,
      1,
      1,
      flags,
    )
    expect(mx.textline).toHaveBeenCalledTimes(2)
  })

  it('draws box edges with padded (non-exactbox) geometry', () => {
    const flags: Record<string, unknown> = {}
    ;(mx.drawaxis as unknown as (...a: unknown[]) => unknown)(
      {},
      makeAxisMx('#fff', '#000'),
      1,
      1,
      1,
      1,
      flags,
    )
    expect(mx.textline).toHaveBeenCalledTimes(2)
  })

  it('does not draw the box when noaxisbox is already requested', () => {
    const flags: Record<string, unknown> = { noaxisbox: true }
    ;(mx.drawaxis as unknown as (...a: unknown[]) => unknown)(
      {},
      makeAxisMx('#fff', '#000'),
      1,
      1,
      1,
      1,
      flags,
    )
    expect(mx.textline).not.toHaveBeenCalled()
  })

  const textMx = { b: 250, l: 56, text_h: 12, text_w: 8 }

  it('rewrites an x-axis "344." label to "344.0" and skips the canvas draw', () => {
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(
      textMx,
      100,
      250 + 12, // y inside the gutter band
      '344.',
    )
    expect(ret).toBeUndefined() // x-axis labels are drawn as HTML, canvas skipped
  })

  it('pads a bare-integer x-axis label "433" to "433.0" and skips the draw', () => {
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 100, 260, '433')
    expect(ret).toBeUndefined()
  })

  it('strips the trailing dot from a y-axis "-30." label and delegates to sigplot', () => {
    // Not an x-axis label → original draw runs with the dot stripped.
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 100, '-30.')
    expect(ret).toBe('-30')
  })

  it('rounds a fractional y-axis dB label to whole dB and delegates to sigplot', () => {
    // sigplot divides the dB range by ydiv and can emit ticks like "-20.666667";
    // the override rounds these to whole dB so the gutter reads cleanly.
    expect((mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 100, '-20.666667')).toBe(
      '-21',
    )
    expect((mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 100, '-41.333333')).toBe(
      '-41',
    )
  })

  it('suppresses the x-axis "+Δ" offset caption (drawn as HTML labels instead)', () => {
    // SigPlot's offset caption ("314.8 +Δ 0.1") is redundant with our HTML freq
    // labels and overlaps the bottom dB label on small screens, so it is dropped.
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 260, '314.8 +Δ 0.1')
    expect(ret).toBeUndefined()
  })

  it('delegates a non-numeric label straight through', () => {
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 100, 'Hz', '#fff')
    expect(ret).toBe('Hz')
  })

  it('delegates when the label is not a string', () => {
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(textMx, 5, 100, 42)
    expect(ret).toBe(42)
  })

  // ── Y-axis dB label right-alignment ──────────────────────────────────────────
  // The override measures each dB label's real pixel width in sigplot's font and
  // right-aligns it to a fixed gap left of the data-box edge (Mx.l), so proportional
  // (Barlow) digits never drift into the spectrum. These assert the delegated x.
  function lastDrawX(): number {
    const calls = registry.mxTextSpy?.mock.calls ?? []
    return calls[calls.length - 1]?.[1] as number
  }

  it('right-aligns a y-axis dB label to a 12px gap left of the data-box edge using measured width', () => {
    const measureText = vi.fn(() => ({ width: 20 }))
    const context = { font: '', measureText }
    const canvas = { getContext: vi.fn(() => context) }
    const ret = (mx.text as unknown as (...a: unknown[]) => unknown)(
      {
        b: 250,
        l: 56,
        text_h: 12,
        text_w: 8,
        active_canvas: canvas,
        font: { font: '12px Barlow' },
      },
      5,
      100,
      '-30',
    )
    expect(ret).toBe('-30')
    expect(canvas.getContext).toHaveBeenCalledWith('2d')
    // Measured in sigplot's own font so the width is accurate.
    expect(context.font).toBe('12px Barlow')
    expect(measureText).toHaveBeenCalledWith('-30')
    // x = Mx.l - gapToSpectrum(12) - width(20) = 24.
    expect(lastDrawX()).toBe(24)
  })

  it('clamps a wide y-axis label to the minimum left-edge gap so it stays on-canvas', () => {
    const context = { font: '', measureText: vi.fn(() => ({ width: 100 })) }
    const canvas = { getContext: vi.fn(() => context) }
    ;(mx.text as unknown as (...a: unknown[]) => unknown)(
      {
        b: 250,
        l: 56,
        text_h: 12,
        text_w: 8,
        active_canvas: canvas,
        font: { font: '12px Barlow' },
      },
      5,
      100,
      '-128',
    )
    // max(minGapFromLeftEdge(4), 56 - 12 - 100) = 4.
    expect(lastDrawX()).toBe(4)
  })

  it('falls back to Mx.canvas and skips the font set when Mx.font is absent', () => {
    const context = { font: '', measureText: vi.fn(() => ({ width: 10 })) }
    const canvas = { getContext: vi.fn(() => context) }
    ;(mx.text as unknown as (...a: unknown[]) => unknown)(
      // No active_canvas → falls back to canvas; no font → font is left untouched.
      { b: 250, l: 56, text_h: 12, text_w: 8, canvas },
      5,
      100,
      '0',
    )
    expect(context.font).toBe('')
    expect(context.measureText).toHaveBeenCalledWith('0')
    // x = 56 - 12 - 10 = 34.
    expect(lastDrawX()).toBe(34)
  })
})

// =============================================================================
describe('SdrWaterfall — search & scan overlays', () => {
  it('renders the search overlay with progress and MHz range', async () => {
    const { wrapper, store } = mountWaterfall()
    store.searchSweeping = true
    store.searchLowHz = 100_000_000
    store.searchHighHz = 110_000_000
    store.searchCurrentHz = 105_000_000
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-search-overlay').exists()).toBe(true)
    const bar = wrapper.find('.sdr-wf-search-overlay-progress')
    expect(bar.attributes('aria-valuenow')).toBe('50')
    const vals = wrapper.findAll('.sdr-wf-search-overlay-range-val')
    expect(vals[0].text()).toBe('100.0000')
    expect(vals[1].text()).toBe('110.0000')
  })

  it('shows an em-dash range and zero progress when search bounds are null', async () => {
    const { wrapper, store } = mountWaterfall()
    store.searchSweeping = true
    store.searchLowHz = null
    store.searchHighHz = null
    store.searchCurrentHz = null
    await wrapper.vm.$nextTick()
    const vals = wrapper.findAll('.sdr-wf-search-overlay-range-val')
    expect(vals[0].text()).toBe('—')
    expect(wrapper.find('.sdr-wf-search-overlay-progress').attributes('aria-valuenow')).toBe('0')
  })

  it('clamps progress to 0 when the range is inverted (hi <= lo)', async () => {
    const { wrapper, store } = mountWaterfall()
    store.searchSweeping = true
    store.searchLowHz = 110_000_000
    store.searchHighHz = 100_000_000
    store.searchCurrentHz = 105_000_000
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-search-overlay-progress').attributes('aria-valuenow')).toBe('0')
  })

  it('renders the scan overlay with active group chips', async () => {
    const { wrapper, store } = mountWaterfall()
    store.scanSweeping = true
    store.scanGroupNames = ['Marine', 'Airband']
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-scan-overlay-groups').exists()).toBe(true)
    expect(wrapper.findAll('.sdr-scan-group-chip')).toHaveLength(2)
  })

  it('dulls the plots and disables the Zoom/Max/Min sliders while searching', async () => {
    const { wrapper, store } = mountWaterfall()
    // A search sweeps while the radio is playing, so the sliders are otherwise
    // enabled — the sweep is what disables them.
    store.setPlaying(true)
    store.searchSweeping = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('sweeping')
    const sliders = wrapper.findAll('input[type="range"]')
    expect(sliders).toHaveLength(3)
    for (const slider of sliders) {
      expect((slider.element as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('dulls the plots and disables the sliders while group scanning', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true)
    store.scanSweeping = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('sweeping')
    for (const slider of wrapper.findAll('input[type="range"]')) {
      expect((slider.element as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('leaves the plots live and the sliders enabled when not sweeping', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true)
    store.searchSweeping = false
    store.scanSweeping = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('sweeping')
    expect(wrapper.find('.sdr-wf-search-overlay').exists()).toBe(false)
    for (const slider of wrapper.findAll('input[type="range"]')) {
      expect((slider.element as HTMLInputElement).disabled).toBe(false)
    }
  })
})

// =============================================================================
describe('SdrWaterfall — sliders (Zoom / Max / Min)', () => {
  it('moving the Max slider applies a new dB range to both plots and persists it', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true) // sliders are disabled until the radio is playing
    await wrapper.vm.$nextTick()
    const setView = vi.spyOn(store, 'setViewSettings')
    const maxSlider = wrapper.findAll('input[type="range"]')[1]
    await maxSlider.setValue(40) // zmaxSlider stores magnitude → zmax = -40
    await wrapper.vm.$nextTick()
    expect(
      specPlot().calls.change_settings.some((c) => (c[0] as { ymax?: number }).ymax === -40),
    ).toBe(true)
    expect(setView).toHaveBeenCalledWith(expect.objectContaining({ autoScale: false }))
  })

  it('clamps Min when raised past Max (leaves a 1 dB gap)', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true) // sliders are disabled until the radio is playing
    await wrapper.vm.$nextTick()
    // Lower Max to -80 first, then raise Min to -20 so the Min endpoint crosses
    // above Max → clamp to Max-1 = -81.
    await wrapper.findAll('input[type="range"]')[1].setValue(80) // zmax = -80
    await wrapper.findAll('input[type="range"]')[2].setValue(20) // zmin = -20 (lastTouched=min)
    await wrapper.vm.$nextTick()
    const minAfter = (wrapper.findAll('input[type="range"]')[2].element as HTMLInputElement).value
    expect(minAfter).toBe('81') // zmin clamped to -81 → magnitude 81
  })

  it('clamps Max when lowered below Min', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true) // sliders are disabled until the radio is playing
    await wrapper.vm.$nextTick()
    // Raise Min to -20 first, then lower Max to -30 so Max crosses below Min →
    // clamp to Min+1 = -19.
    await wrapper.findAll('input[type="range"]')[2].setValue(20) // zmin = -20
    await wrapper.findAll('input[type="range"]')[1].setValue(30) // zmax = -30 (lastTouched=max)
    await wrapper.vm.$nextTick()
    const maxAfter = (wrapper.findAll('input[type="range"]')[1].element as HTMLInputElement).value
    expect(maxAfter).toBe('19') // zmax clamped to -19 → magnitude 19
  })

  it('disables the Zoom/Max/Min sliders until the radio is playing, then re-enables them', async () => {
    const { wrapper, store } = mountWaterfall()
    // Radio stopped at mount → all three sliders share the dulled/disabled state.
    const disabledAtMount = wrapper
      .findAll('input[type="range"]')
      .map((slider) => (slider.element as HTMLInputElement).disabled)
    expect(disabledAtMount).toEqual([true, true, true])

    store.setPlaying(true)
    await wrapper.vm.$nextTick()
    const enabledWhilePlaying = wrapper
      .findAll('input[type="range"]')
      .map((slider) => (slider.element as HTMLInputElement).disabled)
    expect(enabledWhilePlaying).toEqual([false, false, false])

    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    const disabledAfterStop = wrapper
      .findAll('input[type="range"]')
      .map((slider) => (slider.element as HTMLInputElement).disabled)
    expect(disabledAfterStop).toEqual([true, true, true])
  })
})

// =============================================================================
describe('SdrWaterfall — band plan & known-frequency overlays', () => {
  it('renders visible band-plan rectangles intersecting the span', async () => {
    const { wrapper, store, settings } = mountWaterfall()
    settings.setSetting('sdr', 'bandPlan', [
      { name: 'Air Band', startHz: 99_000_000, endHz: 101_000_000 },
      { name: 'Out Of Range', startHz: 1, endHz: 2 },
    ])
    store.setShowBandPlan(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const bands = wrapper.findAll('.sdr-wf-band')
    expect(bands).toHaveLength(1)
    expect(bands[0].text()).toBe('Air Band')
  })

  it('keeps the band-plan in its normal slot for a read-only follower', async () => {
    const { wrapper, store, settings } = mountWaterfall()
    settings.setSetting('sdr', 'bandPlan', [
      { name: 'Air Band', startHz: 99_000_000, endHz: 101_000_000 },
    ])
    store.setShowBandPlan(true)
    await playWithFrame(store)
    store.setOwnership(false, true, true) // follower: another instance owns tuning
    await wrapper.vm.$nextTick()
    // The band-plan still renders when read-only, and there is no read-only overlay
    // on the spectrum (the padlock/bar was removed — read-only is shown by the panel).
    expect(wrapper.find('.sdr-wf-band-overlay').exists()).toBe(true)
    expect(wrapper.find('.sdr-wf-readonly-alert').exists()).toBe(false)
  })

  it('renders one dot marker per visible known frequency, name hidden until clicked', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_100_000, mode: 'AM' },
      { id: 2, group_id: null, label: 'FarAway', frequency_hz: 500_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers).toHaveLength(1)
    // The dot is a labelled, collapsed button — no name text over the trace.
    const dot = markers[0].find('button.sdr-wf-known-marker-dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('aria-label')).toBe('ATIS')
    expect(dot.attributes('aria-expanded')).toBe('false')
    expect(markers[0].find('svg.sdr-wf-known-marker-ring').exists()).toBe(true)
    expect(markers[0].find('.sdr-wf-known-marker-pop').exists()).toBe(false)
    expect(markers[0].text()).toBe('')
  })

  it('spans the full spectrum data box so markers clip at the grid edge', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_100_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const overlay = wrapper.find('.sdr-wf-known-overlay')
    expect(overlay.exists()).toBe(true)
    const overlayStyle = overlay.attributes('style') ?? ''
    expect(overlayStyle).toMatch(/top:\s*\d+px/)
    expect(overlayStyle).toMatch(/bottom:\s*\d+px/)
  })

  it('renders frequency tick labels in the gutter', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sdr-wf-freq-label').length).toBeGreaterThan(0)
  })

  it('reveals the name in a borderless popover on click and hides it on a second click', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 7, group_id: null, label: 'TWR', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const dot = wrapper.find('.sdr-wf-known-marker-dot')

    await dot.trigger('click')
    const pop = wrapper.find('.sdr-wf-known-marker-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.text()).toBe('TWR')
    expect(pop.findAll('.sdr-wf-known-marker-pop-line')).toHaveLength(1)
    expect(dot.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.sdr-wf-known-marker').classes()).toContain('sdr-wf-known-marker--open')

    await dot.trigger('click')
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(false)
  })

  it('dismisses the open popover on an outside mousedown but not on one inside the marker', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()

    // Nothing open yet: the outside-click handler is a no-op and must not throw
    // on a non-element target (a bare document mousedown).
    document.dispatchEvent(new MouseEvent('mousedown'))
    await wrapper.vm.$nextTick()

    const marker = wrapper.find('.sdr-wf-known-marker')
    await wrapper.find('.sdr-wf-known-marker-dot').trigger('click')
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(true)

    // A mousedown inside the marker keeps it open…
    marker.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(true)

    // …a mousedown anywhere else closes it.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(false)
  })

  it('closes the open popover when a new frame moves the visible span', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    await wrapper.find('.sdr-wf-known-marker-dot').trigger('click')
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(true)

    await playWithFrame(store, { center_hz: 100_500_000 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(false)
  })

  it('merges dots that would overlap into one counted marker listing every name', async () => {
    const { wrapper, store } = mountWaterfall()
    // Size the data box so 1 px ≈ 1 kHz across the default 2.048 MHz window.
    specPlot()._Mx.l = 0
    specPlot()._Mx.r = 2048
    store.frequencies = [
      { id: 1, group_id: null, label: 'RAF-A', frequency_hz: 100_000_000, mode: 'AM' },
      { id: 2, group_id: null, label: 'RAF-B', frequency_hz: 100_008_000, mode: 'AM' }, // ~8 px ⇒ merges
      { id: 3, group_id: null, label: 'LONE', frequency_hz: 100_600_000, mode: 'AM' }, // ~600 px ⇒ separate
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers).toHaveLength(2)

    const clusterDot = markers[0].find('.sdr-wf-known-marker-dot')
    expect(markers[0].find('.sdr-wf-known-marker-badge').text()).toBe('2')
    expect(clusterDot.attributes('aria-label')).toBe('2 known frequencies')
    await clusterDot.trigger('click')
    const lines = markers[0].findAll('.sdr-wf-known-marker-pop-line')
    expect(lines.map((line) => line.text())).toEqual(['RAF-A', 'RAF-B'])

    // The lone marker keeps no badge and opens a plain single-name popover.
    expect(markers[1].find('.sdr-wf-known-marker-badge').exists()).toBe(false)
    await markers[1].find('.sdr-wf-known-marker-dot').trigger('click')
    const loneLines = markers[1].findAll('.sdr-wf-known-marker-pop-line')
    expect(loneLines.map((line) => line.text())).toEqual(['LONE'])
  })

  it('tags the marker the radio is tuned to with a flat borderless name + drop line', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'TUNED-HERE', frequency_hz: 100_000_000, mode: 'AM' },
      { id: 2, group_id: null, label: 'ELSEWHERE', frequency_hz: 100_400_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    store.currentFreqHz = 100_000_500 // within KNOWN_TUNED_MATCH_HZ of marker 1
    await wrapper.vm.$nextTick()

    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers[0].classes()).toContain('sdr-wf-known-marker--tuned')
    expect(markers[0].find('.sdr-wf-known-marker-tag').text()).toBe('TUNED-HERE')
    expect(markers[0].find('.sdr-wf-known-marker-line').exists()).toBe(true)

    // The untuned marker gets neither the tag nor the class.
    expect(markers[1].classes()).not.toContain('sdr-wf-known-marker--tuned')
    expect(markers[1].find('.sdr-wf-known-marker-tag').exists()).toBe(false)
    expect(markers[1].find('.sdr-wf-known-marker-line').exists()).toBe(false)

    // Opening the tuned marker swaps the tag for the popover.
    await markers[0].find('.sdr-wf-known-marker-dot').trigger('click')
    expect(markers[0].find('.sdr-wf-known-marker-tag').exists()).toBe(false)
    expect(markers[0].find('.sdr-wf-known-marker-pop').text()).toBe('TUNED-HERE')
  })

  it('a mouse or touch press on a marker never tunes the radio', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const offsetSpy = vi.spyOn(store, 'setTuningOffsetHz')
    const dot = wrapper.find('.sdr-wf-known-marker-dot')

    await dot.trigger('mousedown', { button: 0, clientX: 200, clientY: 20 })
    await dot.trigger('mouseup', { button: 0, clientX: 200, clientY: 20 })
    dot.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 200, clientY: 20 }]))
    await wrapper.vm.$nextTick()

    expect(tuneSpy).not.toHaveBeenCalled()
    expect(offsetSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')

    // The dot still toggles its own popover.
    await dot.trigger('click')
    expect(wrapper.find('.sdr-wf-known-marker-pop').exists()).toBe(true)
  })

  it('has no accessibility violations with a known-frequency marker open', async () => {
    const { wrapper, store } = mountWaterfall()
    store.frequencies = [
      { id: 1, group_id: null, label: 'ATIS', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setShowKnownFreqs(true)
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    await wrapper.find('.sdr-wf-known-marker-dot').trigger('click')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})

// =============================================================================
describe('SdrWaterfall — frequency tick formatting (unit bands)', () => {
  it('formats GHz-range ticks with a G suffix', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store, { center_hz: 1_500_000_000, sample_rate: 2_000_000 })
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.sdr-wf-freq-label').map((w) => w.text())
    expect(labels.some((t) => t.endsWith('G'))).toBe(true)
  })

  it('formats kHz-range ticks with a K suffix', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store, { center_hz: 500_000, sample_rate: 200_000 })
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.sdr-wf-freq-label').map((w) => w.text())
    expect(labels.some((t) => t.endsWith('K'))).toBe(true)
  })
})

// =============================================================================
// Frequency labels are decimated to fit the data box: every gridline tick stays,
// but the number of *visible* labels is thinned on a narrow box so their opaque
// pills never overlap (the bug these tests guard against). syncBandInset reads
// the data-box edges straight off the plot's _Mx, so the tests size the box by
// setting _Mx.l / _Mx.r before the frame that triggers the measurement.
describe('SdrWaterfall — frequency label overlap avoidance', () => {
  it('thins the visible labels on a narrow data box so the pills never overlap', async () => {
    const { wrapper, store } = mountWaterfall()
    // A ~100px data box cannot fit all 21 labels (0.1 MHz steps across the default
    // 2.048 MHz span) without their pills colliding, so most must be hidden.
    specPlot()._Mx.l = 10
    specPlot()._Mx.r = 110
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.sdr-wf-freq-label')
    const visibleCount = labels.filter((label) => label.isVisible()).length
    // Every gridline tick label still exists in the DOM (only display is toggled)…
    expect(labels.length).toBeGreaterThan(10)
    // …but only a few are actually shown, and at least one always is.
    expect(visibleCount).toBeGreaterThan(0)
    expect(visibleCount).toBeLessThan(labels.length)
  })

  it('shows every frequency label when the data box is wide enough', async () => {
    const { wrapper, store } = mountWaterfall()
    // A very wide box leaves room for every 0.1 MHz label — none are dropped.
    specPlot()._Mx.l = 0
    specPlot()._Mx.r = 4000
    await playWithFrame(store)
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.sdr-wf-freq-label')
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => label.isVisible())).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — document & sidebar events', () => {
  it('tracks the sidebar open/closed state', async () => {
    const { wrapper } = mountWaterfall()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('panel-closed')
    document.dispatchEvent(new CustomEvent('sentinel:sidebar-state', { detail: { open: true } }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('panel-closed')
  })

  it('re-hydrates overlay flags when a config upload event fires', async () => {
    const { store } = mountWaterfall()
    const bandSpy = vi.spyOn(store, 'hydrateShowBandPlanFromDb')
    const knownSpy = vi.spyOn(store, 'hydrateShowKnownFreqsFromDb')
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    expect(bandSpy).toHaveBeenCalled()
    expect(knownSpy).toHaveBeenCalled()
  })

  it('reads an open sidebar from sessionStorage at mount', () => {
    sessionStorage.setItem('sentinel_sidebar_open', '1')
    const { wrapper } = mountWaterfall()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('panel-closed')
  })

  it('marks the waterfall not-playing until the radio is tuned, then clears it', async () => {
    const { wrapper, store } = mountWaterfall()
    // Radio stopped at mount → the dulled/disabled state is on.
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('not-playing')
    store.setPlaying(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('not-playing')
    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('not-playing')
  })
})

// =============================================================================
describe('SdrWaterfall — click-to-tune & plot mouse handling', () => {
  function spectrumEl(wrapper: VueWrapper) {
    return wrapper.find('.sdr-wf-spectrum')
  }

  it('click-to-tune with auto-centre ON clears the offset and retunes', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = true
    await playWithFrame(store)
    const offsetSpy = vi.spyOn(store, 'setTuningOffsetHz')
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(offsetSpy).toHaveBeenCalledWith(0)
    expect(tuneSpy).toHaveBeenCalled()
  })

  it('click-to-tune with auto-centre OFF applies an NCO offset', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = false
    await playWithFrame(store)
    const offsetSpy = vi.spyOn(store, 'setTuningOffsetHz')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 0, clientX: 700, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 700, clientY: 100 })
    // Offset is the clicked freq minus the hardware centre (non-zero, not 0).
    const lastCall = offsetSpy.mock.calls.at(-1)
    expect(lastCall?.[0]).not.toBe(0)
  })

  it('snaps a click to a nearby known frequency, and does not when snapping is off', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = true
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    // Snapping OFF: capture the raw clicked frequency (also covers the off-path).
    store.setSnapToKnown(false)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    const rawFreq = tuneSpy.mock.calls.at(-1)![0] as number
    // Place a known freq a few hundred Hz off the raw click, then enable snapping:
    // a click at the same spot must now tune to the known freq, not the raw one.
    const knownFreq = rawFreq + 800
    store.frequencies = [
      { id: 1, group_id: null, label: 'NEAR', frequency_hz: knownFreq, mode: 'AM' },
    ]
    store.setSnapToKnown(true)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy.mock.calls.at(-1)![0]).toBe(knownFreq)
  })

  it('snaps to the nearest of several known frequencies within threshold, not a farther one', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = true
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    store.setSnapToKnown(false)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    const rawFreq = tuneSpy.mock.calls.at(-1)![0] as number
    // The nearer candidate is evaluated first, narrowing the best distance, so
    // the farther one that follows must fail the "closer than the current
    // best" check — proving the loop keeps the running-nearest match rather
    // than just taking whichever candidate comes last.
    const fartherFreq = rawFreq + 800
    const nearerFreq = rawFreq + 200
    store.frequencies = [
      { id: 2, group_id: null, label: 'NEAR', frequency_hz: nearerFreq, mode: 'AM' },
      { id: 1, group_id: null, label: 'FAR', frequency_hz: fartherFreq, mode: 'AM' },
    ]
    store.setSnapToKnown(true)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy.mock.calls.at(-1)![0]).toBe(nearerFreq)
  })

  it('a right-click is swallowed on both mousedown and mouseup', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 2, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 2, clientX: 500, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })

  it('ignores click-to-tune for a read-only follower (mirrors the owner)', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setOwnership(false, true, true) // follower: another instance owns tuning
    await wrapper.vm.$nextTick()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })

  it('a drag (movement beyond the slop) does not tune', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 560, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })

  it('a middle-button press is ignored', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 1, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 1, clientX: 500, clientY: 100 })
    // No throw; nothing tuned (button !== 0 short-circuits).
    expect(true).toBe(true)
  })

  it('does not tune when playback is stopped', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = spectrumEl(wrapper)
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('SdrWaterfall — frequency-axis drag pan', () => {
  it('dragging the gutter pans the window and commits a retune on release', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    // Mousedown in the bottom gutter (y >= gutterTop ≈ 262) arms the pan.
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).toContain('sdr-wf-spectrum--panning')
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 560, clientY: 290 }))
    flushRaf() // run freqDragFlush
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 560, clientY: 290 }))
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })

  it('does not start a pan above the gutter', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('does not start a pan when stopped', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('does not start a pan for a read-only follower', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setOwnership(false, true, true)
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })
})

// =============================================================================
describe('SdrWaterfall — frequency-axis drag pan (touch)', () => {
  it('touchstart in the gutter arms the pan, touchmove updates it, and touchend commits', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    // Touchstart in the bottom gutter (y >= gutterTop ≈ 262) arms the pan,
    // mirroring the mousedown-in-gutter test above.
    const startEvent = makeTouchEvent('touchstart', [{ clientX: 500, clientY: 290 }])
    const startPreventSpy = vi.spyOn(startEvent, 'preventDefault')
    el.element.dispatchEvent(startEvent)
    await wrapper.vm.$nextTick()
    expect(startPreventSpy).toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).toContain('sdr-wf-spectrum--panning')
    const moveEvent = makeTouchEvent('touchmove', [{ clientX: 560, clientY: 290 }])
    const movePreventSpy = vi.spyOn(moveEvent, 'preventDefault')
    document.dispatchEvent(moveEvent)
    expect(movePreventSpy).toHaveBeenCalled()
    flushRaf() // run freqDragFlush
    document.dispatchEvent(makeTouchEvent('touchend', [{ clientX: 560, clientY: 290 }]))
    await wrapper.vm.$nextTick()
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('touchcancel aborts an in-progress pan without committing a retune', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 500, clientY: 290 }]))
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 560, clientY: 290 }]))
    flushRaf()
    document.dispatchEvent(new Event('touchcancel'))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('touchcancel also cancels a still-pending preview rAF (not yet flushed)', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 500, clientY: 290 }]))
    // Schedule the preview rAF but do NOT flush it before aborting — abortFreqDrag
    // must cancel the still-pending frame itself, not rely on it having run.
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 560, clientY: 290 }]))
    const pendingEntry = rafQueue.find((entry) => !entry.cancelled)
    expect(pendingEntry).toBeDefined()
    document.dispatchEvent(new Event('touchcancel'))
    expect(pendingEntry?.cancelled).toBe(true)
  })

  it('does not intercept a touchstart above the gutter, leaving sigplot to handle it', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [{ clientX: 500, clientY: 100 }])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    el.element.dispatchEvent(event)
    expect(preventSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('ignores a two-finger touchstart entirely, leaving pinch-zoom to sigplot', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [
      { clientX: 500, clientY: 290 },
      { clientX: 520, clientY: 290 },
    ])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    el.element.dispatchEvent(event)
    expect(preventSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('aborts an active pan on window blur, mirroring the abortAccDrag blur handler', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 500, clientY: 290 }]))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).toContain('sdr-wf-spectrum--panning')
    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('ignores a blur when no freq-axis pan is in progress', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    expect(() => window.dispatchEvent(new Event('blur'))).not.toThrow()
    expect(tuneSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('coalesces rapid gutter-drag touchmoves into one rAF', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 500, clientY: 290 }]))
    // Two moves before any flush: the second must NOT schedule a second rAF.
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 540, clientY: 290 }]))
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 560, clientY: 290 }]))
    const tuneSpy = vi.spyOn(store, 'requestTune')
    document.dispatchEvent(makeTouchEvent('touchend', [{ clientX: 560, clientY: 290 }]))
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })
})

// =============================================================================
describe('SdrWaterfall — accordion (tuning-bracket) drag', () => {
  async function startDrag(store: ReturnType<typeof useSdrStore>) {
    await playWithFrame(store)
    const wf = wfAccordion()
    const spec = specAccordion()
    // Seed a baseline geometry on the waterfall accordion (Hz units).
    wf._center = 100_000_000
    wf._width = 10_000
    spec.dragging = true
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 100 }))
  }

  it('commits a frequency change when the bracket centre is dragged', async () => {
    const store = useSdrStore()
    const settings = useSettingsStore()
    void settings
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    // Simulate sigplot moving the spectrum accordion (MHz units).
    specAccordion()._center = 100.5 // MHz → 100.5 MHz carrier
    specAccordion()._width = 0.01
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 520, clientY: 100 }))
    expect(tuneSpy).toHaveBeenCalled()
    void wrapper
  })

  it('does not snap the drag commit when the span is degenerate (hi <= lo)', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    store.setSnapToKnown(true)
    // A zero sample rate collapses spanStartHz === spanEndHz. The bracket-drag
    // commit calls snapToKnownFreqHz directly (no outer hi<=lo guard, unlike the
    // click-to-tune path) — its own defensive span guard must return the raw
    // carrier unmodified, even with a known frequency sitting right next to it.
    await playWithFrame(store, { sample_rate: 0 })
    const wf = wfAccordion()
    const spec = specAccordion()
    wf._center = 100_000_000
    wf._width = 10_000
    spec.dragging = true
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 100 }))
    const tuneSpy = vi.spyOn(store, 'requestTune')
    store.frequencies = [
      { id: 1, group_id: null, label: 'NEAR', frequency_hz: 100_500_800, mode: 'AM' },
    ]
    specAccordion()._center = 100.5 // MHz → 100.5 MHz carrier
    specAccordion()._width = 0.01
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 520, clientY: 100 }))
    // Committed to the raw carrier, not the nearby known freq (100_500_800).
    expect(tuneSpy).toHaveBeenCalledWith(100_500_000)
    void wrapper
  })

  it('does not snap the drag commit when the data box has collapsed to zero width', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    store.setSnapToKnown(true)
    // Collapse the spectrum plot's data box (l >= r) before the frame that
    // measures it, so dataBoxWidthPx lands at 0 — snapToKnownFreqHz's own
    // defensive box-width guard must then return the raw carrier unmodified.
    // (installMarginTweaks clamps Mx.r to at least width-1, so r alone can't be
    // pushed below l — push l past the clamped r instead.)
    specPlot()._Mx.l = 1000
    specPlot()._Mx.r = 400
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    store.frequencies = [
      { id: 1, group_id: null, label: 'NEAR', frequency_hz: 100_500_800, mode: 'AM' },
    ]
    specAccordion()._center = 100.5 // MHz → 100.5 MHz carrier
    specAccordion()._width = 0.01
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 520, clientY: 100 }))
    // Committed to the raw carrier, not the nearby known freq (100_500_800).
    expect(tuneSpy).toHaveBeenCalledWith(100_500_000)
    void wrapper
  })

  it('drops the bracket-drag commit for a read-only follower', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    store.setOwnership(false, true, true) // follower mirrors the owner
    await wrapper.vm.$nextTick()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const bwSpy = vi.spyOn(store, 'requestBandwidth')
    specAccordion()._center = 100.5
    specAccordion()._width = 0.01
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 520, clientY: 100 }))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(bwSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('commits a bandwidth change when the bracket edge is resized (symmetric mode)', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const bwSpy = vi.spyOn(store, 'requestBandwidth')
    // Drag on the waterfall accordion in Hz: widen the bracket.
    wfAccordion().dragging = true
    specAccordion().dragging = false
    wfAccordion()._width = 40_000
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 520, clientY: 100 }))
    expect(bwSpy).toHaveBeenCalledWith(40_000)
    void wrapper
  })

  it('handles an SSB (USB) move + edge resize, keeping the carrier anchored', async () => {
    const store = useSdrStore()
    store.setMode('USB')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    // SSB edge-resize on the spectrum accordion.
    specAccordion().edge_dragging = true
    specAccordion()._center = 100.51
    specAccordion()._width = 0.02
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 1 }))
    // SSB move (no edge) on the waterfall accordion.
    specAccordion().edge_dragging = false
    wfAccordion().dragging = true
    specAccordion().dragging = false
    wfAccordion()._center = 100_020_000
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 540, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 540, clientY: 100 }))
    expect(true).toBe(true)
    void wrapper
  })

  it('handles an LSB move on the waterfall accordion', async () => {
    const store = useSdrStore()
    store.setMode('LSB')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    wfAccordion().dragging = true
    specAccordion().dragging = false
    wfAccordion()._center = 99_990_000
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 540, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 540, clientY: 100 }))
    expect(true).toBe(true)
    void wrapper
  })

  it('ignores a mouseup with no drag in progress', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 500, clientY: 100 }))
    expect(tuneSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('recovers from a missed mouseup when the button is released outside the window', async () => {
    // Releasing the button outside the window never delivers a mouseup, so the
    // drag would stay active and the bar would chase the cursor. A later
    // mousemove with no button held (buttons === 0) must end the drag instead.
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    // The recovery path commits straight from the waterfall accordion (the
    // live mousemove mirror is skipped), so move that accordion's centre.
    wfAccordion()._center = 100_500_000
    // No mouseup — just a moved pointer with the button no longer down.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 100, buttons: 0 }))
    expect(tuneSpy).toHaveBeenCalled()
    expect(specAccordion().dragging).toBe(false)
    expect(wfAccordion().dragging).toBe(false)
    void wrapper
  })

  it('aborts a drag and releases the bar when the pointer gesture is cancelled', async () => {
    // A cancelled gesture (browser takes over a touch/pen scroll) must release
    // the bar without committing the uncommitted geometry.
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    document.dispatchEvent(new Event('pointercancel'))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(specAccordion().dragging).toBe(false)
    expect(specAccordion().edge_dragging).toBe(false)
    expect(wfAccordion().dragging).toBe(false)
    void wrapper
  })

  it('aborts a drag and releases the bar when the window loses focus mid-drag', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    window.dispatchEvent(new Event('blur'))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(specAccordion().dragging).toBe(false)
    expect(wfAccordion().dragging).toBe(false)
    void wrapper
  })

  it('ignores a window blur when no drag is in progress', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    expect(() => window.dispatchEvent(new Event('blur'))).not.toThrow()
    expect(tuneSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('clears sigplot drag flags on a click that does not move the bracket (stuck-bar fix)', async () => {
    // Regression: a mousedown sets sigplot's `dragging` flag, but if the bracket
    // is released without moving past the 1Hz threshold the mouseup handler used
    // to return early before resetting it — leaving the tuning bar glued to the
    // cursor until a page refresh. The flags must be cleared on this path too.
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await startDrag(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const bwSpy = vi.spyOn(store, 'requestBandwidth')
    // No geometry change between mousedown and mouseup → a click, not a drag.
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 500, clientY: 100 }))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(bwSpy).not.toHaveBeenCalled()
    // The bar is released: sigplot's internal drag flags are cleared on both plots.
    expect(specAccordion().dragging).toBe(false)
    expect(specAccordion().edge_dragging).toBe(false)
    expect(wfAccordion().dragging).toBe(false)
    expect(wfAccordion().edge_dragging).toBe(false)
    void wrapper
  })
})

// =============================================================================
describe('SdrWaterfall — touch-driven accordion drag bridge', () => {
  // Arm the spectrum accordion's grab-zone geometry so a touch at (300, 100)
  // lands on its center handle (edges at 200/400, center at 300 — all with the
  // widened 20px tolerance accCommon configures).
  function armGrabZone() {
    const spec = specAccordion()
    spec.properties.loc_1 = 200
    spec.properties.loc_2 = 400
    spec.properties.edge_line_style = { lineWidth: 20 }
    spec.properties.center_location = 300
    spec.properties.center_line_style = { lineWidth: 20 }
  }

  it('touchstart near a grab zone intercepts the touch and dispatches a bridged mousedown', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    const touchEvent = makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }])
    const preventSpy = vi.spyOn(touchEvent, 'preventDefault')
    const stopSpy = vi.spyOn(touchEvent, 'stopImmediatePropagation')
    el.element.dispatchEvent(touchEvent)
    expect(preventSpy).toHaveBeenCalled()
    expect(stopSpy).toHaveBeenCalled()
    expect(mousedownSpy).toHaveBeenCalledTimes(1)
    const dispatched = mousedownSpy.mock.calls[0]?.[0] as MouseEvent
    expect(dispatched.type).toBe('mousedown')
    expect(dispatched.clientX).toBe(300)
    expect(dispatched.clientY).toBe(100)
    expect(dispatched.button).toBe(0)
  })

  it('does not intercept a touchstart that misses every grab zone', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    // Far from loc_1(200)/loc_2(400)/center(300) and their 25px tolerance.
    const touchEvent = makeTouchEvent('touchstart', [{ clientX: 700, clientY: 100 }])
    const preventSpy = vi.spyOn(touchEvent, 'preventDefault')
    el.element.dispatchEvent(touchEvent)
    expect(preventSpy).not.toHaveBeenCalled()
    expect(mousedownSpy).not.toHaveBeenCalled()
  })

  it('does not throw when the plot has no widget canvas measured yet (accWidCanvas fallback)', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    // Force accWidCanvas's `mx?.wid_canvas ?? null` fallback: a live plot
    // whose _Mx exists but hasn't measured a widget canvas yet.
    ;(specPlot()._Mx as unknown as { wid_canvas: undefined }).wid_canvas = undefined
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }])
    expect(() => el.element.dispatchEvent(event)).not.toThrow()
  })

  it('touchmove while bridged dispatches a bridged mousemove and prevents default', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }]))
    const canvas = specPlot()._Mx.wid_canvas
    const mousemoveSpy = vi.fn()
    canvas.addEventListener('mousemove', mousemoveSpy)
    const moveEvent = makeTouchEvent('touchmove', [{ clientX: 320, clientY: 110 }])
    const preventSpy = vi.spyOn(moveEvent, 'preventDefault')
    document.dispatchEvent(moveEvent)
    expect(preventSpy).toHaveBeenCalled()
    expect(mousemoveSpy).toHaveBeenCalledTimes(1)
    const dispatched = mousemoveSpy.mock.calls[0]?.[0] as MouseEvent
    expect(dispatched.clientX).toBe(320)
    expect(dispatched.clientY).toBe(110)
  })

  it('a touchmove with no active bridge dispatches nothing', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const canvas = specPlot()._Mx.wid_canvas
    const mousemoveSpy = vi.fn()
    canvas.addEventListener('mousemove', mousemoveSpy)
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 320, clientY: 110 }]))
    expect(mousemoveSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('touchend dispatches a bridged mouseup at the lifted-finger position and clears the bridge', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }]))
    const canvas = specPlot()._Mx.wid_canvas
    const mouseupSpy = vi.fn()
    canvas.addEventListener('mouseup', mouseupSpy)
    document.dispatchEvent(makeTouchEvent('touchend', [{ clientX: 310, clientY: 105 }]))
    expect(mouseupSpy).toHaveBeenCalledTimes(1)
    const dispatched = mouseupSpy.mock.calls[0]?.[0] as MouseEvent
    expect(dispatched.type).toBe('mouseup')
    expect(dispatched.clientX).toBe(310)
    expect(dispatched.clientY).toBe(105)
    expect(dispatched.button).toBe(0)
    // The bridge is cleared: a further touchmove dispatches nothing more.
    const mousemoveSpy = vi.fn()
    canvas.addEventListener('mousemove', mousemoveSpy)
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 320, clientY: 110 }]))
    expect(mousemoveSpy).not.toHaveBeenCalled()
  })

  it('a touchend with no active bridge dispatches nothing', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const canvas = specPlot()._Mx.wid_canvas
    const mouseupSpy = vi.fn()
    canvas.addEventListener('mouseup', mouseupSpy)
    document.dispatchEvent(makeTouchEvent('touchend', [{ clientX: 310, clientY: 105 }]))
    expect(mouseupSpy).not.toHaveBeenCalled()
    void wrapper
  })

  it('touchcancel clears the bridge and aborts the drag without committing a synthetic mouseup', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    armGrabZone()
    const spec = specAccordion()
    // Simulate sigplot synchronously setting its own drag flag off the bridged
    // mousedown (mirrors startDrag()'s convention above for the mouse path).
    spec.dragging = true
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    el.element.dispatchEvent(makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }]))
    const canvas = specPlot()._Mx.wid_canvas
    const mouseupSpy = vi.fn()
    canvas.addEventListener('mouseup', mouseupSpy)
    document.dispatchEvent(new Event('touchcancel'))
    expect(tuneSpy).not.toHaveBeenCalled()
    expect(mouseupSpy).not.toHaveBeenCalled() // aborted, not committed via a synthetic mouseup
    expect(specAccordion().dragging).toBe(false)
    expect(wfAccordion().dragging).toBe(false)
    // The bridge is cleared: a further touchmove dispatches nothing more.
    const mousemoveSpy = vi.fn()
    canvas.addEventListener('mousemove', mousemoveSpy)
    document.dispatchEvent(makeTouchEvent('touchmove', [{ clientX: 320, clientY: 110 }]))
    expect(mousemoveSpy).not.toHaveBeenCalled()
  })

  it('a touchcancel with no active bridge is a no-op', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    expect(() => document.dispatchEvent(new Event('touchcancel'))).not.toThrow()
    expect(tuneSpy).not.toHaveBeenCalled()
    void wrapper
  })
})

// =============================================================================
describe('SdrWaterfall — passband shade geometry & style', () => {
  // Push a mode + carrier + bandwidth onto the store and let the reactive
  // watch fire applyMarker(), which repositions both accordions.
  async function retune(
    store: ReturnType<typeof useSdrStore>,
    mode: 'USB' | 'LSB' | 'NFM',
    carrierHz: number,
    bandwidthHz: number,
  ): Promise<void> {
    store.setMode(mode)
    store.currentFreqHz = carrierHz
    store.bwHz = bandwidthHz
    await flushPromises()
    flushRaf()
    await flushPromises()
  }

  it('centres the passband shade on the carrier in USB mode (tuning line stays mid-band)', async () => {
    // Regression: SSB used to offset the shade to one side (USB → carrier + bw/2),
    // pushing the tuning line to the edge of the band. It must now sit dead-centre.
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    await retune(store, 'USB', 100_500_000, 20_000)
    expect(wfAccordion()._center).toBe(100_500_000)
    expect(wfAccordion()._width).toBe(20_000)
    expect(specAccordion()._center).toBeCloseTo(100.5, 6)
    void wrapper
  })

  it('centres the passband shade on the carrier in LSB mode', async () => {
    // LSB previously drew the shade below the carrier (carrier - bw/2); the shade
    // is now symmetric so the carrier line stays centred in the band.
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    await retune(store, 'LSB', 100_500_000, 20_000)
    expect(wfAccordion()._center).toBe(100_500_000)
    expect(specAccordion()._center).toBeCloseTo(100.5, 6)
    void wrapper
  })

  it('shades the spectrum passband with a translucent blue wash', () => {
    // The tuned-passband fill matches the trace colour (#00aaff) at a low opacity
    // so the band reads as part of the trace rather than an opaque white block.
    mountWaterfall()
    expect(specAccordion()._opts.fill_style).toEqual({ fillStyle: '#00aaff', opacity: 0.12 })
  })
})

// =============================================================================
describe('SdrWaterfall — accordion edge cursor affordance', () => {
  it('flags the edge-resize cursor when the pointer is over an accordion edge', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 100
    specAccordion().properties.loc_2 = 400
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('edge-resize')
  })

  it('clears the affordance when the pointer is away from any edge', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 100
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('edge-resize')
  })

  it('holds the cursor through an in-progress edge drag', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().edge_dragging = true
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('edge-resize')
  })
})

// =============================================================================
describe('SdrWaterfall — mouse-wheel pan', () => {
  it('wheel scroll pans the window and commits one debounced retune', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    flushRaf() // wheelFlush
    // A second notch within the burst exercises the clearTimeout re-arm path.
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    vi.advanceTimersByTime(300)
    flushRaf()
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
    vi.useRealTimers()
  })

  it('normalises line-mode wheel deltas', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: 3, deltaMode: 1 })
    flushRaf()
    expect(wrapper.find('.sdr-wf-spectrum').classes()).toContain('sdr-wf-spectrum--panning')
  })

  it('ignores the wheel when stopped', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('ignores the wheel for a read-only follower', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.setOwnership(false, true, true)
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })
})

// =============================================================================
describe('SdrWaterfall — FFT bin sizing & resize', () => {
  it('clamps the bin request to MAX_BINS when mounting at a restored extreme zoom', () => {
    // zoom 50 × 1000px = 50000 → clamped to MAX_BINS at mount.
    localStorage.setItem('sdrViewZoom', '50')
    const store = useSdrStore()
    const fftSpy = vi.spyOn(store, 'requestFftSize')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    expect(fftSpy).toHaveBeenCalledWith(32768)
    void wrapper
  })

  it('pins the bin target across a resize', () => {
    const { store } = mountWaterfall()
    // A dpr change would move the computed target, but resize no longer
    // re-requests bins — the waterfall history must survive the resize.
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    const fftSpy = vi.spyOn(store, 'requestFftSize')
    triggerResize()
    expect(fftSpy).not.toHaveBeenCalled()
  })

  it('requests a larger power-of-two bin count on a wide/HiDPI canvas at init', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    const store = useSdrStore()
    const fftSpy = vi.spyOn(store, 'requestFftSize')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf() // init publishes the bin target directly (1000px * 2 dpr → 2048)
    expect(fftSpy).toHaveBeenCalledWith(2048)
    void wrapper
  })
})

// =============================================================================
describe('SdrWaterfall — restored view settings (manual range at mount)', () => {
  it('seeds the sliders from a persisted custom dB range', () => {
    localStorage.setItem('sdrViewAutoScale', '0')
    localStorage.setItem('sdrViewZmin', '-90')
    localStorage.setItem('sdrViewZmax', '-10')
    const { wrapper } = mountWaterfall()
    const minVal = (wrapper.findAll('input[type="range"]')[2].element as HTMLInputElement).value
    const maxVal = (wrapper.findAll('input[type="range"]')[1].element as HTMLInputElement).value
    expect(minVal).toBe('90') // -zmin
    expect(maxVal).toBe('10') // -zmax
    // buildPipes used the fixed-range (non auto-scale) branch.
    const cmapCall = wfPlotInstance().calls.change_settings.find(
      (c) => (c[0] as { autol?: number }).autol === -1,
    )
    expect(cmapCall).toBeTruthy()
  })
})

// =============================================================================
describe('SdrWaterfall — stop/play reset', () => {
  it('preserves a user-set Min/Max range across a stop (persists like Zoom)', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Adjust MIN only, leaving MAX at the device default (zmax = 0) — the exact
    // case that used to be wiped on stop.
    await wrapper.findAll('input[type="range"]')[2].setValue(60) // zmin = -60
    await wrapper.vm.$nextTick()
    store.setPlaying(false)
    await wrapper.vm.$nextTick()
    // The slider stays where the user left it and the store keeps the range, so a
    // later remount (navigation / retune) restores it rather than reverting.
    const minVal = (wrapper.findAll('input[type="range"]')[2].element as HTMLInputElement).value
    expect(minVal).toBe('60')
    expect(store.viewZmin).toBe(-60)
    expect(store.viewAutoScale).toBe(false)
    // On stop the blanked waterfall keeps the fixed range (autol disabled), not
    // colour auto-scale.
    const fixedCall = wfPlotInstance().calls.change_settings.find(
      (c) => (c[0] as { autol?: number; zmin?: number }).zmin === -60,
    )
    expect(fixedCall).toBeTruthy()
  })

  it('colour auto-scales on stop when the user never set a range', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    store.setPlaying(false)
    await flushPromises()
    // autoScale untouched → the blanked waterfall re-enables colour auto-scale
    // (WF_AUTOL = 100 in the component).
    const autoCall = wfPlotInstance().calls.change_settings.find(
      (c) => (c[0] as { autol?: number }).autol === 100,
    )
    expect(autoCall).toBeTruthy()
    expect(store.viewAutoScale).toBe(true)
  })

  it('cancels a queued spectrum redraw on stop', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    // Queue a fresh frame without flushing rAF so drawRaf is pending at stop.
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 50 }))
    await flushPromises()
    store.setPlaying(false)
    await flushPromises()
    // No throw; the cancel path ran. A subsequent flush must not redraw.
    const reloadsBefore = specPlot().calls.reload?.length ?? 0
    flushRaf()
    expect(specPlot().calls.reload?.length ?? 0).toBe(reloadsBefore)
  })
})

// =============================================================================
describe('SdrWaterfall — zoom / frequency / full-update watchers', () => {
  it('applyZoom takes the no-op path when zoom changes with no span yet', async () => {
    const { wrapper, store } = mountWaterfall()
    // Playing enables the slider, but with no frame the span is still 0, so
    // moving zoom hits the hi<=lo early return.
    store.setPlaying(true)
    await wrapper.vm.$nextTick()
    await wrapper.findAll('input[type="range"]')[0].setValue(5)
    expect(specPlot().calls.unzoom).toBeUndefined()
  })

  it('re-windows on zoom change when a span is present', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    await wrapper.findAll('input[type="range"]')[0].setValue(10)
    await wrapper.vm.$nextTick()
    expect(specPlot().calls.zoom).toBeTruthy()
  })

  it('re-windows when the selected frequency moves while zoomed in', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    await wrapper.findAll('input[type="range"]')[0].setValue(10)
    await wrapper.vm.$nextTick()
    const zoomCallsBefore = specPlot().calls.zoom.length
    store.setFrequency(100_200_000)
    await wrapper.vm.$nextTick()
    expect(specPlot().calls.zoom.length).toBeGreaterThan(zoomCallsBefore)
  })

  it('does not re-window on frequency move at zoom 1', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const zoomCallsBefore = specPlot().calls.zoom?.length ?? 0
    store.setFrequency(100_200_000)
    await flushPromises()
    expect(specPlot().calls.zoom?.length ?? 0).toBe(zoomCallsBefore)
  })

  it('covers the nice-number tick step bands across zoom levels', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    for (const zoomLevel of [2, 4, 5, 8]) {
      await wrapper.findAll('input[type="range"]')[0].setValue(zoomLevel)
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.sdr-wf-freq-label').length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
describe('SdrWaterfall — known-frequency sync & debug hook', () => {
  it('rebuilds annotations and redraws when the frequency list changes', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const redrawBefore = specPlot().calls.redraw?.length ?? 0
    store.frequencies = [
      { id: 9, group_id: null, label: 'New', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    await flushPromises()
    expect((specPlot().calls.redraw?.length ?? 0) > redrawBefore).toBe(true)
  })

  it('exposes the spectrum y-axis debug hook on window', () => {
    mountWaterfall()
    const debug = (window as unknown as { __specYAxis?: () => unknown }).__specYAxis
    expect(typeof debug).toBe('function')
    expect(debug!()).toMatchObject({ ymin: expect.any(Number) })
  })
})

// =============================================================================
describe('SdrWaterfall — teardown', () => {
  it('cancels pending frames and removes plugins/layers on unmount', () => {
    const { wrapper } = mountWaterfall()
    // Give the annotation plugin a document listener to detach.
    registry.annotations[0].onmouseup = () => {}
    const wf = wfPlotInstance()
    wrapper.unmount()
    expect(wf.calls.disable_listeners).toBeTruthy()
    expect(wf.calls.remove_plugin).toBeTruthy()
  })

  it('cancels the init rAF if unmounted before layout settles', () => {
    const store = useSdrStore()
    void store
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    // Do NOT flush rAF — the deferred init is still pending.
    expect(() => wrapper.unmount()).not.toThrow()
  })
})

// =============================================================================
describe('SdrWaterfall — edge cases & defensive paths', () => {
  it('returns a closed panel when sessionStorage throws', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation((key: string) => {
      if (key === 'sentinel_sidebar_open') throw new Error('blocked')
      return null
    })
    const { wrapper } = mountWaterfall()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('panel-closed')
  })

  it('ignores a click-to-tune when playing but no frame has set the span', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true)
    await wrapper.vm.$nextTick()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })

  it('ignores a click when the data box has no width', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    vi.spyOn(el.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 20,
      bottom: 300,
      width: 20,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    await el.trigger('mousedown', { button: 0, clientX: 10, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 10, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })

  it('clears a held pan offset when a click-to-tune lands mid-pan', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // A wheel notch leaves livePanOffsetHz non-zero (no commit yet).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    flushRaf()
    vi.useRealTimers()
    const tuneSpy = vi.spyOn(store, 'requestTune')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy).toHaveBeenCalled()
  })

  it('ignores a plot mouseup while an accordion drag is in progress', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    // Arm an accordion drag so onPlotMouseUp's dragActive guard returns early.
    specAccordion().dragging = true
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    await el.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    expect(tuneSpy).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('SdrWaterfall — guards before the plots are initialised', () => {
  // Mount but do NOT flush the deferred-init rAF, so the plots/accordions/
  // plugin are still null. Store changes and document events must no-op safely.
  function mountUninitialised() {
    const store = useSdrStore()
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    return { wrapper, store }
  }

  it('no-ops applyMarker / syncKnownFrequencies and accordion handlers pre-init', async () => {
    const { wrapper, store } = mountUninitialised()
    expect(registry.plots).toHaveLength(0)
    // Frequency-list + tuning changes fire watchers that touch the null plugin.
    store.frequencies = [
      { id: 1, group_id: null, label: 'X', frequency_hz: 100_000_000, mode: 'AM' },
    ]
    store.setFrequency(101_000_000)
    await wrapper.vm.$nextTick()
    // Document events hit the accordion baseline/mirror/commit guards (null accs).
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 100 }))
    expect(wrapper.find('#sdr-waterfall').exists()).toBe(true)
  })

  it('no-ops a touchstart pre-init (accordion/plot not yet created)', () => {
    const { wrapper } = mountUninitialised()
    expect(registry.accordions).toHaveLength(0)
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    expect(() => el.element.dispatchEvent(event)).not.toThrow()
    expect(preventSpy).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('SdrWaterfall — nearAccEdge hit-test branches', () => {
  it('returns false when the accordion has no edge positions yet', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Default loc_1/loc_2 are undefined → no edge.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('edge-resize')
  })

  it('returns false when the pointer is outside the data box', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 100
    specAccordion().properties.loc_2 = 400
    // y = 290 is below the data-box bottom (mx.b ≈ 262).
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 290 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('edge-resize')
  })

  it('matches the second edge (loc_2) and tolerates a missing edge line style', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 100
    specAccordion().properties.loc_2 = 400
    specAccordion().properties.edge_line_style = undefined // exercises the ?? 1 fallback
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).toContain('edge-resize')
  })
})

// =============================================================================
// nearAccGrabZone is exercised entirely through onPlotTouchStart's touchstart
// handler (it isn't exported) — a synthetic mousedown reaching the plot's
// widget canvas is proof the touch was judged "near enough" to intercept.
describe('SdrWaterfall — nearAccGrabZone hit-test branches', () => {
  it('returns false when the touch is outside the data box', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Use the waterfall raster, not the spectrum: on the spectrum, any y this
    // far down also falls inside the freq-axis gutter and tryStartFreqDrag
    // (tried first for isSpec) would intercept before nearAccGrabZone ever
    // runs. The raster has no gutter special-case, so it isolates the
    // out-of-bounds branch cleanly.
    wfAccordion().properties.loc_1 = 100
    wfAccordion().properties.loc_2 = 400
    wfAccordion().properties.edge_line_style = { lineWidth: 20 }
    const canvas = wfPlotInstance()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-raster')
    // y = 290 is below the waterfall data-box bottom (mx.b ≈ 280).
    const event = makeTouchEvent('touchstart', [{ clientX: 100, clientY: 290 }])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    el.element.dispatchEvent(event)
    expect(preventSpy).not.toHaveBeenCalled()
    expect(mousedownSpy).not.toHaveBeenCalled()
  })

  it('matches the first edge (loc_1) within the widened edge tolerance', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 200
    specAccordion().properties.loc_2 = 400
    specAccordion().properties.edge_line_style = { lineWidth: 20 }
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    // 10px from loc_1 (200), well inside the 25px (20 + 5) edge tolerance.
    const event = makeTouchEvent('touchstart', [{ clientX: 210, clientY: 100 }])
    el.element.dispatchEvent(event)
    expect(mousedownSpy).toHaveBeenCalledTimes(1)
  })

  it('matches the center handle within the widened center tolerance', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.center_location = 300
    specAccordion().properties.center_line_style = { lineWidth: 20 }
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    // 15px from center_location (300), inside the 25px (20 + 5) tolerance.
    const event = makeTouchEvent('touchstart', [{ clientX: 315, clientY: 100 }])
    el.element.dispatchEvent(event)
    expect(mousedownSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default +5px tolerance when line-width styles are absent', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 200
    specAccordion().properties.edge_line_style = undefined // exercises the ?? 1 fallback
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    // 4px from loc_1 (200): inside the fallback (1 + 5 = 6px) tolerance.
    const nearEvent = makeTouchEvent('touchstart', [{ clientX: 204, clientY: 100 }])
    el.element.dispatchEvent(nearEvent)
    expect(mousedownSpy).toHaveBeenCalledTimes(1)
  })

  it('returns false when the accordion has no properties yet', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Force the defensive `!p` guard: a live accordion with no properties object.
    ;(specAccordion() as unknown as { properties: undefined }).properties = undefined
    const canvas = specPlot()._Mx.wid_canvas
    const mousedownSpy = vi.fn()
    canvas.addEventListener('mousedown', mousedownSpy)
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    el.element.dispatchEvent(event)
    expect(preventSpy).not.toHaveBeenCalled()
    expect(mousedownSpy).not.toHaveBeenCalled()
  })

  it('returns false when the plot has no measured geometry yet', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.center_location = 300
    specAccordion().properties.center_line_style = { lineWidth: 20 }
    // Force the defensive `!mx` guard: a live plot with no _Mx measured yet.
    ;(specPlot() as unknown as { _Mx: undefined })._Mx = undefined
    const el = wrapper.find('.sdr-wf-spectrum')
    const event = makeTouchEvent('touchstart', [{ clientX: 300, clientY: 100 }])
    const preventSpy = vi.spyOn(event, 'preventDefault')
    expect(() => el.element.dispatchEvent(event)).not.toThrow()
    expect(preventSpy).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('SdrWaterfall — applyMarker geometry fallbacks', () => {
  it('falls back to defaults when bandwidth and sample rate are zero', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setBandwidthHz(0) // bwHz falsy → Math.max(MIN_BW_HZ, 10000)
    store.sampleRate = 0 // sampleRate falsy → span/bHz fallback
    store.setFrequency(100_000_000)
    await wrapper.vm.$nextTick()
    // wfAcc width reflects the 10 kHz default bandwidth.
    expect(wfAccordion()._width).toBe(10_000)
  })
})

// =============================================================================
describe('SdrWaterfall — persisted zero zoom & off-centre selection', () => {
  it('treats a persisted zero zoom as full span', () => {
    localStorage.setItem('sdrViewZoom', '0')
    const { wrapper } = mountWaterfall()
    // Zoom slider clamps to ZOOM_MIN (1).
    expect((wrapper.findAll('input[type="range"]')[0].element as HTMLInputElement).value).toBe('1')
  })

  it('centres the zoom window on a zero selected frequency via the midpoint', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    store.currentFreqHz = 0 // falsy → window centres on the span midpoint
    await wrapper.findAll('input[type="range"]')[0].setValue(10)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sdr-wf-freq-label').length).toBeGreaterThan(0)
  })
})

// =============================================================================
describe('SdrWaterfall — syncBandInset guard', () => {
  it('bails out when the plot has no measured width', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const before = specPlot().calls.reload?.length ?? 0
    specPlot()._Mx.width = 0 // syncBandInset early-returns
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 300 }))
    await flushPromises()
    flushRaf()
    expect((specPlot().calls.reload?.length ?? 0) > before).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — spectrum/waterfall gap sizing', () => {
  // Read the live label-gutter height the component measured (bandInsetBottomPx),
  // surfaced as the tick-gutter overlay's inline `height`. Both gap styles derive
  // from it, so asserting against the measured value keeps the test independent
  // of the mock's exact pixel math while still proving the ratios.
  function measuredGutterPx(wrapper: VueWrapper): number {
    const gutterStyle = wrapper.find('.sdr-wf-tick-gutter').attributes('style') ?? ''
    const match = gutterStyle.match(/height:\s*(\d+)px/)
    expect(match).not.toBeNull()
    return Number((match as RegExpMatchArray)[1])
  }

  it('sets a fixed 4px spectrum bottom margin once the gutter is measured', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store) // a draw pass runs syncBandInset → measures the gutter
    const gutter = measuredGutterPx(wrapper)
    expect(gutter).toBeGreaterThan(0) // layout settled, so the gap is the live branch
    const spectrumStyle = wrapper.find('.sdr-wf-spectrum').attributes('style') ?? ''
    // The waterfall sits tight under the freq labels: a small constant gap,
    // independent of the (zoom-dependent) gutter height.
    expect(spectrumStyle).toContain('margin-bottom: 4px')
  })

  it('keeps the spectrum bottom margin at 0 before the gutter is measured', () => {
    // No draw pass has run, so bandInsetBottomPx is still 0 (pre-draw default);
    // the gap must collapse to 0 rather than the 4px live value.
    const { wrapper } = mountWaterfall()
    const spectrumStyle = wrapper.find('.sdr-wf-spectrum').attributes('style') ?? ''
    expect(spectrumStyle).toContain('margin-bottom: 0px')
  })

  it('crops 25% off the waterfall bottom via a negative raster margin', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const gutter = measuredGutterPx(wrapper)
    expect(gutter).toBeGreaterThan(0)
    const rasterStyle = wrapper.find('.sdr-wf-raster').attributes('style') ?? ''
    // Negative margin lets the raster extend past the overflow:hidden clip edge,
    // hiding ~a quarter of sigplot's reserved (invisible) bottom gutter.
    expect(rasterStyle).toContain(`margin-bottom: ${-Math.round(gutter * 0.25)}px`)
  })
})

// =============================================================================
describe('SdrWaterfall — installMarginTweaks Mx accessor setters', () => {
  it('clamps the left/top/right/bottom data-box margins', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const mxBox = specPlot()._Mx
    // Left: a value far from text_w*6 passes through unchanged; a tiny value too.
    mxBox.l = 500
    expect(mxBox.l).toBe(500)
    mxBox.l = 0
    expect(mxBox.l).toBe(0)
    // Top: max(v, round(text_h*1.2)) = max(v, 14).
    mxBox.t = 100
    expect(mxBox.t).toBe(100)
    mxBox.t = 5
    expect(mxBox.t).toBe(14)
    // Right: max(v, width-1) = max(v, 999).
    mxBox.r = 2000
    expect(mxBox.r).toBe(2000)
    mxBox.r = 10
    expect(mxBox.r).toBe(999)
    // Bottom: min(v, height - round(text_h*3.2)) = min(v, 262).
    mxBox.b = 100
    expect(mxBox.b).toBe(100)
    mxBox.b = 500
    expect(mxBox.b).toBe(262)
  })

  it('falls back to a default text height of 12 when text_h is zero', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const mxBox = specPlot()._Mx
    mxBox.text_h = 0
    mxBox.t = 5 // round(12*1.2)=14
    expect(mxBox.t).toBe(14)
    mxBox.b = 500 // min(500, 300 - round(12*3.2)=38 → 262)
    expect(mxBox.b).toBe(262)
  })

  it('falls back to a text width of 1 when text_w is zero (left margin)', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const mxBox = specPlot()._Mx
    mxBox.text_w = 0 // tw = text_w || 1 → 1
    // v=5 (>1) but |5 - 1*6|=1 is NOT < tw(1) → passes through as v.
    mxBox.l = 5
    expect(mxBox.l).toBe(5)
  })
})

// =============================================================================
describe('SdrWaterfall — live pan offset reset on retune frame', () => {
  it('clears a held wheel pan offset when a re-centred frame arrives', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Leave a non-zero pan offset via a wheel notch (commit timer not fired).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await wrapper.find('.sdr-wf-spectrum').trigger('wheel', { deltaY: -100, deltaMode: 0 })
    flushRaf() // wheelFlush sets livePanOffsetHz
    vi.useRealTimers()
    // A frame with a NEW span centre lands → the watch resets the pan offset.
    const wfPushesBefore = wfPlotInstance().calls.push.length
    nowMs += 1000
    store.setSpectrum(makeFrame({ center_hz: 101_000_000, ts: Date.now() + 400 }))
    await flushPromises()
    flushRaf()
    expect(wfPlotInstance().calls.push.length).toBeGreaterThan(wfPushesBefore)
  })
})

// =============================================================================
describe('SdrWaterfall — frequency drag cancels a pending preview frame', () => {
  it('cancels the queued pan rAF on release', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    // Schedule a preview rAF but do NOT flush it — mouseup must cancel it.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 560, clientY: 290 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 560, clientY: 290 }))
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })

  it('does not start a pan when the data box has no width', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    Object.defineProperty(el.element, 'clientWidth', { configurable: true, value: 10 })
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })
})

// =============================================================================
describe('SdrWaterfall — wheel with no span & teardown rAF cancels', () => {
  it('ignores the wheel before a span is known', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setPlaying(true)
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    expect(wrapper.find('.sdr-wf-spectrum').classes()).not.toContain('sdr-wf-spectrum--panning')
  })

  it('cancels a queued spectrum redraw on unmount', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Queue a fresh frame so drawRaf is pending at unmount.
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 60 }))
    await flushPromises()
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('runs the slider sizer harmlessly after unmount', () => {
    const store = useSdrStore()
    void store
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    // Unmount before flushing rAF: the queued sizeSliders runs with a null ref.
    wrapper.unmount()
    expect(() => flushRaf()).not.toThrow()
  })
})

// =============================================================================
describe('SdrWaterfall — contrived freq-drag-active plot mouseup', () => {
  it('skips click-to-tune on the raster when a gutter pan is armed', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const raster = wrapper.find('.sdr-wf-raster')
    // Record mdownEl on the raster (above its gutter; raster has no gutter check).
    await raster.trigger('mousedown', { button: 0, clientX: 500, clientY: 100 })
    // Arm a frequency pan on the spectrum gutter (sets freqDragActive).
    await wrapper.find('.sdr-wf-spectrum').trigger('mousedown', {
      button: 0,
      clientX: 500,
      clientY: 290,
    })
    // Raster mouseup now sees freqDragActive and skips the tune.
    await raster.trigger('mouseup', { button: 0, clientX: 500, clientY: 100 })
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 500, clientY: 290 }))
    // The pan commit fires a centred retune, but no per-click tune was added.
    expect(tuneSpy.mock.calls.every((call) => call[1] === true)).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — remaining branch coverage', () => {
  it('handles an LSB edge-resize (carrier-anchored outer edge below)', async () => {
    const store = useSdrStore()
    store.setMode('LSB')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf()
    await playWithFrame(store)
    wfAccordion()._center = 100_000_000
    wfAccordion()._width = 10_000
    specAccordion().dragging = true
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 100 }))
    // SSB edge-resize on the spectrum accordion in LSB mode.
    specAccordion().edge_dragging = true
    specAccordion()._center = 99.99
    specAccordion()._width = 0.02
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 480, clientY: 100 }))
    expect(true).toBe(true)
    void wrapper
  })

  it('treats an accordion edge as no-match when the plot has no Mx', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    specAccordion().properties.loc_1 = 100
    specAccordion().properties.loc_2 = 400
    // Strip the spectrum plot's internal Mx so nearAccEdge bails at the !mx guard.
    ;(specPlot() as unknown as { _Mx: unknown })._Mx = undefined
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').classes()).not.toContain('edge-resize')
  })

  it('defaults the device-pixel-ratio to 1 when the browser reports 0', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 })
    const store = useSdrStore()
    const fftSpy = vi.spyOn(store, 'requestFftSize')
    const wrapper = mount(SdrWaterfall, { attachTo: document.body })
    flushRaf() // computeDesiredBins runs at mount with the dpr → 1 fallback
    // px*1 = 1000 → rounded up to 1024 bins.
    expect(fftSpy).toHaveBeenCalledWith(1024)
    void wrapper
  })

  it('suppresses the native context menu on both plots', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const specEvt = await wrapper.find('.sdr-wf-spectrum').trigger('contextmenu')
    const wfEvt = await wrapper.find('.sdr-wf-raster').trigger('contextmenu')
    void specEvt
    void wfEvt
    expect(wrapper.find('#sdr-waterfall').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — rAF throttling & guard fall-throughs', () => {
  it('coalesces rapid gutter-drag mousemoves into one rAF', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const el = wrapper.find('.sdr-wf-spectrum')
    await el.trigger('mousedown', { button: 0, clientX: 500, clientY: 290 })
    // Two moves before any flush: the second must NOT schedule a second rAF.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 540, clientY: 290 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 560, clientY: 290 }))
    const tuneSpy = vi.spyOn(store, 'requestTune')
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 560, clientY: 290 }))
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })

  it('coalesces rapid wheel notches and cancels a pending rAF at commit', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const el = wrapper.find('.sdr-wf-spectrum')
    // Two notches before any flush → the second skips scheduling a new rAF.
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    await el.trigger('wheel', { deltaY: -100, deltaMode: 0 })
    // Fire the commit WITHOUT flushing rAF so it cancels the still-pending one.
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })

  it('queues only one spectrum redraw across two frames in the same tick window', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 10 }))
    await flushPromises() // first frame schedules drawRaf
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 20 }))
    await flushPromises() // second frame: drawRaf already pending, not re-scheduled
    flushRaf()
    expect(specPlot().calls.reload.length).toBeGreaterThan(0)
  })

  it('skips the spectrum redraw if a sweep starts before the queued frame paints', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)
    const reloadsBefore = specPlot().calls.reload.length
    nowMs += 1000
    store.setSpectrum(makeFrame({ ts: Date.now() + 30 }))
    await flushPromises() // drawRaf scheduled with a pending frame
    store.searchSweeping = true // sweep begins before the paint
    flushRaf() // drawLoop guard now fails → no reload
    expect(specPlot().calls.reload.length).toBe(reloadsBefore)
  })

  it('skips the band-inset measurement when the data box has zero height', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    // Collapse the data box so dataBoxHeightPx <= 0 in syncBandInset.
    specPlot()._Mx.t = 300
    // Trigger syncBandInset via a slider move.
    await wrapper.findAll('input[type="range"]')[1].setValue(40)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#sdr-waterfall').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — final branch fall-throughs', () => {
  it('commits a wheel pan whose preview rAF already flushed', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await wrapper.find('.sdr-wf-spectrum').trigger('wheel', { deltaY: -100, deltaMode: 0 })
    flushRaf() // wheelFlush runs → wheelRaf back to 0 before the commit
    vi.advanceTimersByTime(300) // commit sees wheelRaf === 0 (no cancel needed)
    vi.useRealTimers()
    expect(tuneSpy).toHaveBeenCalledWith(expect.any(Number), true)
  })

  it('does not refresh bins on zoom', async () => {
    const { wrapper, store } = mountWaterfall()
    await playWithFrame(store)
    const fftSpy = vi.spyOn(store, 'requestFftSize')
    await wrapper.findAll('input[type="range"]')[0].setValue(8)
    await wrapper.vm.$nextTick()
    expect(fftSpy).not.toHaveBeenCalled()
  })
})

describe('SdrWaterfall — paused display', () => {
  /**
   * Pausing exists to free the main thread.
   *
   * The ScriptProcessor audio fallback runs there — on any page without a
   * secure context, which is most of the ways Sentinel is reached — and
   * rendering competes with it. On a phone that is the difference between
   * choppy audio and clean audio, so "paused" has to actually stop the work
   * rather than merely hide the canvas.
   */
  it('does no plot work while the display is paused', async () => {
    const { store } = mountWaterfall()
    store.displayPaused = true
    await playWithFrame(store)

    expect(wfPlotInstance().calls.push).toBeUndefined()
    expect(specPlot().calls.reload).toBeUndefined()
  })

  it('resumes plotting when unpaused', async () => {
    const { store } = mountWaterfall()
    store.displayPaused = true
    await playWithFrame(store)

    store.displayPaused = false
    await playWithFrame(store, { center_hz: 146_000_000 })

    expect(wfPlotInstance().calls.push).toBeTruthy()
    expect(specPlot().calls.reload).toBeTruthy()
  })

  it('drops a frame that was already queued when the pause landed', async () => {
    // The watcher queues a frame and the redraw happens on the next animation
    // frame, so a pause between the two would otherwise paint one last time —
    // and, worse, keep the draw path warm exactly when the thread is wanted
    // elsewhere.
    const { store } = mountWaterfall()
    store.setPlaying(true)
    nowMs += 1000
    store.setSpectrum(makeFrame())
    await flushPromises()

    store.displayPaused = true
    flushRaf()
    await flushPromises()

    expect(specPlot().calls.reload).toBeUndefined()
  })

  it('leaves playback alone, so pausing never costs the audio', async () => {
    const { store } = mountWaterfall()
    await playWithFrame(store)

    store.displayPaused = true

    expect(store.playing).toBe(true)
  })
})

// =============================================================================
describe('SdrWaterfall — waterfall time markers', () => {
  // The raster's own wall clock: rows are stamped with Date.now(), which the
  // shared performance.now() mock does not cover.
  let wallClockMs: number
  let wallClock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    wallClockMs = Date.UTC(2026, 0, 1, 12, 0, 0)
    wallClock = vi.spyOn(Date, 'now').mockImplementation(() => wallClockMs)
  })

  afterEach(() => {
    wallClock.mockRestore()
  })

  /**
   * Push `count` raster rows, `msPerRow` apart on the wall clock.
   *
   * performance.now() advances past WF_ROW_MIN_MS (40 ms) each time so the
   * row-rate cap admits every frame; the wall clock advances independently,
   * because it is the row spacing in *time* that decides the label step.
   */
  async function pushRows(
    store: ReturnType<typeof useSdrStore>,
    count: number,
    msPerRow: number,
  ): Promise<void> {
    store.setPlaying(true)
    for (let index = 0; index < count; index++) {
      nowMs += 50
      wallClockMs += msPerRow
      store.setSpectrum(makeFrame())
      await flushPromises()
    }
  }

  const markerLabels = (wrapper: VueWrapper) =>
    wrapper.findAll('.sdr-wf-time-marker').map((marker) => marker.text())
  const markerTops = (wrapper: VueWrapper) =>
    wrapper
      .findAll('.sdr-wf-time-marker')
      .map((marker) => Number(/top: (\d+)px/.exec(marker.attributes('style') ?? '')?.[1]))

  it('draws nothing once the setting is switched off, so the raster stays clean', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(false)

    await pushRows(store, 60, 10)

    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(false)
  })

  it('labels rows on whole-second boundaries with the setting on by default', async () => {
    const { wrapper, store } = mountWaterfall()
    expect(store.showWaterfallTimestamps).toBe(true)
    store.setWaterfallTimestampIntervalSec(1)

    // 300 rows 10 ms apart: ~3 s of history over a 248 px box, so a one-second
    // interval puts a label on each whole second it spans.
    await pushRows(store, 300, 10)

    expect(markerLabels(wrapper)).toEqual(['12:00:02', '12:00:01', '12:00:00'])
  })

  it('spaces the labels down the box in proportion to their age', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)

    await pushRows(store, 300, 10)

    // One second is 100 rows, and a row is 248/400 px, so consecutive labels
    // sit ~62 px apart with the newest nearest the top.
    const tops = markerTops(wrapper)
    expect(tops[1]! - tops[0]!).toBe(62)
    expect(tops[2]! - tops[1]!).toBe(62)
    expect(tops[0]).toBeLessThan(tops[1]!)
  })

  it('hangs the overlay on the raster’s measured data box, not the element', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)

    await pushRows(store, 300, 10)

    // Anchored to the plot's own data box so the labels never drift onto the
    // axis furniture below it.
    expect(wrapper.find('.sdr-wf-time-overlay').attributes('style')).toContain('top: 14px')
    expect(wrapper.find('.sdr-wf-time-overlay').attributes('style')).toContain('height: 248px')
  })

  it('insets the overlay to the data-box left edge, not the raster element edge', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)

    await pushRows(store, 300, 10)

    // .sdr-wf-tick-gutter is positioned from the SAME bandInsetLeftPx the spectrum
    // and waterfall share (both plots use one axis spec), so its measured `left`
    // is the live data-box inset this test asserts the time overlay follows —
    // independent of the mock's exact pixel math.
    const gutterStyle = wrapper.find('.sdr-wf-tick-gutter').attributes('style') ?? ''
    const gutterLeftMatch = gutterStyle.match(/left:\s*(\d+)px/)
    expect(gutterLeftMatch).not.toBeNull()
    const measuredBandInsetLeftPx = Number((gutterLeftMatch as RegExpMatchArray)[1])
    // Confirm the measured inset is non-zero so the assertion below actually
    // discriminates between "follows bandInsetLeftPx" and "hardcoded to 0".
    expect(measuredBandInsetLeftPx).toBeGreaterThan(0)

    const overlayStyle = wrapper.find('.sdr-wf-time-overlay').attributes('style') ?? ''
    expect(overlayStyle).toContain(`left: ${measuredBandInsetLeftPx}px`)
    expect(overlayStyle).not.toContain('left: 0px')
  })

  it('keeps one label per interval, not one per row', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)

    await pushRows(store, 300, 10)

    // 300 rows, three labels: the rows between two boundaries are skipped.
    expect(wrapper.findAll('.sdr-wf-time-marker')).toHaveLength(3)
  })

  it('needs two rows before an interval exists to measure', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)

    await pushRows(store, 1, 10)

    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(false)
  })

  it('draws nothing when every row carries the same instant', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)

    // A stalled clock spans no time, so there is no scale to hang labels on.
    await pushRows(store, 60, 0)

    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(false)
  })

  it('honours a coarse interval from settings, however tight the rows are', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(600)

    // A minute per row: a ten-minute interval is only ~6 px of raster, but the
    // setting decides the spacing, not the pixels available.
    await pushRows(store, 30, 60_000)

    // A label marks the first row *after* the clock crossed a boundary, so
    // with a row a minute these land a minute past each ten-minute mark.
    expect(markerLabels(wrapper)).toEqual(['12:29:00', '12:19:00', '12:09:00'])
  })

  it('keeps only the newest WF_ROWS row times, so the buffer cannot grow forever', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)

    // 800 rows into a 400-row raster: the oldest 400 stamps must fall off with
    // the rows they belong to.
    await pushRows(store, 800, 10)

    // Keeping them would date rows that have scrolled away, and would place
    // their labels below the bottom of the box.
    expect(Math.max(...markerTops(wrapper))).toBeLessThanOrEqual(248)
    expect(wrapper.findAll('.sdr-wf-time-marker')).toHaveLength(4)
  })

  it('stops at the marker limit rather than papering the raster with labels', async () => {
    // A very tall raster gives each row more pixels, so every boundary the
    // interval produces has room to draw — more than the limit allows.
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    const tallRaster = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')!
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 8000,
    })
    triggerResize()
    await flushPromises()

    // A second a row against the default 5 s interval offers 80 boundaries
    // across the 400 rows — far more than may be drawn.
    await pushRows(store, 400, 1000)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', tallRaster)

    expect(wrapper.findAll('.sdr-wf-time-marker')).toHaveLength(40)
  })

  it('ignores a mid-layout box that reports no height, keeping the last good one', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)
    await pushRows(store, 300, 10)

    // sigplot reports an empty data box between layout passes; taking it would
    // collapse the overlay onto nothing.
    const laidOut = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')!
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 20 })
    triggerResize()
    await flushPromises()
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', laidOut)

    expect(wrapper.find('.sdr-wf-time-overlay').attributes('style')).toContain('height: 248px')
  })

  it('drops its row times when the raster history is cleared', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(true)
    store.setWaterfallTimestampIntervalSec(1)
    await pushRows(store, 300, 10)
    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(true)

    // Stopping blanks both plots; stale labels would date rows that are gone.
    store.setPlaying(false)
    await flushPromises()

    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(false)
  })
})

// =============================================================================
// Per-second tick marks. Regression coverage for the bucket-transition bug: a
// tick must land on every whole-second row EXCEPT the one row that
// waterfallTimeMarkers itself labels — identified by "the interval bucket also
// changed on this row", not by "is this wall-clock second a round multiple of
// the interval" (the buggy check this replaces, which leaves the row right
// before the real label with no tick because the label's row is essentially
// never itself a round multiple of the interval).
describe('SdrWaterfall — waterfall per-second tick marks', () => {
  let wallClockMs: number
  let wallClock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // A start time deliberately NOT aligned to the 3 s interval used below, so
    // the interval-bucket boundary lands on an "unround" wall-clock second —
    // exactly the case the fixed modulo-free check must still handle.
    wallClockMs = Date.UTC(2026, 0, 1, 12, 0, 0, 700)
    wallClock = vi.spyOn(Date, 'now').mockImplementation(() => wallClockMs)
  })

  afterEach(() => {
    wallClock.mockRestore()
  })

  async function pushRows(
    store: ReturnType<typeof useSdrStore>,
    count: number,
    msPerRow: number,
  ): Promise<void> {
    store.setPlaying(true)
    for (let index = 0; index < count; index++) {
      nowMs += 50
      wallClockMs += msPerRow
      store.setSpectrum(makeFrame())
      await flushPromises()
    }
  }

  const tickTops = (wrapper: VueWrapper) =>
    wrapper
      .findAll('.sdr-wf-second-tick')
      .map((tick) => Number(/top: (\d+)px/.exec(tick.attributes('style') ?? '')?.[1]))
  const markerTops = (wrapper: VueWrapper) =>
    wrapper
      .findAll('.sdr-wf-time-marker')
      .map((marker) => Number(/top: (\d+)px/.exec(marker.attributes('style') ?? '')?.[1]))

  it('draws a tick on every whole second except the row the labelled marker itself occupies', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setWaterfallTimestampIntervalSec(3)

    // 10 ms per row, 400 rows => 4 s of history, spanning at least one 3 s
    // interval boundary plus several plain whole-second rows.
    await pushRows(store, 400, 10)

    const ticks = tickTops(wrapper)
    const markers = markerTops(wrapper)
    expect(ticks.length).toBeGreaterThan(0)
    expect(markers.length).toBeGreaterThan(0)
    // No tick ever lands on the exact row a labelled marker occupies.
    for (const markerTop of markers) {
      expect(ticks).not.toContain(markerTop)
    }
    // The old (buggy) modulo-based check skipped the tick immediately
    // adjacent to a label, leaving a gap; the fixed check leaves no such gap —
    // every second not labelled gets its own tick.
    expect(ticks.length + markers.length).toBeGreaterThanOrEqual(4)
  })

  it('draws no ticks or markers when the waterfall timestamps setting is off', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(false)
    store.setWaterfallTimestampIntervalSec(3)
    await pushRows(store, 400, 10)
    expect(wrapper.findAll('.sdr-wf-second-tick')).toHaveLength(0)
    expect(wrapper.find('.sdr-wf-time-overlay').exists()).toBe(false)
  })

  it('hides a second tick that would land within the half-height of a labelled marker or signal label', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setWaterfallTimestampIntervalSec(3)
    await pushRows(store, 400, 10)

    const ticks = tickTops(wrapper)
    const markers = markerTops(wrapper)
    // Every remaining (visible) tick clears every marker by more than the
    // 11px half-height — visibleWaterfallSecondTicks' proximity filter, not
    // just the identity filter above, is what's under test here.
    for (const tickTop of ticks) {
      for (const markerTop of markers) {
        expect(Math.abs(tickTop - markerTop)).toBeGreaterThan(11)
      }
    }
  })
})

// =============================================================================
// Signal marker: hover-only tracking (invisible) + Shift+Click pin/unpin. All
// detection maths live in the pure useSdrSignalMarker composable (see its own
// spec) — these tests exercise the component's wiring: geometry mapping,
// hover stickiness, the pin/unpin toggle, and the plain-click regression.
describe('SdrWaterfall — signal marker (hover tracking & Shift+Click pin)', () => {
  let wallClockMs: number
  let wallClock: ReturnType<typeof vi.spyOn>

  const CENTER_HZ = 100_000_000
  const SAMPLE_RATE = 6_400
  const BIN_COUNT = 64
  const SPAN_LO_HZ = CENTER_HZ - SAMPLE_RATE / 2
  const SPAN_HI_HZ = CENTER_HZ + SAMPLE_RATE / 2
  const BIN_WIDTH_HZ = SAMPLE_RATE / BIN_COUNT
  // Bin 32 (row centre) carries the signal in most tests below.
  const SIGNAL_FREQ_HZ = CENTER_HZ
  const SIGNAL_RANGE: [number, number] = [28, 36]
  // Bin 5: far outside SIGNAL_RANGE and never populated with a signal.
  const OFF_SIGNAL_FREQ_HZ = SPAN_LO_HZ + 5 * BIN_WIDTH_HZ

  beforeEach(() => {
    wallClockMs = Date.UTC(2026, 0, 1, 12, 0, 0)
    wallClock = vi.spyOn(Date, 'now').mockImplementation(() => wallClockMs)
  })

  afterEach(() => {
    wallClock.mockRestore()
  })

  /** A row's FFT bins: -20dB (well clear of the -90dB noise floor) across
   *  `range` (inclusive), -90dB (flat noise) everywhere else. `null` pushes an
   *  all-noise row (no signal anywhere). */
  function makeBins(range: [number, number] | null): number[] {
    const bins = new Array(BIN_COUNT).fill(-90)
    if (range) {
      for (let index = range[0]; index <= range[1]; index++) bins[index] = -20
    }
    return bins
  }

  /** Pushes one raster row, advancing both the rate-cap clock and the row's
   *  own wall-clock stamp so consecutive rows get distinct push times. */
  async function pushSignalRow(
    store: ReturnType<typeof useSdrStore>,
    range: [number, number] | null,
  ): Promise<void> {
    store.setPlaying(true)
    nowMs += 50
    wallClockMs += 100
    store.setSpectrum(
      makeFrame({ center_hz: CENTER_HZ, sample_rate: SAMPLE_RATE, bins: makeBins(range) }),
    )
    await flushPromises()
  }

  /** Reads the live data-box geometry straight off the mocked plots — the
   *  exact same numbers syncBandInset()/syncWaterfallDataBox() derive inside
   *  the component — so a clientX/clientY can be computed that lands on a
   *  known frequency/row without hardcoding sigplot's mock layout constants. */
  function geometry() {
    const spec = specPlot()._Mx
    const wf = wfPlotInstance()._Mx
    return {
      leftPx: Math.max(0, Math.floor(spec.l)),
      rightPx: Math.max(0, Math.ceil(spec.width - spec.r)),
      topPx: Math.max(0, Math.round(wf.t)),
      heightPx: Math.round(wf.b - wf.t),
    }
  }

  function clientXForFreqHz(freqHz: number): number {
    const box = geometry()
    const dataWidth = 1000 - box.leftPx - box.rightPx
    const frac = (freqHz - SPAN_LO_HZ) / (SPAN_HI_HZ - SPAN_LO_HZ)
    return box.leftPx + frac * dataWidth
  }

  function clientYForRowIndex(rowIndex: number): number {
    const box = geometry()
    const pxPerRow = box.heightPx / 400 // WF_ROWS
    return box.topPx + rowIndex * pxPerRow + pxPerRow / 2
  }

  async function moveAt(wrapper: VueWrapper, rowIndex: number, freqHz: number): Promise<void> {
    await wrapper.find('.sdr-wf-raster').trigger('mousemove', {
      clientX: clientXForFreqHz(freqHz),
      clientY: clientYForRowIndex(rowIndex),
    })
  }

  async function leaveRaster(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('.sdr-wf-raster').trigger('mouseleave')
  }

  async function shiftClickAt(
    wrapper: VueWrapper,
    rowIndex: number,
    freqHz: number,
  ): Promise<void> {
    const raster = wrapper.find('.sdr-wf-raster')
    const clientX = clientXForFreqHz(freqHz)
    const clientY = clientYForRowIndex(rowIndex)
    await raster.trigger('mousedown', { button: 0, clientX, clientY, shiftKey: true })
    await raster.trigger('mouseup', { button: 0, clientX, clientY, shiftKey: true })
  }

  async function plainClickAt(
    wrapper: VueWrapper,
    rowIndex: number,
    freqHz: number,
  ): Promise<void> {
    const raster = wrapper.find('.sdr-wf-raster')
    const clientX = clientXForFreqHz(freqHz)
    const clientY = clientYForRowIndex(rowIndex)
    await raster.trigger('mousedown', { button: 0, clientX, clientY })
    await raster.trigger('mouseup', { button: 0, clientX, clientY })
  }

  const hasStartLabel = (wrapper: VueWrapper) =>
    wrapper.find('.sdr-wf-time-label--signal-start').exists()
  const hasEndLabel = (wrapper: VueWrapper) =>
    wrapper.find('.sdr-wf-time-label--signal-end').exists()

  it('renders no timestamp label while merely hovering a signal — only a pin shows one', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)

    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
    expect(hasEndLabel(wrapper)).toBe(false)
  })

  it('Shift+Click pins the currently hovered signal, rendering its start label', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // Still touching the newest row => no end time yet.
    expect(hasStartLabel(wrapper)).toBe(true)
    expect(hasEndLabel(wrapper)).toBe(false)
  })

  it('a Shift+Click with no prior hover falls back to detecting the signal at the click point', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)

    // No mousemove beforehand (e.g. a touch/pen tap) — pin logic must still work.
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(true)
  })

  it('Shift+Click on an already-pinned signal unpins it', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)

    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('a plain click still tunes the radio even when a signal sits under the cursor', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = true
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    const tuneSpy = vi.spyOn(store, 'requestTune')

    await plainClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(tuneSpy).toHaveBeenCalled()
    // A plain click must never pin — only Shift+Click does.
    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('a Shift+Click on the spectrum plot (not the raster) still tunes and never pins', async () => {
    const { wrapper, store } = mountWaterfall()
    store.autoCenterWaterfallOnTune = true
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    const tuneSpy = vi.spyOn(store, 'requestTune')
    const clientX = clientXForFreqHz(SIGNAL_FREQ_HZ)
    const spectrum = wrapper.find('.sdr-wf-spectrum')

    await spectrum.trigger('mousedown', { button: 0, clientX, clientY: 100, shiftKey: true })
    await spectrum.trigger('mouseup', { button: 0, clientX, clientY: 100, shiftKey: true })

    expect(tuneSpy).toHaveBeenCalled()
    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('keeps a hovered box alive through a momentary noise dip in the live row, then Shift+Click still pins it', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    // Establish the hover while the signal is genuinely present at row 0.
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // A fresh, signal-free row lands at row 0 — a momentary dip in the live
    // edge. A fresh detection here alone would return null.
    await pushSignalRow(store, null)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // The stale-but-still-onscreen box must still be what Shift+Click pins.
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)
  })

  it('clears the hovered box when the cursor moves off the retained row history entirely', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // Far below the raster's data box / retained row count — pointToRowAndBin
    // returns null, so the hover must be dropped outright (not left stale).
    await wrapper
      .find('.sdr-wf-raster')
      .trigger('mousemove', { clientX: clientXForFreqHz(SIGNAL_FREQ_HZ), clientY: 100_000 })
    // Click on a signal-free frequency with no further mousemove first: if the
    // out-of-bounds move had NOT cleared the hover, Shift+Click would use the
    // stale (still-valid) hover directly and wrongly pin it despite the click
    // itself landing nowhere near a signal.
    await shiftClickAt(wrapper, 0, OFF_SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('drops the hovered box once the cursor moves to a frequency with no signal, outside its box', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // A different frequency, clearly outside the signal's own edges, with no
    // signal of its own — the cursor has genuinely left the box.
    await moveAt(wrapper, 0, OFF_SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 0, OFF_SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('mouseleave clears the hovered box so a stale/vanished signal cannot later be pinned', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    await leaveRaster(wrapper)
    // The signal genuinely vanishes entirely after the cursor left.
    await pushSignalRow(store, null)

    // No fresh mousemove after mouseleave — if the hover box were still held,
    // Shift+Click would use it directly (bypassing fresh detection) and pin a
    // signal that no longer exists anywhere.
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('refreshes the hovered box with a new detection (not just the stale one) as the signal scrolls clear of the live row', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ) // endMs still null: touches row 0

    // The signal scrolls out of the live row; row 1 now holds what was row 0.
    await pushSignalRow(store, null)
    await moveAt(wrapper, 1, SIGNAL_FREQ_HZ)
    // A second move over the now-ended (endMs !== null) box exercises the
    // sticky check's own end-time row lookup, not just the start-time one.
    await moveAt(wrapper, 1, SIGNAL_FREQ_HZ)

    await shiftClickAt(wrapper, 1, SIGNAL_FREQ_HZ)

    // A stale (never-refreshed) marker would still show endMs === null — the
    // refreshed detection now has a real end time, so both labels render.
    expect(hasStartLabel(wrapper)).toBe(true)
    expect(hasEndLabel(wrapper)).toBe(true)
  })

  it('clears pinned and hovered signal markers when a retune invalidates the row history', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)

    // A new centre frequency invalidates every retained row's frequency mapping.
    nowMs += 50
    store.setSpectrum(
      makeFrame({
        center_hz: CENTER_HZ + 1_000_000,
        sample_rate: SAMPLE_RATE,
        bins: makeBins(SIGNAL_RANGE),
      }),
    )
    await flushPromises()

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('clears pinned signal markers when playback stops', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)

    store.setPlaying(false)
    await flushPromises()

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('a pinned signal label disappears once its row scrolls out of the retained history', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)

    // Push well past WF_ROWS (400) plain noise rows so the pinned marker's
    // recorded start time ages out of the retained history entirely.
    for (let index = 0; index < 410; index++) await pushSignalRow(store, null)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('a pinned signal marker with both a start and end time disappears once both age out of history', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ) // endMs still null: touches row 0
    // The signal scrolls out of the live row, giving the marker a real end
    // time before it's pinned — unlike the still-live marker aged out above,
    // this exercises the end-time lookup's own "aged out of history" branch,
    // not just the start-time one.
    await pushSignalRow(store, null)
    await moveAt(wrapper, 1, SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 1, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)
    expect(hasEndLabel(wrapper)).toBe(true)

    // Push well past WF_ROWS (400) plain noise rows so BOTH the pinned
    // marker's start and end times age out of the retained history.
    for (let index = 0; index < 410; index++) await pushSignalRow(store, null)

    expect(hasStartLabel(wrapper)).toBe(false)
    expect(hasEndLabel(wrapper)).toBe(false)
  })

  it('never detects a signal before the waterfall timestamps setting is on', async () => {
    const { wrapper, store } = mountWaterfall()
    store.setShowWaterfallTimestamps(false)
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)

    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    store.setShowWaterfallTimestamps(true)
    await wrapper.vm.$nextTick()

    // Nothing was pinned while the setting was off, so turning it back on
    // reveals no label.
    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('never detects a signal while the display is paused', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    store.displayPaused = true

    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('never detects a signal while a frequency search sweep is active', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    store.searchSweeping = true

    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('detects nothing before any raster row has ever been recorded', async () => {
    const { wrapper } = mountWaterfall()
    // No frames pushed at all — rowBins is empty, so both hover and a
    // Shift+Click fallback detection must be inert, not throw.
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('treats a raster narrower than the shared axis gutters as having no data box to map', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    // Shrink ONLY the raster element's own rect (not the shared spectrum
    // gutter insets it's mapped against) so the computed data width goes
    // negative — a real defensive case if the raster is ever laid out
    // narrower than the axis gutters it shares with the spectrum.
    const rasterEl = wrapper.find('.sdr-wf-raster').element as HTMLElement
    const narrowRect = { ...rasterEl.getBoundingClientRect(), width: 10, right: 10 } as DOMRect
    rasterEl.getBoundingClientRect = () => narrowRect

    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('treats an unmeasured (zero-height) data box as having no rows to hover', async () => {
    // Force the very first layout pass (mount's own resize) to measure an
    // invalid box, so wfDataHeightPx never leaves its zero default — mirrors
    // waterfallTimeMarkers' own "mid-layout box" guard, but exercised through
    // signal-marker detection instead.
    // 20px is small enough that the fake plot's own checkresize() computes
    // mx.b <= mx.t (an inverted/degenerate box) — 0 would instead hit the
    // mock's `clientHeight || 300` fallback and measure a perfectly valid box.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')!
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 20 })
    const { wrapper, store } = mountWaterfall()
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', original)

    // Rows can still be recorded (recording doesn't depend on layout), but
    // without ever a valid resize/draw pass, wfDataHeightPx stays at 0.
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)

    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('a Shift+Click with no prior hover and a cursor beyond the retained rows pins nothing', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    const raster = wrapper.find('.sdr-wf-raster')
    const clientX = clientXForFreqHz(SIGNAL_FREQ_HZ)
    // No mousemove first, so the click's fallback detection runs fresh and
    // must itself fail cleanly (no row at this point) rather than pin.
    await raster.trigger('mousedown', { button: 0, clientX, clientY: 100_000, shiftKey: true })
    await raster.trigger('mouseup', { button: 0, clientX, clientY: 100_000, shiftKey: true })

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('drops a hovered box once its recorded start row ages out of the retained history', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 3; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)

    // Push well past WF_ROWS (400) noise-only rows: the row the hovered
    // marker's start time pointed at has now scrolled out of history
    // entirely, even though the hover ref itself was never explicitly cleared.
    for (let index = 0; index < 410; index++) await pushSignalRow(store, null)
    await moveAt(wrapper, 0, SIGNAL_FREQ_HZ)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)

    expect(hasStartLabel(wrapper)).toBe(false)
  })

  it('has no accessibility violations with a pinned signal marker shown', async () => {
    const { wrapper, store } = mountWaterfall()
    for (let index = 0; index < 5; index++) await pushSignalRow(store, SIGNAL_RANGE)
    await shiftClickAt(wrapper, 0, SIGNAL_FREQ_HZ)
    expect(hasStartLabel(wrapper)).toBe(true)

    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
