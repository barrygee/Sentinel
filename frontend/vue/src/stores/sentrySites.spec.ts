import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSentrySitesStore } from './sentrySites'
import type { RadioSite } from '@/shell/radioSitesCapability'
import { provideFakeRadioSites } from '@/test/fakeRadio'

const SITE: RadioSite = {
  id: 1,
  name: 'Roof Pi',
  address: '192.168.1.60',
  port: 8000,
  reachable: true,
  latitude: 51.5,
  longitude: -0.1,
  updated_at: 1000,
}

/** The poll interval the store uses, in ms — one tick's worth of fake time. */
const POLL_INTERVAL_MS = 15_000

// The sites come from the radio platform's `radioSites` capability — a fake
// here (the Sentry API call behind it is the sdr provider's own spec).
let radioSites: ReturnType<typeof provideFakeRadioSites>

describe('sentrySites store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    radioSites = provideFakeRadioSites()
  })
  afterEach(() => {
    radioSites.withdraw()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts with no sites', () => {
    expect(useSentrySitesStore().sites).toEqual([])
  })

  it('fetchSites replaces the held list from the radio platform', async () => {
    radioSites.listSites.mockResolvedValue([SITE])
    const store = useSentrySitesStore()
    await store.fetchSites()
    expect(radioSites.listSites).toHaveBeenCalledOnce()
    expect(store.sites).toEqual([SITE])
  })

  it('has no sites, and never counts as loaded, with no radio platform registered', async () => {
    radioSites.withdraw()
    const store = useSentrySitesStore()
    await store.fetchSites()
    expect(store.sites).toEqual([])
    expect(store.loaded).toBe(false)
  })

  describe('the loaded flag', () => {
    it('starts false, before any list has been seen', () => {
      expect(useSentrySitesStore().loaded).toBe(false)
    })

    it('is set once a list arrives, even an empty one', async () => {
      const store = useSentrySitesStore()
      await store.fetchSites()
      // "No host reports a position" and "we have not asked yet" are different
      // facts, and the range-ring origin has to tell them apart before
      // concluding its pinned host is gone.
      expect(store.sites).toEqual([])
      expect(store.loaded).toBe(true)
    })

    it('stays false while the fetch keeps failing', async () => {
      radioSites.listSites.mockRejectedValue(new Error('offline'))
      const store = useSentrySitesStore()
      await store.fetchSites()
      expect(store.loaded).toBe(false)
    })
  })

  it('keeps the last-known list when a refresh fails', async () => {
    radioSites.listSites.mockResolvedValue([SITE])
    const store = useSentrySitesStore()
    await store.fetchSites()
    // A Pi (or the backend) going away mid-session must not blank the map.
    radioSites.listSites.mockRejectedValue(new Error('offline'))
    await expect(store.fetchSites()).resolves.toBeUndefined()
    expect(store.sites).toEqual([SITE])
  })

  it('startPolling fetches immediately and then on the interval', async () => {
    const store = useSentrySitesStore()
    store.startPolling()
    expect(radioSites.listSites).toHaveBeenCalledTimes(1) // immediate
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(radioSites.listSites).toHaveBeenCalledTimes(2) // one interval tick
    store.stopPolling()
  })

  it('ref-counts pollers: a second start does not add a second interval', async () => {
    const store = useSentrySitesStore()
    store.startPolling()
    store.startPolling() // a second map mounted — joins the existing poll
    expect(radioSites.listSites).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(radioSites.listSites).toHaveBeenCalledTimes(2) // still one tick per interval
    store.stopPolling()
    store.stopPolling()
  })

  it('stops polling only when the last consumer leaves', async () => {
    const store = useSentrySitesStore()
    store.startPolling()
    store.startPolling()
    store.stopPolling() // one consumer left; polling continues
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(radioSites.listSites).toHaveBeenCalledTimes(2)
    store.stopPolling() // last consumer left; polling stops
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(radioSites.listSites).toHaveBeenCalledTimes(2) // no further ticks
  })

  it('stopPolling with no active poller is a safe no-op', () => {
    const store = useSentrySitesStore()
    expect(() => store.stopPolling()).not.toThrow()
    // …and the count never goes negative, so a later start still polls once.
    store.startPolling()
    expect(radioSites.listSites).toHaveBeenCalledTimes(1)
    store.stopPolling()
  })
})
