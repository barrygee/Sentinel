import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DownloadEstimate from './DownloadEstimate.vue'
import type { OfflineAreaEstimateResult } from '@/utils/offlineMapEstimate'

const ESTIMATE: OfflineAreaEstimateResult = {
  basemapTiles: 100,
  basemapBytes: 1024 * 1024,
  terrainTiles: 50,
  terrainBytes: 512 * 1024,
  totalBytes: 1024 * 1024 + 512 * 1024,
}

function mountEstimate(estimate: OfflineAreaEstimateResult | null, freeBytes: number) {
  return mount(DownloadEstimate, { props: { estimate, freeBytes } })
}

describe('DownloadEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the formatted total size and tile count, split basemap/terrain', () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    expect(wrapper.find('.oma-estimate-size').text()).toBe('Up to 1.5 MB')
    expect(wrapper.find('.oma-estimate-tiles').text()).toBe('· 150 tiles')
    const rows = wrapper.findAll('.oma-estimate-row dd')
    expect(rows[0]!.text()).toBe('Up to 1.0 MB')
    expect(rows[1]!.text()).toBe('Up to 512 KB')
    // Free space is measured, not estimated, so it carries no "Up to".
    expect(rows[2]!.text()).toBe('10 GB')
  })

  it('renders 0 B / 0 tiles when there is no estimate yet', () => {
    const wrapper = mountEstimate(null, 0)
    expect(wrapper.find('.oma-estimate-size').text()).toBe('Up to 0 B')
    expect(wrapper.find('.oma-estimate-tiles').text()).toBe('· 0 tiles')
  })

  it('uses the singular "tile" for exactly one tile', () => {
    const wrapper = mountEstimate(
      { basemapTiles: 1, basemapBytes: 10, terrainTiles: 0, terrainBytes: 0, totalBytes: 10 },
      1000,
    )
    expect(wrapper.find('.oma-estimate-tiles').text()).toBe('· 1 tile')
  })

  it('shows the warning style and role=alert text once the estimate exceeds free space by the safety margin', () => {
    // 1.5 MB * 1.1 margin > 1 MB free space.
    const wrapper = mountEstimate(ESTIMATE, 1024 * 1024)
    expect(wrapper.find('.oma-estimate-headline--warning').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('exceeds the free disk space')
  })

  it('shows no warning when the estimate comfortably fits in free space', () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    expect(wrapper.find('.oma-estimate-headline--warning').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not announce anything before the debounce settles', async () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    await vi.advanceTimersByTimeAsync(499)
    expect(wrapper.find('.sr-only').text()).toBe('')
  })

  it('announces the settled estimate once the debounce elapses', async () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.find('.sr-only').text()).toBe('Estimated download: up to 1.5 MB, 150 tiles.')
  })

  it('announces "no area selected yet" when the estimate is null', async () => {
    const wrapper = mountEstimate(null, 0)
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.find('.sr-only').text()).toBe('No area selected yet.')
  })

  it('restarts the debounce on every estimate change, announcing only the final settled value', async () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.setProps({
      estimate: { ...ESTIMATE, basemapTiles: 999, totalBytes: 999 },
      freeBytes: 10 * 1024 * 1024 * 1024,
    })
    await vi.advanceTimersByTimeAsync(300)
    // Only 300ms since the second change — the first change's announcement
    // must never have fired.
    expect(wrapper.find('.sr-only').text()).toBe('')
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper.find('.sr-only').text()).toContain('1,049 tiles')
  })

  it('clears the pending debounce timer on unmount without throwing', () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    wrapper.unmount()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })

  it('unmounts cleanly when the debounce timer already fired (nothing left to clear)', async () => {
    const wrapper = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    await vi.advanceTimersByTimeAsync(500) // let the timer fire and null itself out
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('has no accessibility violations, warning or not', async () => {
    vi.useRealTimers()
    const plain = mountEstimate(ESTIMATE, 10 * 1024 * 1024 * 1024)
    expect(await axe(plain.html(), { rules: { region: { enabled: false } } })).toHaveNoViolations()
    const warning = mountEstimate(ESTIMATE, 0)
    expect(
      await axe(warning.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
