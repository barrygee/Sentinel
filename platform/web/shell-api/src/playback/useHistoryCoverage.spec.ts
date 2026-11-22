import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { COVERAGE_REFRESH_MS, useHistoryCoverage } from './useHistoryCoverage'

vi.mock('./historyApi', () => ({ fetchHistoryCoverage: vi.fn() }))
import { fetchHistoryCoverage } from './historyApi'

const HOUR = 3_600_000

describe('useHistoryCoverage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchHistoryCoverage).mockReset()
    vi.mocked(fetchHistoryCoverage).mockResolvedValue({
      from: 0,
      to: 10 * HOUR,
      bucketMs: HOUR,
      buckets: [
        [2 * HOUR, 40, 'online'],
        [3 * HOUR, 10, 'offgrid'],
      ],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('loads coverage while active, refreshes it every minute, and stops when inactive', async () => {
    const active = ref(true)
    const scope = effectScope()
    const coverage = scope.run(() => useHistoryCoverage('air', true, active))!
    await flushPromises()
    expect(fetchHistoryCoverage).toHaveBeenCalledWith('air')
    expect(coverage.spans.value).toEqual([
      { start: 2 * HOUR, end: 3 * HOUR, source: 'online' },
      { start: 3 * HOUR, end: 4 * HOUR, source: 'offgrid' },
    ])
    await vi.advanceTimersByTimeAsync(COVERAGE_REFRESH_MS)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(2)
    active.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(3 * COVERAGE_REFRESH_MS)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('does nothing while inactive, and stops its timer when disposed', async () => {
    const active = ref(false)
    const scope = effectScope()
    scope.run(() => useHistoryCoverage('air', true, active))
    await flushPromises()
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
    active.value = true
    await flushPromises()
    scope.stop()
    await vi.advanceTimersByTimeAsync(3 * COVERAGE_REFRESH_MS)
    expect(fetchHistoryCoverage).toHaveBeenCalledTimes(1)
  })

  it('keeps the last coverage when it cannot be read', async () => {
    vi.mocked(fetchHistoryCoverage).mockResolvedValue(null)
    const scope = effectScope()
    const coverage = scope.run(() => useHistoryCoverage('air', true, ref(true)))!
    await flushPromises()
    expect(coverage.spans.value).toEqual([])
    scope.stop()
  })

  it('a section without recorded coverage never asks', async () => {
    const scope = effectScope()
    const coverage = scope.run(() => useHistoryCoverage('space', false, ref(true)))!
    await flushPromises()
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
    expect(coverage.sourceAt(5)).toBeNull()
    scope.stop()
  })

  it('names the source heard at a moment', async () => {
    const scope = effectScope()
    const coverage = scope.run(() => useHistoryCoverage('air', true, ref(true)))!
    await flushPromises()
    expect(coverage.sourceAt(2 * HOUR + 1)).toBe('online')
    expect(coverage.sourceAt(3 * HOUR)).toBe('off grid')
    expect(coverage.sourceAt(5 * HOUR)).toBeNull()
    scope.stop()
  })
})
