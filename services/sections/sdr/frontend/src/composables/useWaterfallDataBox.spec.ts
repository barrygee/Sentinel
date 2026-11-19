import { afterEach, describe, expect, it } from 'vitest'
import { useWaterfallDataBox, type PlotMargins } from './useWaterfallDataBox'

// A 1000 × 300 canvas with a 56 px left gutter, a 12 px right one, the data box
// top at 20 px and its bottom at 270 px (a 30 px label gutter underneath).
const MARGINS: PlotMargins = { l: 56, r: 988, t: 20, b: 270, width: 1000, height: 300 }

afterEach(() => {
  document.documentElement.style.removeProperty('--sdr-wf-inset-left')
  document.documentElement.style.removeProperty('--sdr-wf-inset-right')
})

describe('useWaterfallDataBox — before the first measure', () => {
  it('starts from the default gutters and no measured box', () => {
    const dataBox = useWaterfallDataBox()
    expect(dataBox.bandInsetLeftPx.value).toBe(56)
    expect(dataBox.bandInsetRightPx.value).toBe(12)
    expect(dataBox.bandInsetBottomPx.value).toBe(0)
    expect(dataBox.bandInsetTopPx.value).toBe(0)
    expect(dataBox.dataBoxWidthPx.value).toBe(0)
  })

  it('leaves the spectrum flush with the waterfall while there is no label gutter', () => {
    const dataBox = useWaterfallDataBox()
    expect(dataBox.spectrumStyle.value).toEqual({ marginBottom: '0px' })
    expect(dataBox.rasterStyle.value).toEqual({ marginBottom: '0px' })
  })
})

describe('useWaterfallDataBox — measure', () => {
  it('copies the margins into the insets at fractional precision', () => {
    const dataBox = useWaterfallDataBox()
    dataBox.measure({ ...MARGINS, l: 40.5, r: 990.25 })
    expect(dataBox.bandInsetLeftPx.value).toBe(40.5)
    expect(dataBox.bandInsetRightPx.value).toBe(9.75)
    expect(dataBox.dataBoxWidthPx.value).toBe(949.75)
  })

  it('rounds the bottom gutter up and puts the top one pixel above the data box', () => {
    const dataBox = useWaterfallDataBox()
    dataBox.measure({ ...MARGINS, b: 269.4, t: 19.2 })
    expect(dataBox.bandInsetBottomPx.value).toBe(31)
    expect(dataBox.bandInsetTopPx.value).toBe(19)
  })

  it('never reports a negative inset or width', () => {
    const dataBox = useWaterfallDataBox()
    dataBox.measure({ l: -5, r: 1010, t: 0, b: 310, width: 1000, height: 300 })
    expect(dataBox.bandInsetLeftPx.value).toBe(0)
    expect(dataBox.bandInsetRightPx.value).toBe(0)
    expect(dataBox.bandInsetBottomPx.value).toBe(0)
    expect(dataBox.bandInsetTopPx.value).toBe(0)
    dataBox.measure({ ...MARGINS, l: 600, r: 500 })
    expect(dataBox.dataBoxWidthPx.value).toBe(0)
  })

  it('publishes the left and right insets as CSS variables for the decoder dock', () => {
    useWaterfallDataBox().measure(MARGINS)
    const rootStyle = document.documentElement.style
    expect(rootStyle.getPropertyValue('--sdr-wf-inset-left')).toBe('56px')
    expect(rootStyle.getPropertyValue('--sdr-wf-inset-right')).toBe('12px')
  })

  it('builds every overlay style from the measured box', () => {
    const dataBox = useWaterfallDataBox()
    dataBox.measure(MARGINS)
    // The 250 px data box spans 0..-100 dB, so the strip reaches the -100 dB line
    // as 0 × … + 4 = 4 px, floored to the 20 px minimum.
    expect(dataBox.bandOverlayStyle.value).toEqual({
      left: '56px',
      right: '12px',
      bottom: '30px',
      height: '20px',
    })
    expect(dataBox.spectrumStyle.value).toEqual({ marginBottom: '4px' })
    expect(dataBox.rasterStyle.value).toEqual({ marginBottom: '-8px' })
    expect(dataBox.tickGutterStyle.value).toEqual({ left: '56px', right: '12px', height: '30px' })
    expect(dataBox.knownFreqOverlayStyle.value).toEqual({
      left: '56px',
      right: '12px',
      top: '19px',
      bottom: '30px',
    })
  })

  it('sets no band height from a collapsed data box', () => {
    const dataBox = useWaterfallDataBox()
    dataBox.measure({ ...MARGINS, t: 270, b: 270 })
    expect(dataBox.bandOverlayStyle.value.height).toBeUndefined()
  })
})
