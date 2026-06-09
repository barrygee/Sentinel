import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlaybackStore, type PlaybackAircraft } from './playback'

function aircraftWith(hex: string, snapshotTimes: number[]): PlaybackAircraft {
  return {
    registration: 'REG',
    callsign: 'CS',
    type_code: 'A320',
    hex,
    snapshots: snapshotTimes.map((ts) => ({
      ts,
      lat: 0,
      lon: 0,
      alt_baro: null,
      gs: null,
      track: null,
      baro_rate: null,
      squawk: null,
    })),
  }
}

describe('playback store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has the expected idle initial state', () => {
    const store = usePlaybackStore()
    expect(store.status).toBe('idle')
    expect(store.aircraft).toEqual({})
    expect(store.windowStartMs).toBeNull()
    expect(store.windowEndMs).toBeNull()
    expect(store.cursorMs).toBeNull()
    expect(store.speedIdx).toBe(0)
    expect(store.pendingStartMs).toBeNull()
    expect(store.pendingEndMs).toBeNull()
    expect(store.isActive).toBe(false)
  })

  it('activate moves to loading and marks the session active', () => {
    const store = usePlaybackStore()
    store.activate()
    expect(store.status).toBe('loading')
    expect(store.isActive).toBe(true)
  })

  describe('setData cursor placement', () => {
    it('starts the cursor at the earliest snapshot within the window', () => {
      const store = usePlaybackStore()
      store.setData({ start_ms: 100, end_ms: 200, aircraft: { a: aircraftWith('a', [150]) } })
      expect(store.cursorMs).toBe(150)
      expect(store.status).toBe('ready')
      expect(store.windowStartMs).toBe(100)
      expect(store.windowEndMs).toBe(200)
    })

    it('clamps the cursor up to start_ms when data precedes the window', () => {
      const store = usePlaybackStore()
      store.setData({ start_ms: 100, end_ms: 200, aircraft: { a: aircraftWith('a', [50]) } })
      expect(store.cursorMs).toBe(100)
    })

    it('uses the minimum first-snapshot across all aircraft', () => {
      const store = usePlaybackStore()
      store.setData({
        start_ms: 100,
        end_ms: 200,
        aircraft: { a: aircraftWith('a', [180]), b: aircraftWith('b', [120]) },
      })
      expect(store.cursorMs).toBe(120)
    })

    it('falls back to end_ms when there are no aircraft', () => {
      const store = usePlaybackStore()
      store.setData({ start_ms: 100, end_ms: 200, aircraft: {} })
      expect(store.cursorMs).toBe(200)
    })

    it('ignores aircraft with no snapshots', () => {
      const store = usePlaybackStore()
      store.setData({
        start_ms: 100,
        end_ms: 200,
        aircraft: { empty: aircraftWith('empty', []), a: aircraftWith('a', [150]) },
      })
      expect(store.cursorMs).toBe(150)
    })
  })

  it('play and pause set the status', () => {
    const store = usePlaybackStore()
    store.play()
    expect(store.status).toBe('playing')
    store.pause()
    expect(store.status).toBe('paused')
  })

  describe('seek', () => {
    it('clamps within the loaded window', () => {
      const store = usePlaybackStore()
      store.setData({ start_ms: 100, end_ms: 200, aircraft: {} })
      store.seek(150)
      expect(store.cursorMs).toBe(150)
      store.seek(50)
      expect(store.cursorMs).toBe(100)
      store.seek(250)
      expect(store.cursorMs).toBe(200)
    })

    it('uses the requested value when no window is loaded', () => {
      const store = usePlaybackStore()
      store.seek(150)
      expect(store.cursorMs).toBe(150)
    })
  })

  it('exit resets all session state to idle', () => {
    const store = usePlaybackStore()
    store.setData({ start_ms: 100, end_ms: 200, aircraft: { a: aircraftWith('a', [150]) } })
    store.pendingStartMs = 1
    store.pendingEndMs = 2
    store.exit()
    expect(store.status).toBe('idle')
    expect(store.aircraft).toEqual({})
    expect(store.cursorMs).toBeNull()
    expect(store.windowStartMs).toBeNull()
    expect(store.windowEndMs).toBeNull()
    expect(store.pendingStartMs).toBeNull()
    expect(store.pendingEndMs).toBeNull()
    expect(store.isActive).toBe(false)
  })
})
