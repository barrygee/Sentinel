import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { SatellitePassScheduler, type SatellitePassSchedulerCtx } from './SatellitePassScheduler'
import { useNotificationsStore } from '@/stores/notifications'

const HEADS_UP_LEAD_MS = 5 * 60 * 1000
const REFRESH_MS = 5 * 60 * 1000
const T0 = 1_700_000_000_000

interface IssPass {
  aos_utc: string
  los_utc: string
  aos_unix_ms: number
  los_unix_ms: number
  duration_s: number
  max_elevation_deg: number
  max_el_utc: string
}

// Build an ISS-style pass with AOS/LOS relative to T0.
function makePass(aosOffsetMs: number, losOffsetMs: number, maxEl = 42): IssPass {
  const aos = T0 + aosOffsetMs
  const los = T0 + losOffsetMs
  return {
    aos_utc: new Date(aos).toISOString(),
    los_utc: new Date(los).toISOString(),
    aos_unix_ms: aos,
    los_unix_ms: los,
    duration_s: Math.round((los - aos) / 1000),
    max_elevation_deg: maxEl,
    max_el_utc: new Date((aos + los) / 2).toISOString(),
  }
}

let notificationsStore: ReturnType<typeof useNotificationsStore>
let userLocation: [number, number] | null
let downlink: { hz: number; mode: string } | null
let flags: { headsUp: boolean; autoTune: boolean; record: boolean }
let fetchResponse: { ok: boolean; body: unknown }
let fetchSpy: ReturnType<typeof vi.fn>
let tuneEvents: CustomEvent[]
let restoreEvents: CustomEvent[]

function onTune(event: Event): void {
  tuneEvents.push(event as CustomEvent)
}
function onRestore(event: Event): void {
  restoreEvents.push(event as CustomEvent)
}

function makeCtx(overrides: Partial<SatellitePassSchedulerCtx> = {}): SatellitePassSchedulerCtx {
  return {
    noradId: '25544',
    notificationsStore,
    getUserLocation: () => userLocation,
    getName: () => 'ISS (ZARYA)',
    headsUpEnabled: () => flags.headsUp,
    autoTuneEnabled: () => flags.autoTune,
    recordOnPass: () => flags.record,
    getDownlink: () => downlink,
    ...overrides,
  }
}

