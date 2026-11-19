import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plot } from 'sigplot'

// The real mx draws on a canvas; record what the patches delegate to it instead.
const originals = vi.hoisted(() => ({
  drawaxis: vi.fn(() => 'AXIS'),
  text: vi.fn(),
  textline: vi.fn(),
}))

vi.mock('sigplot/js/mx', () => ({ default: { ...originals } }))

// @ts-expect-error – sigplot ships no .d.ts for its internal mx module.
import mx from 'sigplot/js/mx'
import { installMarginTweaks } from './sigplotAxisPatches'

beforeEach(() => {
  originals.drawaxis.mockClear()
  originals.text.mockClear()
  originals.textline.mockClear()
})

// ── installMarginTweaks ────────────────────────────────────────────────────────

interface Margins {
  l: number
  r: number
  t: number
  b: number
  text_w: number
  text_h: number
  width: number
  height: number
}

function plotWith(margins: Partial<Margins> = {}): { plot: Plot; mx: Margins } {
  const Mx: Margins = {
    l: 48,
    r: 950,
    t: 1,
    b: 280,
    text_w: 8,
    text_h: 12,
    width: 1000,
    height: 300,
    ...margins,
  }
  return { plot: { _Mx: Mx } as unknown as Plot, mx: Mx }
}

describe('installMarginTweaks', () => {
  it('keeps the margins sigplot already set', () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    expect([margins.l, margins.r, margins.t, margins.b]).toEqual([48, 950, 1, 280])
  })

  it("narrows sigplot's six-character left gutter to four and a half", () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    margins.l = 48 // 6 × text_w
    expect(margins.l).toBe(36)
    margins.l = 50 // within a character of 6 × text_w
    expect(margins.l).toBe(36)
  })

  it('leaves any other left gutter alone', () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    margins.l = 80
    expect(margins.l).toBe(80)
    margins.l = 1
    expect(margins.l).toBe(1)
  })

  it('assumes a one-pixel character before the font is measured', () => {
    const { plot, mx: margins } = plotWith({ text_w: 0 })
    installMarginTweaks(plot)
    margins.l = 6
    expect(margins.l).toBe(4.5)
  })

  it('pushes the top down to at least 1.2 text heights', () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    margins.t = 1
    expect(margins.t).toBe(14)
    margins.t = 30
    expect(margins.t).toBe(30)
  })

  it('assumes a 12 px text height before the font is measured', () => {
    const { plot, mx: margins } = plotWith({ text_h: 0 })
    installMarginTweaks(plot)
    margins.t = 1
    expect(margins.t).toBe(14)
    margins.b = 999
    expect(margins.b).toBe(300 - 38)
  })

  it('extends the right edge to the canvas edge', () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    margins.r = 900
    expect(margins.r).toBe(999)
    margins.r = 1200
    expect(margins.r).toBe(1200)
  })

  it('raises the bottom to leave a 3.2 text-height label gutter', () => {
    const { plot, mx: margins } = plotWith()
    installMarginTweaks(plot)
    margins.b = 290
    expect(margins.b).toBe(300 - 38)
    margins.b = 200
    expect(margins.b).toBe(200)
  })
})

// ── mx.drawaxis ────────────────────────────────────────────────────────────────

function axisMx(fg: string, bg: string) {
  return {
    stk: [{ x1: 50.7, y1: 10.2, x2: 990.9, y2: 270.4 }],
    level: 0,
    active_canvas: document.createElement('canvas'),
    fg,
    bg,
    width: 1000,
    height: 300,
  }
}

describe('mx.drawaxis patch', () => {
  it('always draws with sigplot box suppressed and returns its result', () => {
    const flags: Record<string, unknown> = {}
    expect(mx.drawaxis({}, axisMx('#fff', '#000'), 1, 1, 0, 0, flags)).toBe('AXIS')
    expect(originals.drawaxis).toHaveBeenCalledTimes(1)
    expect(flags.noaxisbox).toBe(true)
  })

  it('redraws only the bottom and left box edges on the spectrum, padded 2 px', () => {
    mx.drawaxis({}, axisMx('#fff', '#000'), 1, 1, 0, 0, {})
    const Mx = expect.anything()
    expect(originals.textline.mock.calls).toEqual([
      [Mx, 992, 272, 48, 272],
      [Mx, 48, 272, 48, 8],
    ])
  })

  it('draws the box exactly on the data box with exactbox', () => {
    mx.drawaxis({}, axisMx('#fff', '#000'), 1, 1, 0, 0, { exactbox: true })
    const Mx = expect.anything()
    expect(originals.textline.mock.calls).toEqual([
      [Mx, 990, 270, 50, 270],
      [Mx, 50, 270, 50, 10],
    ])
  })

  it('keeps the padded box inside the canvas', () => {
    const Mx = axisMx('#fff', '#000')
    Mx.stk = [{ x1: 1, y1: 1, x2: 999.5, y2: 299.5 }]
    mx.drawaxis({}, Mx, 1, 1, 0, 0, {})
    expect(originals.textline.mock.calls[0]!.slice(1)).toEqual([1000, 300, 0, 300])
  })

  it('draws no box when the caller asked for none', () => {
    mx.drawaxis({}, axisMx('#fff', '#000'), 1, 1, 0, 0, { noaxisbox: true })
    expect(originals.textline).not.toHaveBeenCalled()
  })

  it('strips every tick, label, grid and box from the waterfall (fg equals bg)', () => {
    const flags: Record<string, unknown> = { grid: true }
    mx.drawaxis({}, axisMx('#123', '#123'), 1, 1, 0, 0, flags)
    expect(flags).toEqual({
      noxtics: true,
      noytics: true,
      noxtlab: true,
      noytlab: true,
      noxplab: true,
      noyplab: true,
      grid: false,
      noaxisbox: true,
    })
    expect(originals.textline).not.toHaveBeenCalled()
  })
})

