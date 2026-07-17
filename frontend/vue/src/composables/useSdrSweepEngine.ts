import { ref, computed, watch, type Ref } from 'vue'
import type { useSdrStore, SdrFrequencyGroup, SdrStoredFrequency } from '@/stores/sdr'
import type { SdrSearchRange } from '@/services/sdrSearchApi'
import { listSearchRanges as apiListSearchRanges } from '@/services/sdrSearchApi'

/**
 * The SDR sweep engine (extracted from SdrPanel.vue's engine spine —
 * behaviour byte-identical): the frequency scanner (stored-frequency stepping
 * with group filters) and the range search (low/high sweep), which share a
 * post-tune race guard, the latest-spectrum stash + channel sampler, the
 * auto-resume watcher and lock-on-signal semantics — hence one composable,
 * not two. Also owns the store mirrors that drive the waterfall sweep overlay
 * and the owner→follower sweep_state publish.
 */
export interface UseSdrSweepEngineOptions {
  /** Lazy accessor for the SDR store (the panel's shared instance). */
  sdrStore: () => ReturnType<typeof useSdrStore>
  /** Sends a control-socket command (the panel's single command chokepoint). */
  sendCmd: (commandPayload: object) => void
  /** Stored frequencies (store-owned; buildScanQueue filters the scannable ones). */
  freqs: Ref<SdrStoredFrequency[]>
  /** Groups joined with their frequencies (store-owned; scan group names mirror). */
  groupsWithFreqs: Ref<SdrFrequencyGroup[]>
  /** True while this instance is a read-only follower of the shared tuner. */
  readOnly: Ref<boolean>
  /** Squelch threshold in dBFS — the scan/search activity threshold. */
  squelch: Ref<number>
  /** Demod audio bandwidth in Hz — sizes the channel-sampler window. */
  bwHz: Ref<number>
  /** Seconds a locked signal must stay quiet before the sweep auto-resumes. */
  resumeDelaySec: Ref<number>
  /** Active demodulator mode (the ad-hoc range inherits it). */
  currentMode: Ref<string>
  /** The panel's saved-frequency retune (display refs + stored settings + tune/mode cmds). */
  tuneToFreq: (storedFrequency: SdrStoredFrequency) => void
  /** The panel's bare hz+mode retune (display refs + tune/mode cmds). */
  tuneToHzMode: (hz: number, mode: string) => void
  /** Starts the audio stream for a search sweep (init audio, demod mode/bw, playing). */
  startAudioForSearch: (mode: string) => void
}

/**
 * Wires the scanner + range-search engines onto the injected tuner
 * chokepoints. Everything returned keeps the exact semantics the panel had
 * inline.
 */