// Start the scheduler and flush the fetch microtask + any zero-delay timers so
// the first schedule has run before assertions.
async function startAndFlush(scheduler: SatellitePassScheduler): Promise<void> {
  scheduler.start()
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  setActivePinia(createPinia())
  notificationsStore = useNotificationsStore()
  userLocation = [10, 20]
  downlink = { hz: 145_800_000, mode: 'FM' }
  flags = { headsUp: true, autoTune: true, record: false }
  fetchResponse = { ok: true, body: { passes: [] } }
  tuneEvents = []
  restoreEvents = []
  document.addEventListener('sentinel:sdr-tune-external', onTune)
  document.addEventListener('sentinel:sdr-tune-restore', onRestore)
  fetchSpy = vi.fn(() =>
    Promise.resolve({
      ok: fetchResponse.ok,
      json: () => Promise.resolve(fetchResponse.body),
    } as unknown as Response),
  )
  vi.stubGlobal('fetch', fetchSpy)
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  document.removeEventListener('sentinel:sdr-tune-external', onTune)
  document.removeEventListener('sentinel:sdr-tune-restore', onRestore)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('SatellitePassScheduler._fetchAndSchedule endpoint + guards', () => {
  it('does not fetch when there is no user location', async () => {
    userLocation = null
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(fetchSpy).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it('uses the dedicated ISS passes endpoint for norad 25544', async () => {
    userLocation = [12, 34]
    const scheduler = new SatellitePassScheduler(makeCtx({ noradId: '25544' }))
    await startAndFlush(scheduler)
    expect(fetchSpy).toHaveBeenCalledWith('/api/space/iss/passes?lat=34&lon=12&hours=24')
    scheduler.stop()
  })

  it('uses the generic satellite endpoint for other norad ids', async () => {
    userLocation = [12, 34]
    const scheduler = new SatellitePassScheduler(makeCtx({ noradId: '99999' }))
    await startAndFlush(scheduler)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/space/satellite/99999/passes?lat=34&lon=12&hours=24',
    )
    scheduler.stop()
  })

  it('ignores a non-ok response', async () => {
    fetchResponse = { ok: false, body: { passes: [makePass(-1000, 600000)] } }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    // Nothing was stored, so a refire is a no-op (no tune dispatched).
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })

  it('ignores a payload carrying an error field', async () => {
    fetchResponse = { ok: true, body: { error: 'no TLE', passes: [makePass(-1000, 600000)] } }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })

  it('ignores a payload with no passes array', async () => {
    fetchResponse = { ok: true, body: { obs_lat: 0 } }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })

  it('swallows a fetch network error', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')))
    const scheduler = new SatellitePassScheduler(makeCtx())
    await expect(startAndFlush(scheduler)).resolves.toBeUndefined()
    scheduler.stop()
  })

  it('aborts after the fetch when the scheduler has been stopped meanwhile', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    fetchSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    const scheduler = new SatellitePassScheduler(makeCtx())
    scheduler.start()
    scheduler.stop() // sets _stopped before the response arrives
    resolveFetch({ ok: true, json: () => Promise.resolve({ passes: [makePass(-1000, 600000)] }) })
    await vi.advanceTimersByTimeAsync(0)
    // The stopped guard prevented storing/scheduling.
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
  })

  it('re-fetches on the 5-minute refresh interval', async () => {
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(REFRESH_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('clears the previous refresh interval when start is called again', async () => {
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    // Re-starting must not leave a second interval running.
    await startAndFlush(scheduler)
    fetchSpy.mockClear()
    await vi.advanceTimersByTimeAsync(REFRESH_MS)
    // Exactly one refresh fired (a single live interval), not two.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('schedules the next pass via the timeout path when its fire-point is in the future', async () => {
    // Two passes both >5 min out so each takes the setTimeout path. After the
    // first fires, the second must be scheduled (the recursive timeout branch).
    fetchResponse = {
      ok: true,
      body: { passes: [makePass(360_000, 600_000), makePass(960_000, 1_200_000)] },
    }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    // First pass heads-up fires at its fire-point (AOS − 5 min = +60s).
    await vi.advanceTimersByTimeAsync(60_000)
    expect(notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS')).toHaveLength(1)
    // Second pass heads-up fires at its fire-point (AOS − 5 min = +11 min).
    await vi.advanceTimersByTimeAsync(660_000 - 60_000)
    expect(
      notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS').length,
    ).toBeGreaterThanOrEqual(2)
    scheduler.stop()
  })
})

describe('SatellitePassScheduler heads-up track', () => {
  it('fires a heads-up notification HEADS_UP_LEAD_MS before AOS', async () => {
    // AOS 10 min out; fire-point is 5 min out.
    fetchResponse = { ok: true, body: { passes: [makePass(600_000, 1_200_000, 55)] } }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)

    expect(notificationsStore.items).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(600_000 - HEADS_UP_LEAD_MS)

    const alert = notificationsStore.items.find((i) => i.title === 'ISS (ZARYA) PASS')
    expect(alert).toBeDefined()
    expect(alert!.detail).toContain('AOS ~5 min')
    expect(alert!.detail).toContain('55°')
    scheduler.stop()
  })

  it('does not fire the heads-up when the bell is off, but still advances the guard', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(600_000, 1_200_000)] } }
    flags = { headsUp: false, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(notificationsStore.items).toHaveLength(0)
    scheduler.stop()
  })

  it('fires immediately for a pass whose fire-point is already past but AOS is still ahead', async () => {
    // AOS in 30s (< the 5-min lead) so the fire-point is already behind us, yet a
    // heads-up is still useful because AOS has not arrived.
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(notificationsStore.items.some((i) => i.title === 'ISS (ZARYA) PASS')).toBe(true)
    scheduler.stop()
  })

  it('handles (without infinite recursion) a pass 1–5 min out whose fire-point is past', async () => {
    // Regression: AOS in 2 min, inside the (now+60s, now+lead) window. The
    // heads-up fire-point (AOS − 5 min) is behind us but AOS is still ahead, so
    // the delay<=0 path runs. It must fire once and terminate — previously this
    // re-selected the same pass forever (a now+60s-relative remaining filter).
    fetchResponse = { ok: true, body: { passes: [makePass(120_000, 720_000)] } }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS')).toHaveLength(1)
    scheduler.stop()
  })

  it('recurses to the next pass (advancing, not looping) from the delay<=0 path', async () => {
    // Two sequential passes both inside the lead window, so the FIRST is handled
    // via the delay<=0 branch and its `remaining` recursion processes the SECOND.
    // The recursion must advance past pass1 and terminate; both passes get a
    // heads-up (per-pass alerting). Before the fix this re-selected pass1 forever
    // and blew the stack.
    fetchResponse = {
      ok: true,
      body: { passes: [makePass(60_000, 180_000), makePass(240_000, 360_000)] },
    }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS')).toHaveLength(2)
    scheduler.stop()
  })

  it('alerts for every distinct pass even when a later fire-point falls inside the earlier pass window', async () => {
    // pass1: AOS +6 min, LOS +8 min → heads-up fires at +1 min.
    // pass2: AOS +9 min, LOS +11 min → heads-up fires at +4 min, which is BEFORE
    // pass1's LOS (+8 min). The old global "fired-through-LOS" mark swallowed
    // pass2's alert; per-pass dedup must let it through. Both fire-points land
    // before the +5 min refresh, so no re-fetch perturbs the count.
    fetchResponse = {
      ok: true,
      body: { passes: [makePass(360_000, 480_000), makePass(540_000, 660_000)] },
    }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(60_000) // pass1 fire-point
    expect(notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(180_000) // pass2 fire-point (+4 min total)
    expect(notificationsStore.items.filter((i) => i.title === 'ISS (ZARYA) PASS')).toHaveLength(2)
    scheduler.stop()
  })

  it('does not fire a stale heads-up once AOS has already passed', async () => {
    // Pass is overhead now (AOS behind, LOS ahead): a pre-AOS heads-up is stale.
    fetchResponse = { ok: true, body: { passes: [makePass(-60_000, 600_000)] } }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(notificationsStore.items.some((i) => i.title === 'ISS (ZARYA) PASS')).toBe(false)
    scheduler.stop()
  })

  it('schedules the following pass after handling an immediate one', async () => {
    // First pass overhead (its stale heads-up is skipped), second pass 20 min out
    // should still get a heads-up when its fire-point arrives.
    fetchResponse = {
      ok: true,
      body: { passes: [makePass(-60_000, 120_000), makePass(1_200_000, 1_800_000)] },
    }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    // The overhead pass is stale (AOS already gone), so nothing has fired yet.
    expect(notificationsStore.items.some((i) => i.title === 'ISS (ZARYA) PASS')).toBe(false)
    await vi.advanceTimersByTimeAsync(1_200_000 - HEADS_UP_LEAD_MS)
    expect(notificationsStore.items.some((i) => i.title === 'ISS (ZARYA) PASS')).toBe(true)
    scheduler.stop()
  })

  it('does not re-fire the same pass on a later refresh (LOS guard)', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(600_000, 1_200_000)] } }
    flags = { headsUp: true, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    // Fire the heads-up.
    await vi.advanceTimersByTimeAsync(600_000 - HEADS_UP_LEAD_MS)
    const countAfterFirst = notificationsStore.items.filter(
      (i) => i.title === 'ISS (ZARYA) PASS',
    ).length
    expect(countAfterFirst).toBe(1)
    // A refresh re-delivers the same (now in-progress) pass; the guard prevents a
    // duplicate heads-up.
    await vi.advanceTimersByTimeAsync(REFRESH_MS)
    const countAfterRefresh = notificationsStore.items.filter(
      (i) => i.title === 'ISS (ZARYA) PASS',
    ).length
    expect(countAfterRefresh).toBe(1)
    scheduler.stop()
  })
})

