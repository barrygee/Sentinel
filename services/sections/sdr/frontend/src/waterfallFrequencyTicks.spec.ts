import { describe, expect, it } from 'vitest'
import {
  HZ_PER_MHZ,
  formatFreqTick,
  layoutFrequencyTicks,
  type FrequencyTickWindow,
} from './waterfallFrequencyTicks'

// A 2.4 MHz span at 100 MHz: the default RTL-SDR span the spectrum is drawn at.
const SPAN_START_HZ = 98_800_000
const SPAN_END_HZ = 101_200_000

function fullSpanWindow(overrides: Partial<FrequencyTickWindow> = {}): FrequencyTickWindow {
  return {
    spanStartHz: SPAN_START_HZ,
    spanEndHz: SPAN_END_HZ,
    windowLowHz: SPAN_START_HZ,
    windowHighHz: SPAN_END_HZ,
    dataBoxWidthPx: 5000,
    ...overrides,
  }
}

describe('HZ_PER_MHZ', () => {
  it('is one million', () => {
    expect(HZ_PER_MHZ).toBe(1_000_000)
  })
})

describe('layoutFrequencyTicks', () => {
  it('returns no ticks for an empty span', () => {
    expect(
      layoutFrequencyTicks(fullSpanWindow({ spanStartHz: SPAN_END_HZ, spanEndHz: SPAN_END_HZ })),
    ).toEqual([])
  })

  it('returns no ticks for an inverted span', () => {
    expect(
      layoutFrequencyTicks(fullSpanWindow({ spanStartHz: SPAN_END_HZ, spanEndHz: SPAN_START_HZ })),
    ).toEqual([])
  })

  it('steps 0.1 MHz across the full span, each tick placed by its share of the window', () => {
    const ticks = layoutFrequencyTicks(fullSpanWindow())
    // 98.8 .. 101.2 in 0.1 MHz steps, both ends included.
    expect(ticks).toHaveLength(25)
    expect(ticks[0]).toEqual({ key: 't-98800000', leftPct: 0, label: '98.8M', labeled: true })
    expect(ticks[24]!.label).toBe('101.2M')
    expect(ticks[24]!.leftPct).toBeCloseTo(100, 6)
    expect(ticks[12]!.label).toBe('100M')
    expect(ticks[12]!.leftPct).toBeCloseTo(50, 6)
  })

  it('starts on the first whole step inside an off-step window', () => {
    const ticks = layoutFrequencyTicks(
      fullSpanWindow({ windowLowHz: 98_850_000, windowHighHz: 101_250_000 }),
    )
    expect(ticks[0]!.label).toBe('98.9M')
    expect(ticks[0]!.leftPct).toBeCloseTo((50_000 / 2_400_000) * 100, 6)
  })

  // Window width / 24 divisions picks sigplot's nice step: 1, 2, 2.5, 5 or 10 × 10^n.
  it.each([
    // window width (Hz), expected step between ticks (Hz)
    [3_600_000, 100_000], // ddf 1.5 → 1 × 0.1 MHz
    [4_800_000, 200_000], // ddf 2   → 2 × 0.1 MHz
    [7_200_000, 250_000], // ddf 3   → 2.5 × 0.1 MHz
    [12_000_000, 500_000], // ddf 5  → 5 × 0.1 MHz
    [19_200_000, 1_000_000], // ddf 8 → 10 × 0.1 MHz
    [2_400_000, 100_000], // ddf 10 → 10 × 0.01 MHz
    [240_000, 10_000], // zoomed ×10 → 10 × 0.001 MHz
    // Just under each band edge, so a shifted threshold picks the wrong step.
    [4_080_000, 100_000], // ddf 1.7 → 1 ×
    [5_280_000, 200_000], // ddf 2.2 → 2 ×
    [8_160_000, 250_000], // ddf 3.4 → 2.5 ×
    [16_560_000, 500_000], // ddf 6.9 → 5 ×
  ])('picks the nice step for a %d Hz window', (windowWidthHz, expectedStepHz) => {
    const ticks = layoutFrequencyTicks(
      fullSpanWindow({ windowLowHz: 100_000_000, windowHighHz: 100_000_000 + windowWidthHz }),
    )
    const keyHz = (index: number) => Number(ticks[index]!.key.slice(2))
    expect(keyHz(1) - keyHz(0)).toBeCloseTo(expectedStepHz, 0)
  })

  it('labels a 0.025 MHz step with three decimals', () => {
    const ticks = layoutFrequencyTicks(
      fullSpanWindow({ windowLowHz: 100_000_000, windowHighHz: 100_720_000 }),
    )
    expect(ticks.map((tick) => tick.label).slice(0, 3)).toEqual(['100M', '100.025M', '100.05M'])
  })

  it('keeps every label when the ticks are far enough apart', () => {
    const ticks = layoutFrequencyTicks(fullSpanWindow({ dataBoxWidthPx: 5000 }))
    expect(ticks.every((tick) => tick.labeled)).toBe(true)
  })

  it('thins labels to every Nth tick on a narrow box but keeps every tick line', () => {
    // 25 ticks over 600 px ≈ 25 px apart; a "101.2M" pill needs 6×7+18+6 = 66 px,
    // so only every third label survives.
    const ticks = layoutFrequencyTicks(fullSpanWindow({ dataBoxWidthPx: 600 }))
    expect(ticks).toHaveLength(25)
    expect(ticks.map((tick) => tick.labeled).slice(0, 7)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
    ])
  })
})

describe('formatFreqTick', () => {
  it('formats GHz with three more decimals than the MHz precision, trimmed', () => {
    expect(formatFreqTick(1_296_500_000, 1)).toBe('1.2965G')
    expect(formatFreqTick(2_000_000_000, 1)).toBe('2G')
  })

  it('formats MHz at the given precision, trimming trailing zeros', () => {
    expect(formatFreqTick(123_450_000, 2)).toBe('123.45M')
    expect(formatFreqTick(123_400_000, 2)).toBe('123.4M')
    expect(formatFreqTick(123_000_000, 2)).toBe('123M')
    expect(formatFreqTick(1_000_000, 1)).toBe('1M')
  })

  it('formats kHz with three fewer decimals, never below zero', () => {
    expect(formatFreqTick(999_500, 1)).toBe('1000K')
    expect(formatFreqTick(531_250, 4)).toBe('531.3K')
    expect(formatFreqTick(531_250, 6)).toBe('531.25K')
  })

  it('caps the precision at six decimals', () => {
    expect(formatFreqTick(1_234_567_891, 6)).toBe('1.234568G')
  })

  it('leaves a whole number untouched', () => {
    expect(formatFreqTick(500_000, 1)).toBe('500K')
  })
})
