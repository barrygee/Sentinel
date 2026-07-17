import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, effectScope, type EffectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSdrSweepEngine, type UseSdrSweepEngineOptions } from './useSdrSweepEngine'
import { useSdrStore, type SdrFrequencyGroup, type SdrStoredFrequency } from '@/stores/sdr'
import { listSearchRanges } from '@/services/sdrSearchApi'
import type { SdrSearchRange } from '@/services/sdrSearchApi'

vi.mock('@/services/sdrSearchApi', () => ({
  listSearchRanges: vi.fn(),
}))
const listSearchRangesMock = vi.mocked(listSearchRanges)

function makeFreq(overrides: Partial<SdrStoredFrequency> = {}): SdrStoredFrequency {
  return {
    id: 1,
    label: 'Tower',
    frequency_hz: 118_100_000,
    mode: 'AM',
    scannable: true,
    group_id: null,
    group_ids: [],
    ...overrides,
  } as SdrStoredFrequency
}

function makeRange(overrides: Partial<SdrSearchRange> = {}): SdrSearchRange {
  return {
    id: 11,
    label: 'Airband',
    low_hz: 118_000_000,
    high_hz: 118_050_000,
    step_hz: 25_000,
    mode: 'AM',
    threshold_dbfs: -30,
    dwell_ms: 250,
    band_name: '',
    enabled: true,
    notes: '',
    sort_order: 0,
    ...overrides,
  }
}

// Spectrum helpers: 16 bins → mid 8; the sampler window is mid±4 skipping mid.
function hotBins(): number[] {
  const bins = new Array<number>(16).fill(-100)
  bins[10] = -10 // strong signal inside the demod window
  return bins
}
function quietBins(): number[] {
  return new Array<number>(16).fill(-100)
}

let activeScope: EffectScope | null = null

function createHarness(overrides: Partial<UseSdrSweepEngineOptions> = {}) {
  const sendCmd = vi.fn()
  const tuneToFreq = vi.fn()
  const tuneToHzMode = vi.fn()
  const startAudioForSearch = vi.fn()
  const options: UseSdrSweepEngineOptions = {
    sdrStore: () => useSdrStore(),
    sendCmd,
    freqs: ref<SdrStoredFrequency[]>([
      makeFreq(),
      makeFreq({ id: 2, label: 'Marine', frequency_hz: 156_800_000, mode: 'NFM' }),
    ]),
    groupsWithFreqs: ref<SdrFrequencyGroup[]>([
      { id: 1, name: 'Air' } as SdrFrequencyGroup,
      { id: 2, name: 'Marine' } as SdrFrequencyGroup,
    ]),
    readOnly: ref(false),
    squelch: ref(-30),
    bwHz: ref(10_000),
    resumeDelaySec: ref(0),
    currentMode: ref('NFM'),
    tuneToFreq,
    tuneToHzMode,
    startAudioForSearch,
    ...overrides,
  }
  activeScope = effectScope()
  const engine = activeScope.run(() => useSdrSweepEngine(options))!
  return { options, engine, sendCmd, tuneToFreq, tuneToHzMode, startAudioForSearch }
}

/** Feeds N spectrum frames labelled with the given centre (the race guard needs ≥2). */
function feedFrames(
  engine: ReturnType<typeof createHarness>['engine'],
  centerHz: number,
  bins: number[],
  count = 2,
) {
  for (let frameIndex = 0; frameIndex < count; frameIndex++) {
    engine.noteSpectrumFrame({ bins, center_hz: centerHz, sample_rate: 2_048_000 })
  }
}

function useSweepTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  listSearchRangesMock.mockReset()
})

afterEach(() => {
  activeScope?.stop()
  activeScope = null
  vi.useRealTimers()
})

