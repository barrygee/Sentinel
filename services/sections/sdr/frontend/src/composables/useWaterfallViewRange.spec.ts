import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { effectScope, nextTick, reactive, ref, type EffectScope, type Ref } from 'vue'
import type { Plot } from 'sigplot'
import { createWaterfallPlotHandles, type WaterfallPlotHandles } from '../waterfallPlotHandles'
import {
  SPEC_YMAX_DB,
  SPEC_YMIN_DB,
  ZOOM_MAX,
  ZOOM_MIN,
  useWaterfallViewRange,
  type ViewRangeSource,
  type WaterfallViewRange,
} from './useWaterfallViewRange'

// A 2 MHz span at 100 MHz.
const SPAN_START_HZ = 99_000_000
const SPAN_END_HZ = 101_000_000

interface FakePlot {
  unzoom: Mock
  zoom: Mock
  change_settings: Mock
}

function fakePlot(): FakePlot {
  return { unzoom: vi.fn(), zoom: vi.fn(), change_settings: vi.fn() }
}

/** A plot whose every call throws, as sigplot does before its first layer. */
function throwingPlot(): FakePlot {
  const fail = () => {
    throw new Error('sigplot not ready')
  }
  return { unzoom: vi.fn(fail), zoom: vi.fn(fail), change_settings: vi.fn(fail) }
}

interface Harness {
  viewRange: WaterfallViewRange
  source: ViewRangeSource & { currentFreqHz: number }
  plots: WaterfallPlotHandles
  spectrum: FakePlot
  waterfall: FakePlot
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
}

let scopes: EffectScope[] = []

afterEach(() => {
  scopes.forEach((scope) => scope.stop())
  scopes = []
})

function createViewRange(
  options: {
    source?: Partial<ViewRangeSource>
    spectrum?: FakePlot | null
    waterfall?: FakePlot | null
  } = {},
): Harness {
  const source = reactive({
    currentFreqHz: 100_000_000,
    viewZoom: 0,
    viewZmin: -90,
    viewZmax: -10,
    viewAutoScale: true,
    ...options.source,
  })
  const spectrum = options.spectrum === undefined ? fakePlot() : options.spectrum
  const waterfall = options.waterfall === undefined ? fakePlot() : options.waterfall
  const plots = createWaterfallPlotHandles()
  plots.spectrum = spectrum as unknown as Plot | null
  plots.waterfall = waterfall as unknown as Plot | null
  const spanStartHz = ref(SPAN_START_HZ)
  const spanEndHz = ref(SPAN_END_HZ)
  const scope = effectScope()
  scopes.push(scope)
  const viewRange = scope.run(() =>
    useWaterfallViewRange({ source, plots, spanStartHz, spanEndHz }),
  )!
  return {
    viewRange,
    source,
    plots,
    spectrum: spectrum as FakePlot,
    waterfall: waterfall as FakePlot,
    spanStartHz,
    spanEndHz,
  }
}

describe('createWaterfallPlotHandles', () => {
  it('starts with no plots and a unit frequency scale', () => {
    expect(createWaterfallPlotHandles()).toEqual({
      spectrum: null,
      waterfall: null,
      firstBinHz: 0,
      hzPerBin: 1,
    })
  })

  it('hands out a fresh object each call', () => {
    expect(createWaterfallPlotHandles()).not.toBe(createWaterfallPlotHandles())
  })
})

describe('useWaterfallViewRange — constants', () => {
  it('zooms from full span to ×50 over the RTL-SDR 0..-100 dB range', () => {
    expect(ZOOM_MIN).toBe(1)
    expect(ZOOM_MAX).toBe(50)
    expect(SPEC_YMIN_DB).toBe(-100)
    expect(SPEC_YMAX_DB).toBe(0)
  })
})

