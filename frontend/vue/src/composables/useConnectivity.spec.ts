import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useConnectivity } from './useConnectivity'
import { useAppStore } from '@/stores/app'

function mountConnectivity(onModeChange: (online: boolean) => void) {
  const Harness = defineComponent({
    setup() {
      useConnectivity(onModeChange)
      return () => h('div')
    },
  })
  return mount(Harness)
}

describe('useConnectivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('online mode', () => {
    it('forces online and notifies when currently offline', async () => {
      const app = useAppStore()
      app.connectivityMode = 'online'
      app.setOnline(false)
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      expect(app.isOnline).toBe(true)
      expect(onModeChange).toHaveBeenCalledWith(true)
      wrapper.unmount()
    })

    it('is a no-op when already online', async () => {
      const app = useAppStore()
      app.connectivityMode = 'online'
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      expect(onModeChange).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('offgrid mode', () => {
    it('forces offline and notifies when currently online', () => {
      const app = useAppStore()
      app.connectivityMode = 'offgrid'
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      expect(app.isOnline).toBe(false)
      expect(onModeChange).toHaveBeenCalledWith(false)
      wrapper.unmount()
    })

    it('is a no-op when already offline', () => {
      const app = useAppStore()
      app.connectivityMode = 'offgrid'
      app.setOnline(false)
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      expect(onModeChange).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('auto mode probe', () => {
    it('goes offline when the probe request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))
      const app = useAppStore()
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      await flushPromises()
      expect(app.isOnline).toBe(false)
      expect(onModeChange).toHaveBeenCalledWith(false)
      wrapper.unmount()
    })

    it('goes offline when the probe responds not-ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const app = useAppStore()
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      await flushPromises()
      expect(app.isOnline).toBe(false)
      expect(onModeChange).toHaveBeenCalledWith(false)
      wrapper.unmount()
    })

    it('does not re-notify when the probe fails but already offline', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))
      const app = useAppStore()
      app.setOnline(false)
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      await flushPromises()
      expect(onModeChange).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('stays online (no callback) when the probe succeeds and already online', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
      const app = useAppStore()
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      await flushPromises()
      expect(app.isOnline).toBe(true)
      expect(onModeChange).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('reacting to mode changes', () => {
    it('switches offline when the mode becomes offgrid', async () => {
      const app = useAppStore()
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      await flushPromises()
      onModeChange.mockClear()
      app.connectivityMode = 'offgrid'
      await nextTick()
      expect(app.isOnline).toBe(false)
      expect(onModeChange).toHaveBeenCalledWith(false)
      wrapper.unmount()
    })

    it('switches online when the mode becomes online', async () => {
      const app = useAppStore()
      app.setOnline(false)
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      onModeChange.mockClear()
      app.connectivityMode = 'online'
      await nextTick()
      expect(app.isOnline).toBe(true)
      expect(onModeChange).toHaveBeenCalledWith(true)
      wrapper.unmount()
    })

    it('re-probes when the mode returns to auto', async () => {
      const app = useAppStore()
      app.connectivityMode = 'online'
      const onModeChange = vi.fn()
      const wrapper = mountConnectivity(onModeChange)
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchSpy)
      app.connectivityMode = 'auto'
      await nextTick()
      await flushPromises()
      expect(fetchSpy).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  it('polls on an interval and stops on unmount', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    const app = useAppStore()
    app.setOnline(false)
    const wrapper = mountConnectivity(vi.fn())
    const callsAfterMount = fetchSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)
    wrapper.unmount()
    const callsAfterUnmount = fetchSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchSpy.mock.calls.length).toBe(callsAfterUnmount) // interval cleared
  })
})