describe('useSdrSweepEngine — scanner', () => {
  it('starting a scan tunes the first scannable frequency and dwells', () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    expect(engine.scanActive.value).toBe(true)
    expect(tuneToFreq).toHaveBeenCalledTimes(1)
    expect(tuneToFreq.mock.calls[0]![0].frequency_hz).toBe(118_100_000)
    expect(engine.scanCurrentHz.value).toBe(118_100_000)
  })

  it('advances to the next frequency when the channel is quiet after the dwell', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    feedFrames(engine, 118_100_000, quietBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(tuneToFreq).toHaveBeenCalledTimes(2)
    expect(tuneToFreq.mock.calls[1]![0].frequency_hz).toBe(156_800_000)
  })

  it('locks when the sampled channel is above the squelch threshold', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    feedFrames(engine, 118_100_000, hotBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.scanLocked.value).toBe(true)
    expect(tuneToFreq).toHaveBeenCalledTimes(1) // held, not stepping
  })

  it('auto-resumes a locked scan once the signal goes quiet for the resume delay', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    feedFrames(engine, 118_100_000, hotBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.scanLocked.value).toBe(true)
    feedFrames(engine, 118_100_000, quietBins(), 1) // signal dropped
    await vi.advanceTimersByTimeAsync(200) // one resume poll, delay 0 → resume
    expect(engine.scanLocked.value).toBe(false)
    expect(tuneToFreq).toHaveBeenCalledTimes(2) // stepped onward
  })

  it('waits the configured resume delay (and re-arms while the signal returns)', async () => {
    useSweepTimers()
    const { engine } = createHarness({ resumeDelaySec: ref(1) })
    engine.onScanPrimaryClick()
    feedFrames(engine, 118_100_000, hotBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.scanLocked.value).toBe(true)
    feedFrames(engine, 118_100_000, quietBins(), 1)
    await vi.advanceTimersByTimeAsync(200) // quiet, but 0ms < 1000ms delay
    expect(engine.scanLocked.value).toBe(true)
    feedFrames(engine, 118_100_000, hotBins(), 1) // signal back → quiet timer resets
    await vi.advanceTimersByTimeAsync(200)
    feedFrames(engine, 118_100_000, quietBins(), 1)
    await vi.advanceTimersByTimeAsync(200) // quiet again — clock restarts
    expect(engine.scanLocked.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1000) // full delay elapses quiet
    expect(engine.scanLocked.value).toBe(false)
  })

  it('gives up waiting for a clean frame after the recheck budget and advances', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    // No frames fed at all: dwell 250ms + 12 rechecks × 80ms, then advance.
    await vi.advanceTimersByTimeAsync(250 + 12 * 80)
    expect(tuneToFreq).toHaveBeenCalledTimes(2)
  })

  it('the primary button stops an unlocked scan and resumes a locked one', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    feedFrames(engine, 118_100_000, hotBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.scanLocked.value).toBe(true)
    engine.onScanPrimaryClick() // locked → RESUME (unlock + step on)
    expect(engine.scanLocked.value).toBe(false)
    expect(engine.scanActive.value).toBe(true)
    expect(tuneToFreq).toHaveBeenCalledTimes(2)
    engine.onScanPrimaryClick() // unlocked → STOP
    expect(engine.scanActive.value).toBe(false)
    expect(engine.scanCurrentHz.value).toBeNull()
  })

  it('does not start with no scannable frequencies', () => {
    const { engine, tuneToFreq } = createHarness({
      freqs: ref<SdrStoredFrequency[]>([makeFreq({ scannable: false })]),
    })
    engine.onScanPrimaryClick()
    expect(engine.scanActive.value).toBe(false)
    expect(tuneToFreq).not.toHaveBeenCalled()
  })

  it('starting a scan stops an active range search (mutual exclusion)', () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    expect(engine.searchActive.value).toBe(true)
    engine.onScanPrimaryClick()
    expect(engine.searchActive.value).toBe(false)
    expect(engine.scanActive.value).toBe(true)
  })
})

