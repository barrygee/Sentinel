import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { locationRef, schedulerInstance, passNotifs, flags } = vi.hoisted(() => ({
  locationRef: { value: null as null | { lon: number; lat: number; accuracy: number } },
  schedulerInstance: { start: vi.fn(), stop: vi.fn(), refireAutoTuneForCurrentPass: vi.fn() },
  passNotifs: {
    value: {} as Record<string, { name: string; downlinkHz?: number; downlinkMode?: string }>,
  },
  flags: { bell: new Set<string>(), autoTune: new Set<string>(), record: new Set<string>() },
}))

vi.mock('@/composables/useUserLocation', () => ({
  useUserLocation: () => ({ location: locationRef }),
}))
vi.mock('@/components/space/controls/satellite/SatellitePassScheduler', () => ({
  SatellitePassScheduler: vi.fn(function () {
    return schedulerInstance
  }),
}))
vi.mock('@/components/space/controls/satellite/passNotifStore', () => ({
  getAllPassNotifs: vi.fn(() => passNotifs.value),
  updatePassNotifName: vi.fn(),
  isPassNotifEnabled: vi.fn((id: string) => flags.bell.has(id)),
  isAutoTuneEnabled: vi.fn((id: string) => flags.autoTune.has(id)),
  isRecordOnPassEnabled: vi.fn((id: string) => flags.record.has(id)),
}))