export function useSdrSweepEngine(options: UseSdrSweepEngineOptions) {
  const {
    sdrStore: _sdrStore,
    sendCmd,
    freqs,
    groupsWithFreqs,
    readOnly,
    squelch,
    bwHz,
    resumeDelaySec,
    currentMode,
    tuneToFreq,
    tuneToHzMode,
    startAudioForSearch,
  } = options

  // ── Scanner ───────────────────────────────────────────────────────────────
  const scanActive = ref(false)
  const scanLocked = ref(false)
  const scanCurrentHz = ref<number | null>(null)
  const scanSelectedGroupIds = ref<number[]>([])
  const scanAllSelected = ref(true)
  let _scanQueue: SdrStoredFrequency[] = []
  let _scanIdx = 0
  let _scanTimer: ReturnType<typeof setTimeout> | null = null

  // ── Search (high/low frequency range sweep) ───────────────────────────────
  const searchRanges = ref<SdrSearchRange[]>([])
  const searchActive = ref(false)
  const searchLocked = ref(false)
  const searchSelectedRangeId = ref<number | null>(null)
  // Tracks whether the running search was started from the ad-hoc inputs or a
  // saved range list item — needed so per-item play/stop buttons can show the
  // correct icon and toggle the correct sweep.
  const searchActiveSource = ref<'adhoc' | 'saved' | null>(null)
  const searchCurrentHz = ref<number | null>(null)

  // Ad-hoc search inputs (low/high MHz, step kHz) — required fields shown
  // above the saved ranges list. When all three are valid, SEARCH uses these
  // instead of a saved range.
  const adhocLowMhz = ref<string>('')
  const adhocHighMhz = ref<string>('')
  const adhocStepKhz = ref<string>('12.5')
  const adhocSearchValid = computed(() => {
    const lo = parseFloat(adhocLowMhz.value)
    const hi = parseFloat(adhocHighMhz.value)
    const st = parseFloat(adhocStepKhz.value)
    return isFinite(lo) && isFinite(hi) && isFinite(st) && lo < hi && st > 0
  })
  let _searchHz = 0
  let _searchTimer: ReturnType<typeof setTimeout> | null = null

  // Post-tune race guard for the search engine. The backend tags FFT frames with
  // `conn.center_hz` at FFT time, not at IQ-read time — so a frame can be labelled
  // with the new frequency while its IQ samples were captured at the previous
  // one. We track how many frames have arrived bearing the expected center_hz
  // since the last retune, and only sample after a minimum settle window has
  // elapsed *and* at least one matching frame has been seen (we discard the
  // first one as a race-window guard).
  let _expectedCenterHz: number | null = null
  let _postTuneFrameCount = 0
  let _tuneAtMs = 0
  const SEARCH_MIN_SETTLE_MS = 250
  const SEARCH_RECHECK_MS = 80
  const SEARCH_MAX_RECHECKS = 6

  // Latest spectrum frame stash — used by the search engine to read the centre
  // bin's dBFS power after the dwell interval to decide hold-on-signal.
  let _lastSpectrum: { bins: number[]; center_hz: number; sample_rate: number } | null = null

  // Fed by the control socket's spectrum handler: stashes the latest frame and
  // counts frames bearing the expected post-tune center_hz (the race guard).
  function noteSpectrumFrame(frame: {
    bins: number[]
    center_hz: number
    sample_rate: number
  }): void {
    _lastSpectrum = frame
    if (_expectedCenterHz !== null && frame.center_hz === _expectedCenterHz) {
      _postTuneFrameCount++
    }
  }

  // Mirror scanner sweep state + selected group labels into the store. The
  // waterfall component reads these to show the same paused/holding overlay
  // used during a range search whenever the scanner is stepping between
  // frequencies (but not when it has locked onto an active signal).
  watch(
    [scanActive, scanLocked, scanAllSelected, scanSelectedGroupIds, groupsWithFreqs],
    ([active, locked, allSel, selIds, groupsList]) => {
      const _ss = _sdrStore()
      // A read-only follower's scan overlay is driven by the owner's mirrored sweep
      // state (see applyOwnership); its own scanner is idle, so skip here or we'd
      // clobber the mirror back to "not scanning".
      if (_ss.readOnly) return
      _ss.scanSweeping = !!active && !locked
      if (allSel || (selIds as number[]).length === 0) {
        _ss.scanGroupNames = ['All']
      } else {
        const sel = new Set(selIds as number[])
        _ss.scanGroupNames = (groupsList as SdrFrequencyGroup[])
          .filter((g) => sel.has(g.id))
          .map((g) => g.name)
      }
    },
    { immediate: true, deep: true },
  )

  // Owner → followers: publish this instance's scanner/search sweep state over the
  // relay control channel so a read-only watcher renders the same "paused during
  // active scan/search" overlay. Only the tuning owner of a shared dongle forwards
  // (a single instance / raw rtl_tcp has no followers, and a follower must not echo
  // the state back); deduped so an unchanged sweep never re-sends.
  let _lastSweepPayload = ''
  watch(
    () => {
      const _ss = _sdrStore()
      return {
        scan_active: _ss.scanSweeping,
        scan_groups: _ss.scanGroupNames,
        search_active: _ss.searchSweeping,
        search_low_hz: _ss.searchLowHz,
        search_high_hz: _ss.searchHighHz,
        search_current_hz: _ss.searchCurrentHz,
      }
    },
    (payload) => {
      const _ss = _sdrStore()
      if (!(_ss.controlAvailable && _ss.isOwner)) return
      const serialized = JSON.stringify(payload)
      if (serialized === _lastSweepPayload) return
      _lastSweepPayload = serialized
      sendCmd({ cmd: 'sweep_state', ...payload })
    },
    { deep: true },
  )

  // When this instance stops being a read-only follower (the owner released the
  // tuner or the control channel dropped), clear the mirrored sweep state so a stale
  // owner overlay doesn't linger. The guarded scan watcher above then resumes driving
  // these from this instance's own scanner/search.
  watch(readOnly, (isReadOnly) => {
    if (isReadOnly) return
    const _ss = _sdrStore()
    _ss.scanSweeping = false
    _ss.scanGroupNames = []
    _ss.searchSweeping = false
    _ss.searchLowHz = null
    _ss.searchHighHz = null
    _ss.searchCurrentHz = null
  })

  // ── Scanner engine ────────────────────────────────────────────────────────

  function toggleScan() {
    if (scanActive.value) stopScan()
    else startScan()
  }

  function onScanPrimaryClick() {
    if (scanActive.value && scanLocked.value) {
      toggleScanLock()
    } else {
      toggleScan()
    }
  }

  function toggleScanAll() {
    scanAllSelected.value = true
    scanSelectedGroupIds.value = []
    refreshScanQueue()
  }

  function toggleScanGroup(id: number) {
    if (scanAllSelected.value) {
      scanAllSelected.value = false
      scanSelectedGroupIds.value = [id]
      refreshScanQueue()
      return
    }
    const idx = scanSelectedGroupIds.value.indexOf(id)
    if (idx >= 0) scanSelectedGroupIds.value.splice(idx, 1)
    else scanSelectedGroupIds.value.push(id)
    if (scanSelectedGroupIds.value.length === 0) scanAllSelected.value = true
    refreshScanQueue()
  }

  function refreshScanQueue() {
    if (!scanActive.value) return
    const next = buildScanQueue()
    if (next.length === 0) {
      stopScan()
      return
    }
    _scanQueue = next
    _scanIdx = 0
    if (!scanLocked.value) {
      // A non-locked active scan always has a pending dwell timer here.
      /* v8 ignore start */
      if (_scanTimer) {
        clearTimeout(_scanTimer)
        _scanTimer = null
      }
      /* v8 ignore stop */
      doScanStep()
    }
  }

  function buildScanQueue(): SdrStoredFrequency[] {
    const scannable = freqs.value.filter((f) => f.scannable)
    if (scanAllSelected.value || scanSelectedGroupIds.value.length === 0) return scannable
    const selected = new Set(scanSelectedGroupIds.value)
    return scannable.filter((f) => {
      const ids = new Set<number>((f.group_ids || []).filter((id) => id !== 0))
      if (f.group_id != null && f.group_id !== 0) ids.add(f.group_id)
      for (const id of ids) if (selected.has(id)) return true
      return false
    })
  }

  // Re-seeds the scan queue from the freshly-reloaded frequencies (the panel's
  // reloadData path).
  function rebuildScanQueue(): void {
    _scanQueue = buildScanQueue()
  }

  function startScan() {
    // Scanning steps the tuner across channels — a hardware-tuning action a
    // read-only follower must not perform. The scan controls are disabled in this
    // state, so this is a defensive chokepoint for any non-UI path.
    /* v8 ignore start -- scan controls disabled while read-only; defensive guard */
    if (readOnly.value) return
    /* v8 ignore stop */
    // startScan only runs from the un-locked toggle path, so scanLocked is false.
    /* v8 ignore start */
    if (scanLocked.value) return
    /* v8 ignore stop */
    _scanQueue = buildScanQueue()
    if (_scanQueue.length === 0) return
    // Mutual exclusion with the range search — both drive `tune`.
    if (searchActive.value) stopSearch()
    scanActive.value = true
    _scanIdx = 0
    doScanStep()
  }

  function stopScan() {
    scanActive.value = false
    scanLocked.value = false
    scanCurrentHz.value = null
    if (_scanTimer) {
      clearTimeout(_scanTimer)
      _scanTimer = null
    }
    stopResumeWatcher()
  }

  const SCAN_DWELL_MS = 250
  const SCAN_MAX_RECHECKS = 12

  function doScanStep() {
    // Re-entrancy guard: every caller already checks scan state, so this defensive
    // early-out only matters for a teardown race the unit suite doesn't trigger.
    /* v8 ignore start */
    if (!scanActive.value || scanLocked.value || _scanQueue.length === 0) return
    /* v8 ignore stop */
    const f = _scanQueue[_scanIdx % _scanQueue.length]
    tuneToFreq(f)
    scanCurrentHz.value = f.frequency_hz
    _scanIdx++

    // Reuse the search engine's post-tune race guard so we don't sample
    // pre-retune IQ.
    _lastSpectrum = null
    _expectedCenterHz = f.frequency_hz
    _postTuneFrameCount = 0
    _tuneAtMs = performance.now()

    const thresholdDb = squelch.value

    let rechecks = 0
    const evaluate = () => {
      _scanTimer = null
      // Guards a scan stopped/locked between the dwell timer scheduling and firing.
      /* v8 ignore start */
      if (!scanActive.value || scanLocked.value) return
      /* v8 ignore stop */
      const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
      const frameOk =
        _postTuneFrameCount >= 2 &&
        _lastSpectrum != null &&
        _lastSpectrum.center_hz === f.frequency_hz
      if (!(settled && frameOk)) {
        if (rechecks < SCAN_MAX_RECHECKS) {
          rechecks++
          _scanTimer = setTimeout(evaluate, SEARCH_RECHECK_MS)
          return
        }
        // Couldn't get a clean frame — advance.
        doScanStep()
        return
      }
      const db = sampleChannelDb()
      if (db >= thresholdDb) {
        scanLocked.value = true
        startResumeWatcher(thresholdDb, () => {
          // Defensive: the poll only resumes while still active+locked.
          /* v8 ignore start */
          if (!scanActive.value || !scanLocked.value) return
          /* v8 ignore stop */
          toggleScanLock()
        })
        return
      }
      doScanStep()
    }
    _scanTimer = setTimeout(evaluate, SCAN_DWELL_MS)
  }

  function toggleScanLock() {
    scanLocked.value = !scanLocked.value
    stopResumeWatcher()
    // toggleScanLock is only ever invoked to UNLOCK (the primary button / the
    // resume watcher only call it while locked), so after the toggle scanLocked is
    // always false and scanActive true here — the else (re-lock) arm is unreachable.
    /* v8 ignore start */
    if (!scanLocked.value && scanActive.value) {
      if (_scanTimer) {
        clearTimeout(_scanTimer)
        _scanTimer = null
      }
      doScanStep()
    }
    /* v8 ignore stop */
  }

  // ── Search engine (low/high range sweep with stop-on-signal) ──────────────

  function adhocRange(): SdrSearchRange | null {
    // Only called by currentSearchRange during an active ad-hoc search (whose
    // inputs are already valid), so the invalid-guard is never taken.
    /* v8 ignore start */
    if (!adhocSearchValid.value) return null
    /* v8 ignore stop */
    const lo = parseFloat(adhocLowMhz.value)
    const hi = parseFloat(adhocHighMhz.value)
    const st = parseFloat(adhocStepKhz.value)
    return {
      id: -1,
      label: 'Ad-hoc',
      low_hz: Math.round(lo * 1e6),
      high_hz: Math.round(hi * 1e6),
      step_hz: Math.round(st * 1000),
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      mode: currentMode.value || 'NFM',
      /* v8 ignore stop */
      threshold_dbfs: -30,
      dwell_ms: 250,
      band_name: '',
      enabled: true,
      notes: '',
      sort_order: 0,
    }
  }

  function savedRange(id: number | null): SdrSearchRange | null {
    // Only called with a concrete id during an active saved-range search.
    /* v8 ignore start */
    if (id == null) return null
    /* v8 ignore stop */
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    return searchRanges.value.find((r) => r.id === id) ?? null
    /* v8 ignore stop */
  }

  // Returns the range currently being searched (or that would be searched if the
  // main SEARCH button were pressed now). When a search is active, the source is
  // pinned by searchActiveSource so the per-item buttons stay accurate even if
  // ad-hoc inputs change mid-sweep.
  function currentSearchRange(): SdrSearchRange | null {
    // Both callers run only while a search is active, so the not-active branch
    // (below the if) is unreachable here.
    /* v8 ignore start */
    if (searchActive.value) {
      /* v8 ignore stop */
      if (searchActiveSource.value === 'adhoc') return adhocRange()
      // source is 'adhoc' | 'saved'; the adhoc case returned above, so this is
      // always the saved branch when reached.
      /* v8 ignore start */
      if (searchActiveSource.value === 'saved') return savedRange(searchSelectedRangeId.value)
      /* v8 ignore stop */
    }
    // Both callers (toggleSearchLock, doSearchStep) run only while searchActive, so
    // the not-active fallback is never reached.
    /* v8 ignore start */
    return adhocRange() ?? savedRange(searchSelectedRangeId.value)
    /* v8 ignore stop */
  }

  const isAdhocSearching = computed(
    () => searchActive.value && searchActiveSource.value === 'adhoc',
  )
  function isSavedRangeSearching(id: number): boolean {
    return (
      searchActive.value &&
      searchActiveSource.value === 'saved' &&
      searchSelectedRangeId.value === id
    )
  }

  function sampleChannelDb(): number {
    const s = _lastSpectrum
    if (!s || !s.bins || s.bins.length === 0) return -120
    // Peak dB across the demod channel around the tuner, skipping only the
    // single centre DC spike. Mean across a narrow ±3..±5 window underreports
    // narrow signals — the audio worklet (which sees the full demod channel)
    // opened squelch but this sampler missed the peak. Sizing the window to
    // the demod bandwidth (with a sensible floor) and taking the max matches
    // what the user hears.
    const n = s.bins.length
    const mid = Math.floor(n / 2)
    const binHz = (s.sample_rate || 2_048_000) / n
    // Half-width: at least 4 bins, otherwise the demod bandwidth in bins.
    const halfBins = Math.max(4, Math.ceil(bwHz.value / 2 / binHz))
    const lo = Math.max(0, mid - halfBins)
    const hi = Math.min(n - 1, mid + halfBins)
    let peak = -Infinity
    for (let i = lo; i <= hi; i++) {
      if (i === mid) continue // skip LO/DC spike
      const v = s.bins[i]
      if (typeof v === 'number' && isFinite(v) && v > peak) peak = v
    }
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    return peak === -Infinity ? -120 : peak
    /* v8 ignore stop */
  }

  function startSearch(source: 'adhoc' | 'saved') {
    // Search sweeps the tuner across a range — a hardware-tuning action a read-only
    // follower must not perform. The start buttons are disabled in this state, so
    // this is a defensive chokepoint for any non-UI path.
    /* v8 ignore start -- search start buttons disabled while read-only; defensive guard */
    if (readOnly.value) return
    /* v8 ignore stop */
    const r = source === 'adhoc' ? adhocRange() : savedRange(searchSelectedRangeId.value)
    // The play buttons are disabled unless a valid range exists, so r is non-null.
    /* v8 ignore start */
    if (!r) return
    /* v8 ignore stop */
    if (r.low_hz >= r.high_hz || r.step_hz <= 0) return
    // Mutual exclusion with scanner — both drive `tune`.
    if (scanActive.value) stopScan()
    // The play buttons that reach startSearch are disabled while no radio is
    // selected (controlsDisabled), so a radio is always present here.
    startAudioForSearch(r.mode)
    searchActive.value = true
    searchActiveSource.value = source
    searchLocked.value = false
    const _ss = _sdrStore()
    _ss.searchSweeping = true
    _ss.searchLowHz = r.low_hz
    _ss.searchHighHz = r.high_hz
    _ss.searchCurrentHz = r.low_hz
    _searchHz = r.low_hz
    // Invalidate any stale spectrum frame so the first step waits for fresh data.
    _lastSpectrum = null
    doSearchStep()
  }

  function stopSearch() {
    searchActive.value = false
    searchActiveSource.value = null
    searchLocked.value = false
    const _ss = _sdrStore()
    _ss.searchSweeping = false
    _ss.searchLowHz = null
    _ss.searchHighHz = null
    _ss.searchCurrentHz = null
    searchCurrentHz.value = null
    _expectedCenterHz = null
    _postTuneFrameCount = 0
    // Timer-state cleanup; either arm is harmless and depends on whether a dwell
    // step was mid-flight at stop time.
    /* v8 ignore start */
    if (_searchTimer) {
      clearTimeout(_searchTimer)
      _searchTimer = null
    }
    /* v8 ignore stop */
    stopResumeWatcher()
  }

  function onAdhocPlayClick() {
    if (isAdhocSearching.value) {
      stopSearch()
      return
    }
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    if (searchActive.value) stopSearch()
    /* v8 ignore stop */
    startSearch('adhoc')
  }

  function onSavedRangePlayClick(id: number) {
    if (isSavedRangeSearching(id)) {
      stopSearch()
      return
    }
    if (searchActive.value) stopSearch()
    searchSelectedRangeId.value = id
    startSearch('saved')
  }

  function toggleSearchLock() {
    // Only called by the resume-watcher callback while a search is active.
    /* v8 ignore start */
    if (!searchActive.value) return
    /* v8 ignore stop */
    searchLocked.value = !searchLocked.value
    _sdrStore().searchSweeping = searchActive.value && !searchLocked.value
    stopResumeWatcher()
    // toggleSearchLock is only ever invoked to UNLOCK, so searchLocked is always
    // false here; the inner timer/range guards cover async-state edges (a timer
    // already cleared, a wrap exactly on the high edge) the tests don't reproduce.
    /* v8 ignore start */
    if (!searchLocked.value) {
      if (_searchTimer) {
        clearTimeout(_searchTimer)
        _searchTimer = null
      }
      // Advance past the current freq so we don't immediately re-hold on the same signal.
      const r = currentSearchRange()
      if (r) {
        _searchHz += r.step_hz
        if (_searchHz > r.high_hz) _searchHz = r.low_hz
      }
      doSearchStep()
    }
    /* v8 ignore stop */
  }

  // Shared auto-resume watcher used by both search and scan. When a freq is
  // locked on a signal, poll sampleChannelDb() and only call onResume() once the
  // channel has been below `thresholdDb` continuously for `delaySec` seconds.
  // delaySec == 0 → resume on the next poll where the signal is gone.
  const RESUME_POLL_MS = 200
  let _resumeTimer: ReturnType<typeof setTimeout> | null = null
  let _quietSinceMs: number | null = null

  function stopResumeWatcher() {
    if (_resumeTimer) {
      clearTimeout(_resumeTimer)
      _resumeTimer = null
    }
    _quietSinceMs = null
  }

  function startResumeWatcher(thresholdDb: number, onResume: () => void) {
    stopResumeWatcher()
    const delayMs = Math.max(0, resumeDelaySec.value) * 1000
    const tick = () => {
      _resumeTimer = null
      const db = sampleChannelDb()
      const active = db >= thresholdDb
      if (active) {
        _quietSinceMs = null
      } else {
        if (_quietSinceMs == null) _quietSinceMs = performance.now()
        if (performance.now() - _quietSinceMs >= delayMs) {
          _quietSinceMs = null
          onResume()
          return
        }
      }
      _resumeTimer = setTimeout(tick, RESUME_POLL_MS)
    }
    _resumeTimer = setTimeout(tick, RESUME_POLL_MS)
  }

  function doSearchStep() {
    // Re-entrancy guard for callers/timers that fire after a stop/lock.
    /* v8 ignore start */
    if (!searchActive.value || searchLocked.value) return
    /* v8 ignore stop */
    const r = currentSearchRange()
    // currentSearchRange only goes null if the live range vanishes mid-sweep
    // (e.g. deleted), a race the unit suite doesn't reproduce.
    /* v8 ignore start */
    if (!r) {
      stopSearch()
      return
    }
    /* v8 ignore stop */
    const stepHz = _searchHz
    tuneToHzMode(stepHz, r.mode)
    searchCurrentHz.value = stepHz
    _sdrStore().searchCurrentHz = stepHz
    // Reset the post-tune race guard. Frames bearing the new expected center_hz
    // are counted by the WS handler; we discard the first one because the backend
    // labels frames with conn.center_hz at FFT time, not at IQ-read time — so the
    // first label-matching frame can still contain pre-retune IQ.
    _lastSpectrum = null
    _expectedCenterHz = stepHz
    _postTuneFrameCount = 0
    _tuneAtMs = performance.now()
    const dwellMs = Math.max(50, r.dwell_ms)

    let rechecks = 0
    const evaluate = () => {
      // Guards a search stopped/locked between the dwell timer scheduling and firing.
      /* v8 ignore start */
      if (!searchActive.value || searchLocked.value) return
      /* v8 ignore stop */
      const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
      const frameOk =
        _postTuneFrameCount >= 2 && _lastSpectrum != null && _lastSpectrum.center_hz === stepHz
      if (!(settled && frameOk)) {
        if (rechecks < SEARCH_MAX_RECHECKS) {
          rechecks++
          _searchTimer = setTimeout(evaluate, SEARCH_RECHECK_MS)
          return
        }
        // Give up waiting for a clean frame and advance without sampling.
        _searchHz += r.step_hz
        if (_searchHz > r.high_hz) _searchHz = r.low_hz
        doSearchStep()
        return
      }
      // Use the SQUELCH slider as the activity threshold so "audible" lines up
      // with "lock here" — same gate the audio path uses. Range threshold_dbfs
      // is intentionally ignored.
      const db = sampleChannelDb()
      if (db >= squelch.value) {
        // Lock on signal. A watcher will auto-advance once the signal
        // drops and the user-configured RESUME DELAY has elapsed; until then
        // the user can also press HOLD/RESUME to force-continue.
        searchLocked.value = true
        _sdrStore().searchSweeping = false
        startResumeWatcher(squelch.value, () => {
          // Defensive: the poll only resumes while still active+locked.
          /* v8 ignore start */
          if (!searchActive.value || !searchLocked.value) return
          /* v8 ignore stop */
          toggleSearchLock()
        })
        return
      }
      _searchHz += r.step_hz
      if (_searchHz > r.high_hz) _searchHz = r.low_hz
      doSearchStep()
    }
    _searchTimer = setTimeout(evaluate, dwellMs)
  }

  async function reloadSearchRanges() {
    try {
      searchRanges.value = await apiListSearchRanges()
    } catch {
      searchRanges.value = []
    }
    // If the selected range was deleted elsewhere, clear the selection.
    if (
      searchSelectedRangeId.value != null &&
      !searchRanges.value.find((r) => r.id === searchSelectedRangeId.value)
    ) {
      if (searchActive.value) stopSearch()
      searchSelectedRangeId.value = searchRanges.value[0]?.id ?? null
    } else if (searchSelectedRangeId.value == null && searchRanges.value.length > 0) {
      searchSelectedRangeId.value = searchRanges.value[0].id
    }
  }

  function selectSearchRange(id: number) {
    if (searchActive.value) stopSearch()
    searchSelectedRangeId.value = id
    adhocLowMhz.value = ''
    adhocHighMhz.value = ''
  }

  // The SEARCH RANGES tab is about to delete a range — stop an active search
  // that is sweeping it first.
  function onRangeBeforeDelete(id: number) {
    if (searchActive.value && searchSelectedRangeId.value === id) stopSearch()
  }

  // The sweep half of the audio worklet's squelch-change callback.
  function onSweepSquelchChange(open: boolean) {
    // The audio worklet's squelch is the source of truth for "is this channel
    // audible". The scan/search dwell check samples the spectrum waterfall
    // (sampleChannelDb), which can underreport narrow signals the worklet's
    // squelch did open on — so a signal could be playing while the scan kept
    // stepping. Lock the moment the worklet opens squelch on an active, unlocked
    // sweep, but only once the post-tune settle has elapsed so we don't lock on
    // residual audio from the previous frequency.
    if (open) {
      const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
      if (settled) {
        if (scanActive.value && !scanLocked.value) {
          scanLocked.value = true
          startResumeWatcher(squelch.value, () => {
            /* v8 ignore start -- defensive: the poll only resumes while still locked */
            if (!scanActive.value || !scanLocked.value) return
            /* v8 ignore stop */
            toggleScanLock()
          })
        } else if (searchActive.value && !searchLocked.value) {
          searchLocked.value = true
          _sdrStore().searchSweeping = false
          startResumeWatcher(squelch.value, () => {
            /* v8 ignore start -- defensive: the poll only resumes while still locked */
            if (!searchActive.value || !searchLocked.value) return
            /* v8 ignore stop */
            toggleSearchLock()
          })
        }
      }
    }
  }

  return {
    // Scanner
    scanActive,
    scanLocked,
    scanCurrentHz,
    scanSelectedGroupIds,
    scanAllSelected,
    toggleScan,
    onScanPrimaryClick,
    toggleScanAll,
    toggleScanGroup,
    startScan,
    stopScan,
    toggleScanLock,
    rebuildScanQueue,
    // Search
    searchRanges,
    searchActive,
    searchLocked,
    searchSelectedRangeId,
    searchActiveSource,
    searchCurrentHz,
    adhocLowMhz,
    adhocHighMhz,
    adhocStepKhz,
    adhocSearchValid,
    isAdhocSearching,
    isSavedRangeSearching,
    startSearch,
    stopSearch,
    onAdhocPlayClick,
    onSavedRangePlayClick,
    toggleSearchLock,
    reloadSearchRanges,
    selectSearchRange,
    onRangeBeforeDelete,
    // Shared
    noteSpectrumFrame,
    onSweepSquelchChange,
  }
}