// ── mx.text ────────────────────────────────────────────────────────────────────

/** Plot margins with the data box bottom at 270 px and 12 px text. */
function textMx(measuredWidthPx = 20) {
  const canvas = document.createElement('canvas')
  const context = { font: '', measureText: vi.fn(() => ({ width: measuredWidthPx })) }
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  return {
    mx: {
      b: 270,
      l: 40,
      text_h: 12,
      text_w: 8,
      active_canvas: canvas,
      font: { font: '12px Barlow' },
    },
    context,
  }
}

const Y_AXIS_ROW = 100
const X_AXIS_ROW = 285

describe('mx.text patch', () => {
  it("drops sigplot's offset caption", () => {
    mx.text(textMx().mx, 10, X_AXIS_ROW, '314.8 +Δ 0.1')
    expect(originals.text).not.toHaveBeenCalled()
  })

  it.each(['433', '433.', '433.5', '-12.25'])(
    'drops x-axis tick label %s (the gutter draws HTML labels)',
    (label) => {
      mx.text(textMx().mx, 10, X_AXIS_ROW, label)
      expect(originals.text).not.toHaveBeenCalled()
    },
  )

  it('treats a number outside the label row as a y-axis label', () => {
    mx.text(textMx().mx, 10, 270 + 6, '433')
    mx.text(textMx().mx, 10, 270 + 24, '433')
    expect(originals.text).toHaveBeenCalledTimes(2)
  })

  it('strips the trailing dot from a y-axis integer', () => {
    mx.text(textMx().mx, 10, Y_AXIS_ROW, '-30.')
    expect(originals.text.mock.calls[0]![3]).toBe('-30')
  })

  it('rounds a fractional y-axis label to whole dB', () => {
    mx.text(textMx().mx, 10, Y_AXIS_ROW, '-20.666667')
    expect(originals.text.mock.calls[0]![3]).toBe('-21')
  })

  it("right-aligns a y-axis label 12 px left of the data box in sigplot's font", () => {
    const { mx: margins, context } = textMx(20)
    mx.text(margins, 3, Y_AXIS_ROW, '-80', '#fff')
    expect(context.font).toBe('12px Barlow')
    expect(context.measureText).toHaveBeenCalledWith('-80')
    expect(originals.text).toHaveBeenCalledWith(margins, 40 - 12 - 20, Y_AXIS_ROW, '-80', '#fff')
  })

  it('keeps a wide y-axis label at least 4 px from the canvas edge', () => {
    const { mx: margins } = textMx(60)
    mx.text(margins, 3, Y_AXIS_ROW, '-120')
    expect(originals.text.mock.calls[0]![1]).toBe(4)
  })

  it('measures on the fallback canvas and keeps the context font when none is set', () => {
    const { mx: margins, context } = textMx(10)
    const fallback = {
      ...margins,
      canvas: margins.active_canvas,
      active_canvas: undefined,
      font: {},
    }
    mx.text(fallback, 3, Y_AXIS_ROW, '0')
    expect(context.font).toBe('')
    expect(originals.text.mock.calls[0]![1]).toBe(40 - 12 - 10)
  })

  it('keeps the x when there is no canvas to measure on', () => {
    const margins = { b: 270, l: 40, text_h: 12, text_w: 8 }
    mx.text(margins, 7, Y_AXIS_ROW, '-50')
    expect(originals.text.mock.calls[0]![1]).toBe(7)
  })

  it('passes non-numeric text through untouched', () => {
    const { mx: margins, context } = textMx()
    mx.text(margins, 7, Y_AXIS_ROW, 'dBFS')
    expect(context.measureText).not.toHaveBeenCalled()
    expect(originals.text).toHaveBeenCalledWith(margins, 7, Y_AXIS_ROW, 'dBFS', undefined)
  })
})