describe('SatellitePassScheduler auto-tune track', () => {
  it('dispatches an external tune and adds an autotune notification at AOS', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(tuneEvents).toHaveLength(1)
    expect(tuneEvents[0]!.detail).toMatchObject({
      hz: 145_800_000,
      mode: 'FM',
      source: 'auto-tune',
      satName: 'ISS (ZARYA)',
      noradId: '25544',
      record: false,
    })
    const alert = notificationsStore.items.find((i) => i.type === 'autotune')
    expect(alert!.detail).toBe('Auto-tuning SDR → 145.800 MHz FM')
    scheduler.stop()
  })

  it('wording and event flag reflect record mode', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: false, autoTune: true, record: true }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(tuneEvents[0]!.detail).toMatchObject({ record: true })
    const alert = notificationsStore.items.find((i) => i.type === 'autotune')
    expect(alert!.detail).toBe('Auto-tuning & recording SDR → 145.800 MHz FM')
    scheduler.stop()
  })

  it('skips tuning and warns when no downlink is known', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    downlink = null
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(tuneEvents).toHaveLength(0)
    const alert = notificationsStore.items.find((i) => i.type === 'system')
    expect(alert!.detail).toBe('Auto-tune skipped — no downlink frequency known')
    scheduler.stop()
  })

  it('does not tune when auto-tune is disabled', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: false, autoTune: false, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })

  it('arms a one-shot LOS restore for the pass it tuned', async () => {
    // AOS in 30s, LOS in 10 min.
    fetchResponse = { ok: true, body: { passes: [makePass(30_000, 600_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    await vi.advanceTimersByTimeAsync(30_000) // AOS → tune
    expect(restoreEvents).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(570_000) // LOS → restore
    expect(restoreEvents).toHaveLength(1)
    expect(restoreEvents[0]!.detail).toMatchObject({
      source: 'auto-tune',
      satName: 'ISS (ZARYA)',
      noradId: '25544',
      token: `25544:${T0 + 30_000}`,
    })
    scheduler.stop()
  })
})

describe('SatellitePassScheduler.refireAutoTuneForCurrentPass', () => {
  it('is a no-op once stopped', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(-60_000, 600_000)] } }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    tuneEvents = []
    scheduler.stop()
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
  })

  it('is a no-op when no passes have been fetched', async () => {
    fetchResponse = { ok: true, body: { passes: [] } }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })

  it('re-tunes the currently-overhead pass after a mid-pass toggle', async () => {
    // Pass overhead now: tune fires at start.
    fetchResponse = { ok: true, body: { passes: [makePass(-60_000, 600_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(tuneEvents).toHaveLength(1)

    // Re-fire (e.g. record just enabled): the overhead pass tunes again.
    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(2)
    scheduler.stop()
  })

  it('does not resurrect an already-ended pass on refire', async () => {
    // Pass overhead at start (tunes once), then time advances past its LOS with
    // no refresh in between, so its fired-LOS entry is still in the set but now
    // in the past. A refire must NOT re-fire it (the `los > now` guard skips it).
    fetchResponse = { ok: true, body: { passes: [makePass(-30_000, 30_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(tuneEvents).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000) // past LOS (no refresh yet)

    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    // The ended pass is not re-tuned.
    expect(tuneEvents).toHaveLength(1)
    scheduler.stop()
  })

  it('safely refires a future pass without firing (guard not rolled back)', async () => {
    // Future pass: nothing has fired yet (_firedThroughLos still 0), so the
    // forget-current-pass rollback is skipped and no tune is dispatched.
    fetchResponse = { ok: true, body: { passes: [makePass(600_000, 1_200_000)] } }
    flags = { headsUp: false, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    expect(tuneEvents).toHaveLength(0)

    scheduler.refireAutoTuneForCurrentPass()
    await vi.advanceTimersByTimeAsync(0)
    expect(tuneEvents).toHaveLength(0)
    scheduler.stop()
  })
})

describe('SatellitePassScheduler.stop', () => {
  it('is safe to call before start (no interval armed)', () => {
    const scheduler = new SatellitePassScheduler(makeCtx())
    expect(() => scheduler.stop()).not.toThrow()
  })

  it('clears the refresh interval and pending track timers', async () => {
    fetchResponse = { ok: true, body: { passes: [makePass(600_000, 1_200_000)] } }
    flags = { headsUp: true, autoTune: true, record: false }
    const scheduler = new SatellitePassScheduler(makeCtx())
    await startAndFlush(scheduler)
    fetchSpy.mockClear()

    scheduler.stop()
    // No more refreshes and no armed heads-up/auto-tune fire after stop.
    await vi.advanceTimersByTimeAsync(REFRESH_MS + 1_200_000)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(notificationsStore.items.some((i) => i.title === 'ISS (ZARYA) PASS')).toBe(false)
    expect(tuneEvents).toHaveLength(0)
  })
})
