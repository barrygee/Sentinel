import { describe, it, expect } from 'vitest'
import { isShallow } from 'vue'
import { useSdrSpectrumOverlay } from './useSdrSpectrumOverlay'

describe('useSdrSpectrumOverlay', () => {
  it('starts with nothing to overlay', () => {
    const overlay = useSdrSpectrumOverlay()
    expect(overlay.lastSpectrum.value).toBeNull()
    expect(overlay.displayPaused.value).toBe(false)
    expect(overlay.searchSweeping.value).toBe(false)
    expect(overlay.searchLowHz.value).toBeNull()
    expect(overlay.searchHighHz.value).toBeNull()
    expect(overlay.searchCurrentHz.value).toBeNull()
    expect(overlay.searchLabel.value).toBeNull()
    expect(overlay.scanSweeping.value).toBe(false)
    expect(overlay.scanGroupNames.value).toEqual([])
  })

  it('holds the latest frame as-is, without deep-proxying its bins', () => {
    const overlay = useSdrSpectrumOverlay()
    const frame = { bins: [1, 2, 3], center_hz: 100e6, sample_rate: 2.048e6, ts: 1 }
    overlay.setSpectrum(frame)
    expect(overlay.lastSpectrum.value).toBe(frame)
    expect(overlay.lastSpectrum.value?.bins).toBe(frame.bins)
    expect(isShallow(overlay.lastSpectrum)).toBe(true)
  })
})