describe('useSdrSweepEngine — scan group filters', () => {
  it('filters the queue to frequencies in the selected groups (group_ids + legacy group_id)', () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness({
      freqs: ref<SdrStoredFrequency[]>([
        makeFreq({ id: 1, frequency_hz: 118_100_000, group_ids: [1] }),
        makeFreq({ id: 2, frequency_hz: 156_800_000, group_ids: [], group_id: 2 }),
        makeFreq({ id: 3, frequency_hz: 121_500_000, group_ids: [0], group_id: 0 }), // ungrouped
      ]),
    })
    engine.toggleScanGroup(2) // leave ALL, select group 2 only
    expect(engine.scanAllSelected.value).toBe(false)
    engine.onScanPrimaryClick()
    expect(tuneToFreq).toHaveBeenCalledTimes(1)
    expect(tuneToFreq.mock.calls[0]![0].frequency_hz).toBe(156_800_000)
  })

  it('toggling group membership adds, removes, and falls back to ALL when empty', () => {
    const { engine } = createHarness()
    engine.toggleScanGroup(1)
    expect(engine.scanSelectedGroupIds.value).toEqual([1])
    engine.toggleScanGroup(2)
    expect(engine.scanSelectedGroupIds.value).toEqual([1, 2])
    engine.toggleScanGroup(1)
    expect(engine.scanSelectedGroupIds.value).toEqual([2])
    engine.toggleScanGroup(2) // last one removed → back to ALL
    expect(engine.scanAllSelected.value).toBe(true)
    expect(engine.scanSelectedGroupIds.value).toEqual([])
  })

  it('toggleScanAll resets the selection', () => {
    const { engine } = createHarness()
    engine.toggleScanGroup(1)
    engine.toggleScanAll()
    expect(engine.scanAllSelected.value).toBe(true)
    expect(engine.scanSelectedGroupIds.value).toEqual([])
  })

  it('re-filters a running scan when the group selection changes, stopping on an empty queue', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness({
      freqs: ref<SdrStoredFrequency[]>([
        makeFreq({ id: 1, frequency_hz: 118_100_000, group_ids: [1] }),
        makeFreq({ id: 2, frequency_hz: 156_800_000, group_ids: [2] }),
      ]),
    })
    engine.onScanPrimaryClick()
    expect(tuneToFreq).toHaveBeenCalledTimes(1)
    engine.toggleScanGroup(2) // narrows the running queue → re-steps immediately
    expect(tuneToFreq).toHaveBeenCalledTimes(2)
    expect(tuneToFreq.mock.calls[1]![0].frequency_hz).toBe(156_800_000)
    engine.toggleScanGroup(2) // deselect the last group → ALL again, restep
    expect(engine.scanAllSelected.value).toBe(true)
    expect(engine.scanActive.value).toBe(true)
  })

  it('stops a running scan when the new group selection leaves nothing to scan', () => {
    useSweepTimers()
    const { engine } = createHarness({
      freqs: ref<SdrStoredFrequency[]>([makeFreq({ id: 1, group_ids: [1] })]),
    })
    engine.onScanPrimaryClick()
    expect(engine.scanActive.value).toBe(true)
    engine.toggleScanGroup(2) // no frequency in group 2 → queue empty → stop
    expect(engine.scanActive.value).toBe(false)
  })

  it('rebuildScanQueue re-seeds the queue from freshly loaded frequencies', async () => {
    useSweepTimers()
    const { options, engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    options.freqs.value = [makeFreq({ id: 9, frequency_hz: 121_500_000 })]
    engine.rebuildScanQueue()
    feedFrames(engine, 118_100_000, quietBins())
    await vi.advanceTimersByTimeAsync(250)
    // The refreshed queue is used for the next step.
    expect(tuneToFreq.mock.calls.at(-1)![0].frequency_hz).toBe(121_500_000)
  })
})

