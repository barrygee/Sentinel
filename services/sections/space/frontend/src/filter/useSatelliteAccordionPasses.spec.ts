import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { useSatelliteAccordionPasses } from './useSatelliteAccordionPasses'
import type { AccPass } from '../spacePassesUtils'

const LOCATION: [number, number] = [-1.6, 54.9]
const COMPUTED_AT = '2026-11-20T09:05:00Z'

const PASS: AccPass = {
  aos_utc: '2026-11-20T10:00:00Z',
  los_utc: '2026-11-20T10:10:00Z',
  aos_unix_ms: Date.UTC(2026, 10, 20, 10, 0),
  los_unix_ms: Date.UTC(2026, 10, 20, 10, 10),
  duration_s: 600,
  max_elevation_deg: 42,
  max_el_utc: '2026-11-20T10:05:00Z',
}

const expectedUpdated = `NEXT 24H · UPDATED ${new Date(COMPUTED_AT).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
})}`

function okResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) }
}

// Mounts the composable in a host component, so its onUnmounted hook is live.
function setup(location: [number, number] | null = LOCATION) {
  const getUserLocation = vi.fn(() => location)
  let passes!: ReturnType<typeof useSatelliteAccordionPasses>
  const wrapper = mount(
    defineComponent({
      setup() {
        passes = useSatelliteAccordionPasses(getUserLocation)
        return () => h('div')
      },
    }),
  )
  return { passes, wrapper, getUserLocation }
}

// Unmount each host after its test, or its document listener outlives it.
enableAutoUnmount(afterEach)

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useSatelliteAccordionPasses', () => {
  it('starts with no passes, not loading, on the computing status', () => {
    const { passes } = setup()
    expect(passes.passes.value).toEqual([])
    expect(passes.loading.value).toBe(false)
    expect(passes.status.value).toBe('COMPUTING PASSES…')
  })

  it('begin clears the last passes and shows computing', async () => {
    fetchMock.mockResolvedValue(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    const { passes } = setup()
    await passes.load('25544')
    passes.begin()
    expect(passes.passes.value).toEqual([])
    expect(passes.status.value).toBe('COMPUTING PASSES…')
    expect(passes.loading.value).toBe(true)
  })

  it('asks for a location instead of fetching when none is set', async () => {
    const { passes } = setup(null)
    passes.begin()
    await passes.load('25544')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(passes.status.value).toBe('SET LOCATION TO CALCULATE PASSES')
    expect(passes.loading.value).toBe(false)
  })

  it("fetches the next 24 hours of passes from the observer's location", async () => {
    fetchMock.mockResolvedValue(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    const { passes } = setup()
    passes.begin()
    await passes.load('ISS/ZARYA')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/space/satellite/ISS%2FZARYA/passes?lat=54.9&lon=-1.6&hours=24&min_el=0')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(passes.passes.value).toEqual([PASS])
    expect(passes.status.value).toBe(expectedUpdated)
    expect(passes.loading.value).toBe(false)
  })

  it('treats a reply without passes as none', async () => {
    fetchMock.mockResolvedValue(okResponse({ computed_at: COMPUTED_AT }))
    const { passes } = setup()
    await passes.load('25544')
    expect(passes.passes.value).toEqual([])
    expect(passes.status.value).toBe(expectedUpdated)
  })

  it('re-emits the list every second after a load, so countdowns stay live', async () => {
    fetchMock.mockResolvedValue(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    const { passes } = setup()
    await passes.load('25544')
    const before = passes.passes.value
    vi.advanceTimersByTime(1000)
    expect(passes.passes.value).not.toBe(before)
    expect(passes.passes.value).toEqual(before)
  })

  it('reports a failed reply', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const { passes } = setup()
    passes.begin()
    await passes.load('25544')
    expect(passes.status.value).toBe('COULD NOT LOAD PASSES')
    expect(passes.loading.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { passes } = setup()
    passes.begin()
    await passes.load('25544')
    expect(passes.status.value).toBe('NETWORK ERROR')
    expect(passes.loading.value).toBe(false)
  })

  it('stays quiet when the fetch is aborted', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const { passes } = setup()
    passes.begin()
    await passes.load('25544')
    expect(passes.status.value).toBe('COMPUTING PASSES…')
    expect(passes.loading.value).toBe(true)
  })

  it('ignores a reply that lands after stop', async () => {
    let resolveFetch!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)))
    const { passes } = setup()
    passes.begin()
    const loading = passes.load('25544')
    const signal: AbortSignal = fetchMock.mock.calls[0]![1].signal
    passes.stop()
    expect(signal.aborted).toBe(true)
    resolveFetch(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    await loading
    expect(passes.passes.value).toEqual([])
    expect(passes.status.value).toBe('COMPUTING PASSES…')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop drops the passes and the refresh tick', async () => {
    fetchMock.mockResolvedValue(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    const { passes } = setup()
    await passes.load('25544')
    passes.stop()
    expect(passes.passes.value).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop is harmless with nothing in flight', () => {
    const { passes } = setup()
    expect(() => passes.stop()).not.toThrow()
  })

  it('aborts an in-flight fetch on unmount', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { passes, wrapper } = setup()
    void passes.load('25544')
    const signal: AbortSignal = fetchMock.mock.calls[0]![1].signal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
  })

  it('clears the refresh tick on unmount', async () => {
    fetchMock.mockResolvedValue(okResponse({ passes: [PASS], computed_at: COMPUTED_AT }))
    const { passes, wrapper } = setup()
    await passes.load('25544')
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unmounts cleanly with nothing started', () => {
    const { wrapper } = setup()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