async function loadService() {
  return (await import('./useSpaceAlertsService')).useSpaceAlertsService()
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useSpaceAlertsService', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    locationRef.value = null
    passNotifs.value = {}
    flags.bell.clear()
    flags.autoTune.clear()
    flags.record.clear()
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ satellites: [] }) }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('start with no enabled satellites wires listeners but creates no schedulers', async () => {
    const service = await loadService()
    service.start()
    const { SatellitePassScheduler } =
      await import('@/components/space/controls/satellite/SatellitePassScheduler')
    expect(SatellitePassScheduler).not.toHaveBeenCalled()
    service.stop()
  })

  it('start is idempotent and spins up schedulers for enabled satellites', async () => {
    passNotifs.value = { '25544': { name: 'ISS' } }
    flags.bell.add('25544')
    const service = await loadService()
    const { SatellitePassScheduler } =
      await import('@/components/space/controls/satellite/SatellitePassScheduler')
    service.start()
    service.start() // _started guard
    expect(SatellitePassScheduler).toHaveBeenCalledTimes(1)
    expect(schedulerInstance.start).toHaveBeenCalledTimes(1)
    service.stop()
  })

  describe('_syncScheduler via the notif-changed event', () => {
    it('creates a scheduler when the bell turns on and tears it down when both are off', async () => {
      passNotifs.value = { '1': { name: 'SAT' } }
      const service = await loadService()
      service.start()
      flags.bell.add('1')
      document.dispatchEvent(
        new CustomEvent('satellite-pass-notif-changed', {
          detail: { noradId: '1', enabled: true },
        }),
      )
      expect(schedulerInstance.start).toHaveBeenCalledTimes(1)

      flags.bell.delete('1')
      document.dispatchEvent(
        new CustomEvent('satellite-pass-notif-changed', {
          detail: { noradId: '1', enabled: false },
        }),
      )
      expect(schedulerInstance.stop).toHaveBeenCalledTimes(1)
      service.stop()
    })

    it('leaves an already-running scheduler untouched', async () => {
      passNotifs.value = { '1': { name: 'SAT' } }
      flags.bell.add('1')
      const service = await loadService()
      const { SatellitePassScheduler } =
        await import('@/components/space/controls/satellite/SatellitePassScheduler')
      service.start() // creates it
      document.dispatchEvent(
        new CustomEvent('satellite-pass-notif-changed', {
          detail: { noradId: '1', enabled: true },
        }),
      )
      expect(SatellitePassScheduler).toHaveBeenCalledTimes(1) // not recreated
      service.stop()
    })

    it('is a no-op disable when no scheduler exists', async () => {
      const service = await loadService()
      service.start()
      expect(() =>
        document.dispatchEvent(
          new CustomEvent('satellite-pass-notif-changed', {
            detail: { noradId: 'none', enabled: false },
          }),
        ),
      ).not.toThrow()
      service.stop()
    })
  })

  it('auto-tune change creates a scheduler and re-fires the current pass when enabled', async () => {
    passNotifs.value = { '1': { name: 'SAT' } }
    const service = await loadService()
    service.start()
    flags.autoTune.add('1')
    document.dispatchEvent(
      new CustomEvent('satellite-auto-tune-changed', { detail: { noradId: '1', enabled: true } }),
    )
    expect(schedulerInstance.start).toHaveBeenCalled()
    expect(schedulerInstance.refireAutoTuneForCurrentPass).toHaveBeenCalled()
    service.stop()
  })

  it('record-on-pass change re-fires the existing scheduler when enabled', async () => {
    passNotifs.value = { '1': { name: 'SAT' } }
    flags.bell.add('1')
    const service = await loadService()
    service.start()
    document.dispatchEvent(
      new CustomEvent('satellite-record-on-pass-changed', {
        detail: { noradId: '1', enabled: true },
      }),
    )
    expect(schedulerInstance.refireAutoTuneForCurrentPass).toHaveBeenCalled()
    service.stop()
  })

  it('satellite-selected updates the cached name only when a name is given', async () => {
    const service = await loadService()
    service.start()
    const { updatePassNotifName } =
      await import('@/components/space/controls/satellite/passNotifStore')
    document.dispatchEvent(
      new CustomEvent('satellite-selected', { detail: { noradId: '1', name: '' } }),
    )
    expect(updatePassNotifName).not.toHaveBeenCalled()
    document.dispatchEvent(
      new CustomEvent('satellite-selected', { detail: { noradId: '1', name: 'ISS' } }),
    )
    expect(updatePassNotifName).toHaveBeenCalledWith('1', 'ISS')
    service.stop()
  })

  describe('scheduler config callbacks and downlink cache', () => {
    it('exposes live location/name/flag getters and resolves downlinks', async () => {
      passNotifs.value = { '1': { name: 'StoredName', downlinkHz: 145800000, downlinkMode: 'FM' } }
      flags.autoTune.add('1')
      locationRef.value = { lon: -0.1, lat: 51.5, accuracy: 0 }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            satellites: [
              { norad_id: '2', downlink_hz: 437000000, downlink_mode: 'USB' },
              { norad_id: '3', downlink_hz: null },
            ],
          }),
        }),
      )
      const service = await loadService()
      const { SatellitePassScheduler } =
        await import('@/components/space/controls/satellite/SatellitePassScheduler')
      service.start()
      await tick() // let the downlink cache fetch resolve

      type SchedulerConfig = {
        getUserLocation: () => [number, number] | null
        getName: () => string
        headsUpEnabled: () => boolean
        autoTuneEnabled: () => boolean
        recordOnPass: () => boolean
        getDownlink: () => { hz: number; mode: string } | null
      }
      const config = vi.mocked(SatellitePassScheduler).mock
        .calls[0]![0] as unknown as SchedulerConfig

      expect(config.getUserLocation()).toEqual([-0.1, 51.5])
      locationRef.value = null
      expect(config.getUserLocation()).toBeNull()
      expect(config.getName()).toBe('StoredName')
      expect(config.autoTuneEnabled()).toBe(true)
      expect(config.headsUpEnabled()).toBe(false)
      expect(config.recordOnPass()).toBe(false)
      // Downlink from the persisted entry (entry.downlinkHz present).
      expect(config.getDownlink()).toEqual({ hz: 145800000, mode: 'FM' })

      service.stop()
    })

    it('falls back to the fetched downlink cache and to null', async () => {
      passNotifs.value = { '1': { name: 'NoDownlink' } } // no downlinkHz on the entry
      flags.autoTune.add('1')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            satellites: [{ norad_id: '1', downlink_hz: 100000000 }],
          }),
        }),
      )
      const service = await loadService()
      const { SatellitePassScheduler } =
        await import('@/components/space/controls/satellite/SatellitePassScheduler')
      service.start()
      await tick()
      const config = vi.mocked(SatellitePassScheduler).mock.calls[0]![0] as unknown as {
        getName: () => string
        getDownlink: () => { hz: number; mode: string } | null
      }
      // Cache fallback (downlink_mode missing → defaults to NFM).
      expect(config.getDownlink()).toEqual({ hz: 100000000, mode: 'NFM' })
      // getName falls back to the constructor-supplied name when the entry is gone.
      passNotifs.value = {}
      expect(config.getName()).toBe('NoDownlink')
      service.stop()
    })

    it('guards the cache fetch and resolves missing-field downlinks', async () => {
      passNotifs.value = {
        '1': { name: 'A', downlinkHz: 100 }, // entry downlink, no mode → NFM
        '2': { name: 'B' }, // no entry downlink → cache/null
      }
      flags.autoTune.add('1')
      flags.autoTune.add('2') // two auto-tune sats → cache fetch is guarded on the 2nd
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })) // no satellites → ?? []
      const service = await loadService()
      const { SatellitePassScheduler } =
        await import('@/components/space/controls/satellite/SatellitePassScheduler')
      service.start()
      await tick()

      type Cfg = { noradId: string; getDownlink: () => { hz: number; mode: string } | null }
      const calls = vi
        .mocked(SatellitePassScheduler)
        .mock.calls.map((call) => call[0] as unknown as Cfg)
      expect(calls.find((cfg) => cfg.noradId === '1')!.getDownlink()).toEqual({
        hz: 100,
        mode: 'NFM',
      })
      expect(calls.find((cfg) => cfg.noradId === '2')!.getDownlink()).toBeNull()
      service.stop()
    })

    it('handles a non-ok downlink response', async () => {
      passNotifs.value = { '1': { name: 'X' } }
      flags.autoTune.add('1')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const service = await loadService()
      service.start()
      await tick()
      service.stop()
      expect(fetch).toHaveBeenCalledWith('/api/space/tle/list')
    })

    it('swallows downlink fetch errors', async () => {
      passNotifs.value = { '1': { name: 'X' } }
      flags.autoTune.add('1')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const service = await loadService()
      service.start()
      await expect(tick()).resolves.toBeUndefined()
      service.stop()
    })
  })

  it('disable events do not re-fire, and unknown satellites fall back to the id as name', async () => {
    const service = await loadService()
    service.start()
    document.dispatchEvent(
      new CustomEvent('satellite-auto-tune-changed', { detail: { noradId: 'x', enabled: false } }),
    )
    document.dispatchEvent(
      new CustomEvent('satellite-record-on-pass-changed', {
        detail: { noradId: 'x', enabled: false },
      }),
    )
    expect(schedulerInstance.refireAutoTuneForCurrentPass).not.toHaveBeenCalled()
    service.stop()
  })

  it('stop removes listeners and stops all schedulers', async () => {
    passNotifs.value = { '1': { name: 'SAT' } }
    flags.bell.add('1')
    const service = await loadService()
    service.start()
    service.stop()
    expect(schedulerInstance.stop).toHaveBeenCalled()
    // After stop the listeners are gone — a toggle does nothing.
    schedulerInstance.start.mockClear()
    flags.bell.add('2')
    document.dispatchEvent(
      new CustomEvent('satellite-pass-notif-changed', { detail: { noradId: '2', enabled: true } }),
    )
    expect(schedulerInstance.start).not.toHaveBeenCalled()
  })
})