describe('useSdrSweepEngine — range search', () => {
  it('validates the ad-hoc inputs', () => {
    const { engine } = createHarness()
    expect(engine.adhocSearchValid.value).toBe(false) // empty
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '99'
    engine.adhocStepKhz.value = '25'
    expect(engine.adhocSearchValid.value).toBe(false) // low >= high
    engine.adhocHighMhz.value = '101'
    engine.adhocStepKhz.value = '0'
    expect(engine.adhocSearchValid.value).toBe(false) // step <= 0
    engine.adhocStepKhz.value = '25'
    expect(engine.adhocSearchValid.value).toBe(true)
  })

  it('an ad-hoc search starts audio, sweeps from the low edge and mirrors into the store', () => {
    useSweepTimers()
    const { engine, tuneToHzMode, startAudioForSearch } = createHarness()
    const store = useSdrStore()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.adhocStepKhz.value = '25'
    engine.onAdhocPlayClick()
    expect(startAudioForSearch).toHaveBeenCalledWith('NFM')
    expect(engine.searchActive.value).toBe(true)
    expect(engine.isAdhocSearching.value).toBe(true)
    expect(tuneToHzMode).toHaveBeenCalledWith(100_000_000, 'NFM')
    expect(store.searchSweeping).toBe(true)
    expect(store.searchLowHz).toBe(100_000_000)
    expect(store.searchHighHz).toBe(100_050_000)
    expect(store.searchCurrentHz).toBe(100_000_000)
  })

  it('steps quiet channels and wraps at the high edge', async () => {
    useSweepTimers()
    const { engine, tuneToHzMode } = createHarness()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.adhocStepKhz.value = '25'
    engine.onAdhocPlayClick()
    for (const expectedHz of [100_025_000, 100_050_000, 100_000_000]) {
      const lastTunedHz = tuneToHzMode.mock.calls.at(-1)![0] as number
      feedFrames(engine, lastTunedHz, quietBins())
      await vi.advanceTimersByTimeAsync(250)
      expect(tuneToHzMode.mock.calls.at(-1)![0]).toBe(expectedHz)
    }
  })

  it('locks on a hot channel, then auto-resumes past it when the signal drops', async () => {
    useSweepTimers()
    const { engine, tuneToHzMode } = createHarness()
    const store = useSdrStore()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.adhocStepKhz.value = '25'
    engine.onAdhocPlayClick()
    feedFrames(engine, 100_000_000, hotBins())
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.searchLocked.value).toBe(true)
    expect(store.searchSweeping).toBe(false)
    feedFrames(engine, 100_000_000, quietBins(), 1)
    await vi.advanceTimersByTimeAsync(200) // resume poll, delay 0
    expect(engine.searchLocked.value).toBe(false)
    // Advanced past the held frequency before re-stepping.
    expect(tuneToHzMode.mock.calls.at(-1)![0]).toBe(100_025_000)
  })

  it('gives up on a frame-less step after the recheck budget and advances', async () => {
    useSweepTimers()
    const { engine, tuneToHzMode } = createHarness()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.adhocStepKhz.value = '25'
    engine.onAdhocPlayClick()
    await vi.advanceTimersByTimeAsync(250 + 6 * 80) // dwell + SEARCH_MAX_RECHECKS
    expect(tuneToHzMode.mock.calls.at(-1)![0]).toBe(100_025_000)
  })

  it('the ad-hoc play button toggles the running ad-hoc sweep off', () => {
    useSweepTimers()
    const { engine } = createHarness()
    const store = useSdrStore()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    expect(engine.searchActive.value).toBe(true)
    engine.onAdhocPlayClick()
    expect(engine.searchActive.value).toBe(false)
    expect(store.searchSweeping).toBe(false)
    expect(store.searchLowHz).toBeNull()
    expect(engine.searchCurrentHz.value).toBeNull()
  })

  it('rejects an inverted or zero-step range', () => {
    const { engine } = createHarness()
    engine.searchRanges.value = [makeRange({ low_hz: 200, high_hz: 100 })]
    engine.onSavedRangePlayClick(11)
    expect(engine.searchActive.value).toBe(false)
  })

  it('a saved-range play starts that range, and re-clicking it stops the sweep', () => {
    useSweepTimers()
    const { engine, tuneToHzMode } = createHarness()
    engine.searchRanges.value = [
      makeRange(),
      makeRange({ id: 12, low_hz: 121_000_000, high_hz: 121_100_000 }),
    ]
    engine.onSavedRangePlayClick(12)
    expect(engine.searchActive.value).toBe(true)
    expect(engine.isSavedRangeSearching(12)).toBe(true)
    expect(engine.isSavedRangeSearching(11)).toBe(false)
    expect(engine.isAdhocSearching.value).toBe(false)
    expect(tuneToHzMode).toHaveBeenCalledWith(121_000_000, 'AM')
    engine.onSavedRangePlayClick(12)
    expect(engine.searchActive.value).toBe(false)
  })

  it('switching to a different saved range restarts the sweep on it', () => {
    useSweepTimers()
    const { engine, tuneToHzMode } = createHarness()
    engine.searchRanges.value = [
      makeRange(),
      makeRange({ id: 12, low_hz: 121_000_000, high_hz: 121_100_000 }),
    ]
    engine.onSavedRangePlayClick(11)
    engine.onSavedRangePlayClick(12)
    expect(engine.searchSelectedRangeId.value).toBe(12)
    expect(tuneToHzMode).toHaveBeenLastCalledWith(121_000_000, 'AM')
  })

  it('starting a search stops an active scan (mutual exclusion)', () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.onScanPrimaryClick()
    expect(engine.scanActive.value).toBe(true)
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    expect(engine.scanActive.value).toBe(false)
    expect(engine.searchActive.value).toBe(true)
  })

  it('selectSearchRange stops an active sweep and clears the ad-hoc inputs', () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.searchRanges.value = [makeRange()]
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    engine.selectSearchRange(11)
    expect(engine.searchActive.value).toBe(false)
    expect(engine.searchSelectedRangeId.value).toBe(11)
    expect(engine.adhocLowMhz.value).toBe('')
    expect(engine.adhocHighMhz.value).toBe('')
  })

  it('onRangeBeforeDelete stops the sweep only when it is sweeping that range', () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.searchRanges.value = [makeRange()]
    engine.onRangeBeforeDelete(11) // idle → nothing
    engine.onSavedRangePlayClick(11)
    engine.onRangeBeforeDelete(99) // different range → keeps sweeping
    expect(engine.searchActive.value).toBe(true)
    engine.onRangeBeforeDelete(11)
    expect(engine.searchActive.value).toBe(false)
  })
})

