import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { FakeEventSource, makeConstraints, makeDevice } from '../testing/factories'
import { useLocalAuthStore } from '../stores/localAuthStore'
import { useLocalSdrStore } from '../stores/localSdrStore'
import {
  HOTSPOT_ROLLBACK_CODES,
  RECONNECT_FIRST_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  STALL_TIMEOUT_MS,
  useLocalSdrEvents,
} from './useLocalSdrEvents'

const api = vi.hoisted(() => ({
  EVENTS_URL: '/api/sdr-manager/local/events',
  listDevices: vi.fn(),
}))
vi.mock('../api/sdrManagerLocalApi', () => api)

let pinia: Pinia
const mounted: VueWrapper[] = []

/** A component that subscribes, as each THIS MACHINE card does. */
function subscribe(options?: Parameters<typeof useLocalSdrEvents>[0]): VueWrapper {
  const wrapper = mount(
    defineComponent({
      setup() {
        useLocalSdrEvents(options)
        return () => h('div')
      },
    }),
    { global: { plugins: [pinia] } },
  )
  mounted.push(wrapper)
  return wrapper
}

describe('useLocalSdrEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource)
    api.listDevices.mockReset()
    api.listDevices.mockResolvedValue({
      devices: [],
      port_suggestion: 1300,
      constraints: makeConstraints(),
    })
  })

  afterEach(() => {
    // Module state is shared, so every test must leave no subscriber behind.
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('shared stream', () => {
    it('opens the event stream on the first mount and reads the port rules', async () => {
      const store = useLocalSdrStore()

      subscribe()

      expect(FakeEventSource.instances).toHaveLength(1)
      expect(FakeEventSource.latest.url).toBe(api.EVENTS_URL)
      expect(store.connection).toBe('connecting')
      expect(api.listDevices).toHaveBeenCalledOnce()
    })

    it('shares one stream between subscribers and closes it only when the last unmounts', () => {
      const store = useLocalSdrStore()
      const first = subscribe()
      const second = subscribe()
      const source = FakeEventSource.latest

      expect(FakeEventSource.instances).toHaveLength(1)

      first.unmount()
      expect(source.closed).toBe(false)

      second.unmount()
      expect(source.closed).toBe(true)
      expect(store.connection).toBe('offline')
    })

    it('opens a fresh stream when a subscriber mounts again after all left', () => {
      const first = subscribe()
      first.unmount()

      subscribe()

      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.latest.closed).toBe(false)
    })

    it('cancels a pending reconnect on teardown', () => {
      const wrapper = subscribe()
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)

      wrapper.unmount()
      vi.advanceTimersByTime(RECONNECT_MAX_DELAY_MS * 2)

      expect(FakeEventSource.instances).toHaveLength(1)
    })
  })

  describe('a browser that cannot open the stream', () => {
    it('tears down cleanly when opening threw, with no timers to clear', () => {
      const store = useLocalSdrStore()
      vi.stubGlobal(
        'EventSource',
        class {
          static readonly CLOSED = 2
          constructor() {
            throw new Error('EventSource unsupported')
          }
        },
      )
      const failures: unknown[] = []
      const app = createApp(
        defineComponent({
          setup() {
            useLocalSdrEvents()
            return () => h('div')
          },
        }),
      )
      app.use(pinia)
      app.config.errorHandler = (error) => failures.push(error)
      app.mount(document.createElement('div'))

      expect(failures).toHaveLength(1)
      expect(() => app.unmount()).not.toThrow()
      expect(store.connection).toBe('offline')
    })
  })

  describe('events', () => {
    it('applies a snapshot and goes live', () => {
      const store = useLocalSdrStore()
      subscribe()

      FakeEventSource.latest.emit('snapshot', {
        generated_at: 1,
        location: { latitude: 1, longitude: 2 },
        sdrs: [makeDevice({ device_id: 'a' })],
      })

      expect(store.devices.map((device) => device.device_id)).toEqual(['a'])
      expect(store.connection).toBe('live')
    })

    it('merges device_changed and removes on device_removed', () => {
      const store = useLocalSdrStore()
      subscribe()
      const source = FakeEventSource.latest

      source.emit('device_changed', makeDevice({ device_id: 'a', name: 'Roof' }))
      expect(store.devicesById['a']?.name).toBe('Roof')

      source.emit('device_removed', { device_id: 'a', record_id: null })
      expect(store.devicesById['a']).toBeUndefined()
    })

    it('a health event only proves the stream is alive', () => {
      const store = useLocalSdrStore()
      subscribe()

      FakeEventSource.latest.emit('health', { ok: true })

      expect(store.connection).toBe('live')
      expect(store.devices).toEqual([])
    })

    it('logs a notice', () => {
      const store = useLocalSdrStore()
      subscribe()

      FakeEventSource.latest.emit('notice', {
        level: 'info',
        code: 'serial_flashed',
        message: 'Done',
        device_id: null,
        ts: 1,
      })

      expect(store.notices.map((item) => item.code)).toEqual(['serial_flashed'])
    })

    it('ignores an unparseable payload but still counts it as a sign of life', () => {
      const store = useLocalSdrStore()
      subscribe()

      FakeEventSource.latest.emit('snapshot', '{not json')

      expect(store.loaded).toBe(false)
      expect(store.connection).toBe('live')
    })
  })

  describe('hotspot rollback listeners', () => {
    const rollbackNotice = (code: string) => ({
      level: 'warn',
      code,
      message: `message for ${code}`,
      device_id: null,
      ts: 1,
    })

    it('lists the two rollback codes', () => {
      expect([...HOTSPOT_ROLLBACK_CODES].sort()).toEqual([
        'hotspot_rollback',
        'hotspot_rollback_failed',
      ])
    })

    it.each(['hotspot_rollback', 'hotspot_rollback_failed'])(
      'tells the listener about %s with the notice message',
      (code) => {
        const listener = vi.fn()
        subscribe({ onHotspotRollback: listener })

        FakeEventSource.latest.emit('notice', rollbackNotice(code))

        expect(listener).toHaveBeenCalledWith(`message for ${code}`)
      },
    )

    it('does not call the listener for other notices', () => {
      const listener = vi.fn()
      subscribe({ onHotspotRollback: listener })

      FakeEventSource.latest.emit('notice', rollbackNotice('device_busy'))

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops calling a listener once its component unmounts', () => {
      const listener = vi.fn()
      const other = vi.fn()
      const leaving = subscribe({ onHotspotRollback: listener })
      subscribe({ onHotspotRollback: other })

      leaving.unmount()
      FakeEventSource.latest.emit('notice', rollbackNotice('hotspot_rollback'))

      expect(listener).not.toHaveBeenCalled()
      expect(other).toHaveBeenCalledOnce()
    })
  })

  describe('reconnecting', () => {
    it('shows reconnecting without reopening when the browser is retrying by itself', () => {
      const store = useLocalSdrStore()
      subscribe()
      const source = FakeEventSource.latest

      source.fail(FakeEventSource.CONNECTING)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS * 5)

      expect(store.connection).toBe('reconnecting')
      expect(source.closed).toBe(false)
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('reopens a stream the browser closed for good, after the first delay', () => {
      const store = useLocalSdrStore()
      subscribe()
      const refused = FakeEventSource.latest

      refused.fail(FakeEventSource.CLOSED)

      expect(store.connection).toBe('reconnecting')
      expect(refused.closed).toBe(true)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS - 1)
      expect(FakeEventSource.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(FakeEventSource.instances).toHaveLength(2)
    })

    it('doubles the delay on each failure up to the cap', () => {
      subscribe()
      const delays: number[] = []
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const before = FakeEventSource.instances.length
        FakeEventSource.latest.fail(FakeEventSource.CLOSED)
        let waited = 0
        while (FakeEventSource.instances.length === before) {
          vi.advanceTimersByTime(500)
          waited += 500
        }
        delays.push(waited)
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
    })

    it('does not schedule a second reconnect while one is pending', () => {
      subscribe()
      const source = FakeEventSource.latest

      source.fail(FakeEventSource.CLOSED)
      source.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS * 5)

      expect(FakeEventSource.instances).toHaveLength(2)
    })

    it('resets the back-off once an event arrives', () => {
      subscribe()
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS * 2)
      expect(FakeEventSource.instances).toHaveLength(3)

      FakeEventSource.latest.emit('health', {})
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)

      expect(FakeEventSource.instances).toHaveLength(4)
    })

    it('goes live again once the reopened stream delivers', () => {
      const store = useLocalSdrStore()
      subscribe()
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)

      FakeEventSource.latest.emit('health', {})

      expect(store.connection).toBe('live')
    })
  })

  describe('stall detection', () => {
    it('reconnects when no event arrives for longer than the stall timeout', () => {
      const store = useLocalSdrStore()
      subscribe()
      const stalled = FakeEventSource.latest

      vi.advanceTimersByTime(STALL_TIMEOUT_MS)
      expect(FakeEventSource.instances).toHaveLength(1)
      vi.advanceTimersByTime(STALL_TIMEOUT_MS / 3)

      expect(stalled.closed).toBe(true)
      expect(store.connection).toBe('reconnecting')
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)
      expect(FakeEventSource.instances).toHaveLength(2)
    })

    it('stays connected while events keep arriving', () => {
      const store = useLocalSdrStore()
      subscribe()
      const source = FakeEventSource.latest

      for (let beat = 0; beat < 10; beat += 1) {
        vi.advanceTimersByTime(5_000)
        source.emit('health', {})
      }

      expect(source.closed).toBe(false)
      expect(FakeEventSource.instances).toHaveLength(1)
      expect(store.connection).toBe('live')
    })

    it('keeps watching across a reconnect without stacking timers', () => {
      subscribe()
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)
      expect(vi.getTimerCount()).toBe(1)

      // The new stream stalls too and is replaced again.
      vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2)

      expect(FakeEventSource.instances.length).toBeGreaterThan(2)
    })
  })

  describe('signing in', () => {
    it('reopens straight away on sign-in, skipping the back-off', async () => {
      const auth = useLocalAuthStore()
      auth.passwordSet = true
      auth.authenticated = false
      subscribe()
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      expect(FakeEventSource.instances).toHaveLength(1)
      api.listDevices.mockClear()

      auth.authenticated = true
      await nextTick()

      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.latest.closed).toBe(false)
      expect(api.listDevices).toHaveBeenCalledOnce()
      // The pending back-off timer was cancelled, so no third stream appears.
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS * 5)
      expect(FakeEventSource.instances).toHaveLength(2)
    })

    it('resets the back-off when signing in', async () => {
      const auth = useLocalAuthStore()
      auth.authenticated = false
      subscribe()
      for (let attempt = 0; attempt < 3; attempt += 1) {
        FakeEventSource.latest.fail(FakeEventSource.CLOSED)
        vi.advanceTimersByTime(RECONNECT_MAX_DELAY_MS)
      }

      auth.authenticated = true
      await nextTick()
      const count = FakeEventSource.instances.length
      FakeEventSource.latest.fail(FakeEventSource.CLOSED)
      vi.advanceTimersByTime(RECONNECT_FIRST_DELAY_MS)

      expect(FakeEventSource.instances).toHaveLength(count + 1)
    })

    it('does nothing when the session is lost', async () => {
      const auth = useLocalAuthStore()
      subscribe()

      auth.authenticated = false
      await nextTick()

      expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('stops watching sign-in once the stream is torn down', async () => {
      const auth = useLocalAuthStore()
      auth.authenticated = false
      const wrapper = subscribe()
      wrapper.unmount()

      auth.authenticated = true
      await nextTick()

      expect(FakeEventSource.instances).toHaveLength(1)
    })
  })
})