describe('useWaterfallViewRange — restoring the view', () => {
  it('starts at full span when no zoom was saved', () => {
    expect(createViewRange().viewRange.zoom.value).toBe(ZOOM_MIN)
  })

  it('restores the saved zoom', () => {
    expect(createViewRange({ source: { viewZoom: 8 } }).viewRange.zoom.value).toBe(8)
  })

  it('clamps a saved zoom into range', () => {
    expect(createViewRange({ source: { viewZoom: 500 } }).viewRange.zoom.value).toBe(ZOOM_MAX)
    expect(createViewRange({ source: { viewZoom: 0.25 } }).viewRange.zoom.value).toBe(ZOOM_MIN)
  })

  it('seeds the device range and auto-scale when no slider was ever moved', () => {
    const { viewRange } = createViewRange()
    expect(viewRange.zmin.value).toBe(SPEC_YMIN_DB)
    expect(viewRange.zmax.value).toBe(SPEC_YMAX_DB)
    expect(viewRange.autoScale.value).toBe(true)
  })

  it('restores a saved range and turns auto-scale off', () => {
    const { viewRange } = createViewRange({
      source: { viewAutoScale: false, viewZmin: -80, viewZmax: 0 },
    })
    expect(viewRange.zmin.value).toBe(-80)
    // 0 dB is a real endpoint, not "unset".
    expect(viewRange.zmax.value).toBe(0)
    expect(viewRange.autoScale.value).toBe(false)
  })

  it('starts with no pan offset', () => {
    expect(createViewRange().viewRange.livePanOffsetHz.value).toBe(0)
  })
})

describe('useWaterfallViewRange — zoomWindowHz', () => {
  it('is the whole span at full zoom, whatever is tuned', () => {
    const { viewRange } = createViewRange({ source: { currentFreqHz: 99_100_000 } })
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: SPAN_START_HZ,
      winHi: SPAN_END_HZ,
    })
  })

  it('centres the zoomed window on the tuned frequency', () => {
    const { viewRange } = createViewRange({ source: { currentFreqHz: 100_200_000 } })
    viewRange.zoom.value = 4
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: 99_950_000,
      winHi: 100_450_000,
    })
  })

  it('centres on the span midpoint when nothing is tuned', () => {
    const { viewRange } = createViewRange({ source: { currentFreqHz: 0 } })
    viewRange.zoom.value = 4
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: 99_750_000,
      winHi: 100_250_000,
    })
  })

  it('clamps the zoomed window inside the span at either edge', () => {
    const { viewRange, source } = createViewRange({ source: { currentFreqHz: 99_010_000 } })
    viewRange.zoom.value = 4
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: SPAN_START_HZ,
      winHi: 99_500_000,
    })
    source.currentFreqHz = 100_990_000
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: 100_500_000,
      winHi: SPAN_END_HZ,
    })
  })

  it('adds the pan offset after the clamp so a drag can slide past the edge', () => {
    const { viewRange } = createViewRange()
    viewRange.livePanOffsetHz.value = -300_000
    expect(viewRange.zoomWindowHz(SPAN_START_HZ, SPAN_END_HZ)).toEqual({
      winLo: 98_700_000,
      winHi: 100_700_000,
    })
  })
})

describe('useWaterfallViewRange — applyZoom', () => {
  it('does nothing while the span is empty', () => {
    const { viewRange, spectrum, waterfall, spanEndHz } = createViewRange()
    spanEndHz.value = SPAN_START_HZ
    viewRange.zoom.value = 4
    viewRange.applyZoom()
    expect(spectrum.unzoom).not.toHaveBeenCalled()
    expect(waterfall.unzoom).not.toHaveBeenCalled()
  })

  it('restores the full-span view at zoom 1 with no pan', () => {
    const { viewRange, spectrum, waterfall } = createViewRange()
    viewRange.applyZoom()
    expect(spectrum.unzoom).toHaveBeenCalledTimes(1)
    expect(waterfall.unzoom).toHaveBeenCalledTimes(1)
    expect(spectrum.zoom).not.toHaveBeenCalled()
    expect(waterfall.zoom).not.toHaveBeenCalled()
  })

  it('pushes a zoom level on each plot in its own x units', () => {
    const { viewRange, spectrum, waterfall } = createViewRange({
      source: { currentFreqHz: 100_200_000 },
    })
    viewRange.zoom.value = 4
    viewRange.applyZoom()
    expect(spectrum.unzoom).toHaveBeenCalledTimes(1)
    expect(waterfall.unzoom).toHaveBeenCalledTimes(1)
    // Spectrum layers are in MHz, waterfall layers in Hz; non-continuous so the
    // window lives above the base level.
    expect(spectrum.zoom).toHaveBeenCalledWith({ x: 99.95 }, { x: 100.45 }, false)
    expect(waterfall.zoom).toHaveBeenCalledWith({ x: 99_950_000 }, { x: 100_450_000 }, false)
    expect(spectrum.unzoom.mock.invocationCallOrder[0]!).toBeLessThan(
      spectrum.zoom.mock.invocationCallOrder[0]!,
    )
  })

  it('windows a drag-pan even at zoom 1', () => {
    const { viewRange, waterfall } = createViewRange()
    viewRange.livePanOffsetHz.value = 100_000
    viewRange.applyZoom()
    expect(waterfall.zoom).toHaveBeenCalledWith({ x: 99_100_000 }, { x: 101_100_000 }, false)
  })

  it('swallows sigplot errors on both paths', () => {
    const { viewRange, spectrum, waterfall } = createViewRange({
      spectrum: throwingPlot(),
      waterfall: throwingPlot(),
    })
    expect(() => viewRange.applyZoom()).not.toThrow()
    viewRange.zoom.value = 4
    expect(() => viewRange.applyZoom()).not.toThrow()
    expect(spectrum.zoom).toHaveBeenCalledTimes(1)
    expect(waterfall.zoom).toHaveBeenCalledTimes(1)
  })

  it('tolerates missing plots', () => {
    const { viewRange } = createViewRange({ spectrum: null, waterfall: null })
    expect(() => viewRange.applyZoom()).not.toThrow()
    viewRange.zoom.value = 4
    expect(() => viewRange.applyZoom()).not.toThrow()
  })
})