describe('useSdrSweepEngine — reloadSearchRanges', () => {
  it('loads ranges and defaults the selection to the first one', async () => {
    const { engine } = createHarness()
    listSearchRangesMock.mockResolvedValue([makeRange(), makeRange({ id: 12 })])
    await engine.reloadSearchRanges()
    expect(engine.searchRanges.value).toHaveLength(2)
    expect(engine.searchSelectedRangeId.value).toBe(11)
  })

  it('keeps an existing selection that still exists', async () => {
    const { engine } = createHarness()
    listSearchRangesMock.mockResolvedValue([makeRange(), makeRange({ id: 12 })])
    await engine.reloadSearchRanges()
    engine.searchSelectedRangeId.value = 12
    await engine.reloadSearchRanges()
    expect(engine.searchSelectedRangeId.value).toBe(12)
  })

  it('stops an active sweep and reselects when the selected range was deleted', async () => {
    useSweepTimers()
    const { engine } = createHarness()
    listSearchRangesMock.mockResolvedValue([makeRange(), makeRange({ id: 12 })])
    await engine.reloadSearchRanges()
    engine.onSavedRangePlayClick(11)
    expect(engine.searchActive.value).toBe(true)
    listSearchRangesMock.mockResolvedValue([makeRange({ id: 12 })])
    await engine.reloadSearchRanges()
    expect(engine.searchActive.value).toBe(false)
    expect(engine.searchSelectedRangeId.value).toBe(12)
  })

  it('clears the list (and selection fallback) when the API fails', async () => {
    const { engine } = createHarness()
    listSearchRangesMock.mockRejectedValue(new Error('boom'))
    await engine.reloadSearchRanges()
    expect(engine.searchRanges.value).toEqual([])
    expect(engine.searchSelectedRangeId.value).toBeNull()
  })
})

describe('useSdrSweepEngine — squelch lock-in (worklet feedback)', () => {
  it('locks an active unlocked scan once the post-tune settle has elapsed', async () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.onScanPrimaryClick()
    engine.onSweepSquelchChange(true) // 0ms after tune — not settled yet
    expect(engine.scanLocked.value).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    engine.onSweepSquelchChange(true)
    expect(engine.scanLocked.value).toBe(true)
    engine.onSweepSquelchChange(true) // already locked — no state change
    expect(engine.scanLocked.value).toBe(true)
  })

  it('locks an active unlocked search the same way', async () => {
    useSweepTimers()
    const { engine } = createHarness()
    const store = useSdrStore()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    await vi.advanceTimersByTimeAsync(250)
    engine.onSweepSquelchChange(true)
    expect(engine.searchLocked.value).toBe(true)
    expect(store.searchSweeping).toBe(false)
  })

  it('ignores squelch-closed reports and idle sweeps', async () => {
    useSweepTimers()
    const { engine } = createHarness()
    engine.onSweepSquelchChange(false)
    await vi.advanceTimersByTimeAsync(1000)
    engine.onSweepSquelchChange(true) // settled but nothing active
    expect(engine.scanLocked.value).toBe(false)
    expect(engine.searchLocked.value).toBe(false)
  })
})

describe('useSdrSweepEngine — store mirrors and follower publish', () => {
  it('mirrors scan state + group names into the store (ALL by default)', async () => {
    const { engine, options } = createHarness()
    const store = useSdrStore()
    expect(store.scanGroupNames).toEqual(['All']) // immediate watcher
    engine.toggleScanGroup(1)
    await nextTick()
    expect(store.scanGroupNames).toEqual(['Air'])
    engine.toggleScanGroup(2)
    await nextTick()
    expect(store.scanGroupNames).toEqual(['Air', 'Marine'])
    void options
  })

  it('skips the scan mirror while a read-only follower (the owner drives it)', async () => {
    const { engine } = createHarness()
    const store = useSdrStore()
    store.setOwnership(false, true, true) // readOnly
    store.scanGroupNames = ['OwnerGroup']
    engine.toggleScanGroup(1)
    await nextTick()
    expect(store.scanGroupNames).toEqual(['OwnerGroup']) // untouched
  })

  it('publishes sweep_state to followers only while the owning instance, deduped', async () => {
    useSweepTimers()
    const { engine, sendCmd } = createHarness()
    const store = useSdrStore()
    store.setOwnership(true, true, false) // owner with control channel
    await nextTick()
    sendCmd.mockClear()
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    await nextTick()
    const sweepCalls = () =>
      sendCmd.mock.calls.filter(([payload]) => (payload as { cmd: string }).cmd === 'sweep_state')
    expect(sweepCalls()).toHaveLength(1)
    expect(sweepCalls()[0]![0]).toMatchObject({
      cmd: 'sweep_state',
      search_active: true,
      search_low_hz: 100_000_000,
      search_high_hz: 100_050_000,
    })
    // Re-assigning an identical value (new array, same content) re-fires the
    // watcher but the serialized payload is unchanged — deduped, no re-send.
    store.scanGroupNames = ['All']
    await nextTick()
    expect(sweepCalls()).toHaveLength(1)
  })

  it('does not publish sweep_state while not the owner', async () => {
    useSweepTimers()
    const { engine, sendCmd } = createHarness()
    const store = useSdrStore()
    store.setOwnership(false, true, false) // control channel up, not owner
    engine.adhocLowMhz.value = '100'
    engine.adhocHighMhz.value = '100.05'
    engine.onAdhocPlayClick()
    await nextTick()
    expect(
      sendCmd.mock.calls.some(([payload]) => (payload as { cmd: string }).cmd === 'sweep_state'),
    ).toBe(false)
  })

  it('clears the mirrored owner sweep state when read-only ends', async () => {
    const { options } = createHarness()
    const store = useSdrStore()
    options.readOnly.value = true
    await nextTick() // becoming read-only leaves the mirror alone
    store.searchSweeping = true
    store.searchLowHz = 1
    store.searchHighHz = 2
    store.searchCurrentHz = 3
    store.scanSweeping = true
    store.scanGroupNames = ['OwnerGroup']
    options.readOnly.value = false
    await nextTick()
    expect(store.searchSweeping).toBe(false)
    expect(store.searchLowHz).toBeNull()
    expect(store.searchHighHz).toBeNull()
    expect(store.searchCurrentHz).toBeNull()
    expect(store.scanSweeping).toBe(false)
    expect(store.scanGroupNames).toEqual([])
  })
})

describe('useSdrSweepEngine — race guard', () => {
  it('requires two frames labelled with the tuned centre before sampling', async () => {
    useSweepTimers()
    const { engine, tuneToFreq } = createHarness()
    engine.onScanPrimaryClick()
    // Only ONE matching frame (the race-window discard) — plus one stale-centre
    // frame that must not count.
    feedFrames(engine, 118_100_000, hotBins(), 1)
    feedFrames(engine, 999_000_000, hotBins(), 1)
    await vi.advanceTimersByTimeAsync(250)
    expect(engine.scanLocked.value).toBe(false) // still waiting, rechecking
    feedFrames(engine, 118_100_000, hotBins(), 2)
    await vi.advanceTimersByTimeAsync(80)
    expect(engine.scanLocked.value).toBe(true)
    expect(tuneToFreq).toHaveBeenCalledTimes(1)
  })
})