describe('useWaterfallViewRange — applySpecRange', () => {
  it('sets the spectrum axis with 20 dB divisions and pins the colour map', () => {
    const { viewRange, spectrum, waterfall } = createViewRange()
    viewRange.applySpecRange(-100, 0)
    expect(spectrum.change_settings).toHaveBeenCalledWith({ ymin: -100, ymax: 0, ydiv: -5 })
    expect(waterfall.change_settings).toHaveBeenCalledWith({ autol: -1, zmin: -100, zmax: 0 })
  })

  it('keeps at least one division on a narrow range', () => {
    const { viewRange, spectrum } = createViewRange()
    viewRange.applySpecRange(-40, -35)
    expect(spectrum.change_settings).toHaveBeenCalledWith({ ymin: -40, ymax: -35, ydiv: -1 })
  })

  it('swallows sigplot errors and tolerates missing plots', () => {
    expect(() =>
      createViewRange({
        spectrum: throwingPlot(),
        waterfall: throwingPlot(),
      }).viewRange.applySpecRange(-100, 0),
    ).not.toThrow()
    expect(() =>
      createViewRange({ spectrum: null, waterfall: null }).viewRange.applySpecRange(-100, 0),
    ).not.toThrow()
  })
})

describe('useWaterfallViewRange — clampSliderCollision', () => {
  it('leaves a valid range alone', () => {
    const { viewRange } = createViewRange()
    expect(viewRange.clampSliderCollision(-100, 0)).toBe(false)
    expect(viewRange.zmin.value).toBe(-100)
    expect(viewRange.zmax.value).toBe(0)
  })

  it('stops Min one dB under Max when Min was moved into it', async () => {
    const { viewRange } = createViewRange()
    viewRange.zmax.value = -40
    await nextTick()
    viewRange.zmin.value = -30
    await nextTick()
    expect(viewRange.clampSliderCollision(-30, -40)).toBe(true)
    expect(viewRange.zmin.value).toBe(-41)
    expect(viewRange.zmax.value).toBe(-40)
  })

  it('stops Max one dB over Min when Max was moved into it', async () => {
    const { viewRange } = createViewRange()
    viewRange.zmin.value = -50
    await nextTick()
    viewRange.zmax.value = -60
    await nextTick()
    expect(viewRange.clampSliderCollision(-50, -60)).toBe(true)
    expect(viewRange.zmax.value).toBe(-49)
    expect(viewRange.zmin.value).toBe(-50)
  })

  it('treats equal endpoints as a collision', async () => {
    const { viewRange } = createViewRange()
    viewRange.zmax.value = -100
    await nextTick()
    expect(viewRange.clampSliderCollision(-100, -100)).toBe(true)
    expect(viewRange.zmax.value).toBe(-99)
  })
})
