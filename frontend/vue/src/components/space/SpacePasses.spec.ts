import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

// ---- Module mocks ------------------------------------------------------------
// The per-satellite pass-notification store is exercised in its own spec; here we
// drive its read/write functions as injectable test doubles so each branch of the
// component (armed / not armed, record on / off, bell on / off) is controllable.
vi.mock('./controls/satellite/passNotifStore', () => ({
  isPassNotifEnabled: vi.fn(() => false),
  isAutoTuneEnabled: vi.fn(() => false),
  setAutoTuneEnabled: vi.fn(),
  isRecordOnPassEnabled: vi.fn(() => false),
  setRecordOnPassEnabled: vi.fn(),
}))

// The notifications store calls playNotificationSound() on add(); stub it so the
// audio path doesn't run under jsdom.
vi.mock('@/composables/useNotificationSound', () => ({
  playNotificationSound: vi.fn(),
}))

import SpacePasses from './SpacePasses.vue'
import { useNotificationsStore } from '../../stores/notifications'
import {
  isPassNotifEnabled,
  isAutoTuneEnabled,
  setAutoTuneEnabled,
  isRecordOnPassEnabled,
  setRecordOnPassEnabled,
} from './controls/satellite/passNotifStore'
import type { SatPass, AccPass } from './spacePassesUtils'

enableAutoUnmount(afterEach)

// ---- Fetch test double -------------------------------------------------------
// Two endpoints matter: the passes list (`/api/space/passes`) and a single
// satellite's accordion passes (`/api/space/satellite/{id}/passes`). Everything
// else (the notifications store's POST/DELETE to `/api/air/messages`) gets a
// generic OK so it never throws.
interface FetchResult {
  ok: boolean
  status: number
  body: unknown
}
let passesResult: FetchResult
let accResult: FetchResult
let fetchOverride: ((url: string, opts?: RequestInit) => Promise<unknown>) | null

function makeResponse(result: FetchResult): Promise<unknown> {
  return Promise.resolve({
    ok: result.ok,
    status: result.status,
    json: () => Promise.resolve(result.body),
  })
}

function defaultRouter(url: string): Promise<unknown> {
  if (url.includes('/api/space/satellite/') && url.includes('/passes')) {
    return makeResponse(accResult)
  }
  if (url.includes('/api/space/passes')) {
    return makeResponse(passesResult)
  }
  // notifications-store traffic (/api/air/messages) and anything else
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
}

// ---- Fake SatelliteControl ---------------------------------------------------
function makeFakeControl(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    switchSatellite: vi.fn(),
    stopFollowing: vi.fn(),
    previewSatellite: vi.fn(),
    clearPreview: vi.fn(),
    togglePassNotifications: vi.fn(),
    followedNoradId: null,
    passNotificationsEnabled: false,
    activeNoradId: '00000',
    ...overrides,
  }
}

// ---- Pass fixtures -----------------------------------------------------------
const NOW = Date.now()

function makePass(overrides: Partial<SatPass> = {}): SatPass {
  const aos = NOW + 600_000 // 10 min out — inside the 1h countdown window
  const los = NOW + 900_000
  return {
    norad_id: '25544',
    name: 'ISS (ZARYA)',
    category: 'space_station',
    aos_utc: new Date(aos).toISOString(),
    los_utc: new Date(los).toISOString(),
    aos_unix_ms: aos,
    los_unix_ms: los,
    duration_s: 305,
    max_elevation_deg: 45.5,
    max_el_utc: new Date(aos + 150_000).toISOString(),
    ...overrides,
  }
}

function makeAccPass(overrides: Partial<AccPass> = {}): AccPass {
  const aos = NOW + 1_200_000
  const los = NOW + 1_500_000
  return {
    aos_utc: new Date(aos).toISOString(),
    los_utc: new Date(los).toISOString(),
    aos_unix_ms: aos,
    los_unix_ms: los,
    duration_s: 300,
    max_elevation_deg: 33.3,
    max_el_utc: new Date(aos + 150_000).toISOString(),
    ...overrides,
  }
}

// ---- Mount helpers -----------------------------------------------------------
interface MountOpts {
  control?: ReturnType<typeof makeFakeControl> | null
  getUserLocation?: () => [number, number] | null
}

function mountPasses(opts: MountOpts = {}): VueWrapper {
  setActivePinia(createPinia())
  const control = opts.control === undefined ? makeFakeControl() : opts.control
  return mount(SpacePasses, {
    props: {
      satelliteControl: control as never,
      getUserLocation: opts.getUserLocation ?? (() => [10, 50] as [number, number]),
      isVisible: true,
    },
  })
}

// Mount with a location present, then flush the onMounted fetchPasses() so the
// list is rendered before assertions.
async function mountReady(opts: MountOpts = {}): Promise<VueWrapper> {
  const wrapper = mountPasses(opts)
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

// Expand the first pass card and flush the accordion fetch.
async function expandFirstCard(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.spp-pass-card').trigger('click')
  await flushPromises()
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isPassNotifEnabled).mockReturnValue(false)
  vi.mocked(isAutoTuneEnabled).mockReturnValue(false)
  vi.mocked(isRecordOnPassEnabled).mockReturnValue(false)
  fetchOverride = null
  passesResult = {
    ok: true,
    status: 200,
    body: { passes: [makePass()], satellite_count: 1, computed_at: new Date().toISOString() },
  }
  accResult = {
    ok: true,
    status: 200,
    body: { passes: [makeAccPass()], computed_at: new Date().toISOString() },
  }
  global.fetch = vi.fn((url: string | URL | Request, opts?: RequestInit) =>
    (fetchOverride ?? defaultRouter)(String(url), opts),
  ) as unknown as typeof fetch
})

// =============================================================================
describe('SpacePasses — initial fetch & list rendering', () => {
  it('fetches and renders a pass card on mount when a location is available', async () => {
    const wrapper = await mountReady()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/space/passes?lat=50&lon=10'),
      expect.objectContaining({ signal: expect.anything() }),
    )
    const card = wrapper.find('.spp-pass-card')
    expect(card.exists()).toBe(true)
    expect(card.find('.spp-pass-primary').text()).toBe('ISS (ZARYA)')
    // statusText cleared on success → no status bar
    expect(wrapper.find('#spp-status-bar').exists()).toBe(false)
  })

  it('shows the primary as the norad id when the pass has no name', async () => {
    passesResult.body = {
      passes: [makePass({ name: '', norad_id: '40069' })],
      satellite_count: 1,
      computed_at: '',
    }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-pass-primary').text()).toBe('40069')
  })

  it('renders the secondary line and the duration · max-elevation detail', async () => {
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-pass-secondary').text()).toBe('STATION · NORAD 25544')
    expect(wrapper.find('.spp-pass-detail').text()).toBe('5m 5s · 45.5°')
  })

  it('shows the empty-results message when the backend returns no passes', async () => {
    passesResult.body = { passes: [], satellite_count: 0, computed_at: '' }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toContain('No passes found')
    expect(wrapper.find('.spp-pass-card').exists()).toBe(false)
  })

  it('treats a missing passes array as empty', async () => {
    passesResult.body = { satellite_count: 0, computed_at: '' }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toContain('No passes found')
  })

  it('marks an in-progress pass and renders IN PROGRESS', async () => {
    passesResult.body = {
      passes: [makePass({ aos_unix_ms: NOW - 60_000, los_unix_ms: NOW + 60_000 })],
      satellite_count: 1,
      computed_at: '',
    }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-pass-aos').classes()).toContain('spp-in-progress')
    expect(wrapper.find('.spp-pass-aos').text()).toBe('IN PROGRESS')
  })

  it('renders a wall-clock AOS time for a pass more than an hour out', async () => {
    passesResult.body = {
      passes: [makePass({ aos_unix_ms: NOW + 2 * 3_600_000, los_unix_ms: NOW + 2 * 3_600_000 })],
      satellite_count: 1,
      computed_at: '',
    }
    const wrapper = await mountReady()
    // Not the "IN …" countdown form (that's reserved for < 1h).
    expect(wrapper.find('.spp-pass-aos').text()).not.toContain('IN ')
    expect(wrapper.find('.spp-pass-aos').classes()).not.toContain('spp-in-progress')
  })
})

// =============================================================================
describe('SpacePasses — no-location handling', () => {
  it('shows the set-location prompt and button when no location is available', async () => {
    const wrapper = await mountReady({ getUserLocation: () => null })
    expect(wrapper.find('.spp-message').text()).toContain('Set your location')
    expect(wrapper.find('.spp-action-btn').exists()).toBe(true)
    // No passes request was made.
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/space/passes'),
      expect.anything(),
    )
  })

  it('dispatches space-go-to-location when SET LOCATION is clicked', async () => {
    const handler = vi.fn()
    document.addEventListener('space-go-to-location', handler)
    const wrapper = await mountReady({ getUserLocation: () => null })
    await wrapper.find('.spp-action-btn').trigger('click')
    expect(handler).toHaveBeenCalledTimes(1)
    document.removeEventListener('space-go-to-location', handler)
  })

  it('polls for a location and fetches passes once one appears', async () => {
    vi.useFakeTimers()
    let location: [number, number] | null = null
    const wrapper = mountPasses({ getUserLocation: () => location })
    await wrapper.vm.$nextTick()
    // onMounted → showNoLocation creates the poll; no passes fetched yet.
    expect(wrapper.find('.spp-action-btn').exists()).toBe(true)
    location = [1, 2]
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/space/passes'),
      expect.anything(),
    )
    vi.useRealTimers()
  })

  it('gives up polling after 120 ticks without a location', async () => {
    vi.useFakeTimers()
    const wrapper = mountPasses({ getUserLocation: () => null })
    await vi.advanceTimersByTimeAsync(121 * 500)
    // Still no passes fetch; poll cleared itself (advancing further is a no-op).
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/space/passes'),
      expect.anything(),
    )
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('does not start a second poll if one is already running', async () => {
    vi.useFakeTimers()
    const wrapper = mountPasses({ getUserLocation: () => null })
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    // A second no-location fetch must reuse the existing poll, not create another.
    await (wrapper.vm as unknown as { fetchPasses: () => Promise<void> }).fetchPasses()
    expect(setIntervalSpy).not.toHaveBeenCalled()
    wrapper.unmount()
    vi.useRealTimers()
  })
})

// =============================================================================
describe('SpacePasses — fetch error handling', () => {
  it('shows the import-satellites message when the backend reports no_tle_data', async () => {
    passesResult = { ok: false, status: 422, body: { no_tle_data: true } }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toContain('Import satellites in Settings')
  })

  it('shows the backend error text on a non-OK response', async () => {
    passesResult = { ok: false, status: 500, body: { error: 'boom' } }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toBe('Error 500 — boom')
  })

  it('falls back to a generic message when a non-OK response has no error field', async () => {
    passesResult = { ok: false, status: 503, body: {} }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toBe('Error 503 — Failed to load passes')
  })

  it('shows a network-error message when the fetch rejects', async () => {
    fetchOverride = () => Promise.reject(new Error('offline'))
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toContain('Network error')
  })

  it('silently ignores an AbortError (no error message rendered)', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    fetchOverride = () => Promise.reject(abortError)
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').exists()).toBe(false)
  })

  it('aborts the previous in-flight request when fetchPasses runs again', async () => {
    const wrapper = await mountReady()
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    await (wrapper.vm as unknown as { fetchPasses: () => Promise<void> }).fetchPasses()
    expect(abortSpy).toHaveBeenCalled()
    abortSpy.mockRestore()
  })

  it('bails out after the await if the request was aborted mid-flight', async () => {
    // Hold the first request open, fire a second (which aborts the first), then
    // release — the first must return without clobbering state.
    let release: (value: unknown) => void = () => {}
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let callCount = 0
    fetchOverride = () => {
      callCount++
      if (callCount === 1) return gate.then(() => makeResponse(passesResult))
      return makeResponse(passesResult)
    }
    const wrapper = mountPasses()
    const vm = wrapper.vm as unknown as { fetchPasses: () => Promise<void> }
    const second = vm.fetchPasses() // aborts the first controller
    release(null)
    await Promise.all([flushPromises(), second])
    // The second (un-aborted) request still populated the list.
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-pass-card').exists()).toBe(true)
  })
})

// =============================================================================
describe('SpacePasses — category filter chips', () => {
  function twoCategoryPasses() {
    passesResult.body = {
      passes: [
        makePass({ norad_id: '1', category: 'space_station' }),
        makePass({ norad_id: '2', category: 'weather' }),
        makePass({ norad_id: '3', category: null }), // → 'unknown'
        makePass({ norad_id: '4', category: 'odd_cat' }), // not in ORDER → fallback label
      ],
      satellite_count: 4,
      computed_at: '',
    }
  }

  it('renders an ALL chip plus one chip per present category', async () => {
    twoCategoryPasses()
    const wrapper = await mountReady()
    const chips = wrapper.findAll('.spp-cat-filter-chip')
    const labels = chips.map((chip) => chip.text())
    expect(labels[0]).toBe('ALL')
    expect(labels).toContain('SPACE STATION')
    expect(labels).toContain('WEATHER')
    expect(labels).toContain('UNKNOWN')
    // Unknown category not in SECTION_LABELS → underscores→spaces, upper-cased.
    expect(labels).toContain('ODD CAT')
  })

  it('does not render the chip row when only one category is present', async () => {
    const wrapper = await mountReady() // single space_station pass
    expect(wrapper.find('.spp-cat-filter-row').exists()).toBe(false)
  })

  it('marks ALL active and filters the list when a category chip is toggled', async () => {
    twoCategoryPasses()
    const wrapper = await mountReady()
    // Initially ALL is active (no filters set).
    const allChip = wrapper.findAll('.spp-cat-filter-chip')[0]
    expect(allChip.classes()).toContain('spp-cat-filter-chip-active')
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(4)

    // Toggle WEATHER on → only the weather pass shows.
    const weatherChip = wrapper
      .findAll('.spp-cat-filter-chip')
      .find((chip) => chip.text() === 'WEATHER')!
    await weatherChip.trigger('click')
    expect(weatherChip.classes()).toContain('spp-cat-filter-chip-active')
    expect(allChip.classes()).not.toContain('spp-cat-filter-chip-active')
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(1)
  })

  it('toggling the same category chip twice clears the filter again', async () => {
    twoCategoryPasses()
    const wrapper = await mountReady()
    const weatherChip = () =>
      wrapper.findAll('.spp-cat-filter-chip').find((chip) => chip.text() === 'WEATHER')!
    await weatherChip().trigger('click')
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(1)
    await weatherChip().trigger('click') // delete branch
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(4)
  })

  it('clicking ALL clears every active filter', async () => {
    twoCategoryPasses()
    const wrapper = await mountReady()
    const weatherChip = wrapper
      .findAll('.spp-cat-filter-chip')
      .find((chip) => chip.text() === 'WEATHER')!
    await weatherChip.trigger('click')
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(1)
    await wrapper.findAll('.spp-cat-filter-chip')[0].trigger('click') // ALL
    expect(wrapper.findAll('.spp-pass-card')).toHaveLength(4)
  })
})

// =============================================================================
describe('SpacePasses — accordion expand/collapse', () => {
  it('expands a card on click, selecting the satellite and fetching its passes', async () => {
    const control = makeFakeControl()
    const wrapper = await mountReady({ control })
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-pass-card').classes()).toContain('spp-expanded')
    expect(control.switchSatellite).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/space/satellite/25544/passes'),
      expect.anything(),
    )
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
  })

  it('collapses an already-expanded card when clicked again', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
    await wrapper.find('.spp-pass-card').trigger('click')
    await flushPromises()
    expect(wrapper.find('.spp-acc-body').exists()).toBe(false)
  })

  it('works without a satellite control (null-prop path)', async () => {
    const wrapper = await mountReady({ control: null })
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
  })

  it('renders live telemetry once a sat-position-update arrives for the open pass', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '25544',
          position: {
            alt_km: 420,
            velocity_kms: 7.66,
            track_deg: 51,
            lat: 12,
            lon: 34,
            az: 180,
            el: 45,
          },
        },
      }),
    )
    await wrapper.vm.$nextTick()
    const values = wrapper.findAll('.spp-acc-cell-value').map((cell) => cell.text())
    expect(values).toContain('12°') // latitude
    expect(values).toContain('420 km') // altitude
  })

  it('ignores a sat-position-update for a different satellite', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '99999',
          position: { alt_km: 1, velocity_kms: 1, track_deg: 1, lat: 1, lon: 1 },
        },
      }),
    )
    await wrapper.vm.$nextTick()
    // Telemetry stays at the em-dash placeholder.
    expect(wrapper.find('.spp-acc-cell-value').text()).toBe('—')
  })

  it('ignores a sat-position-update when nothing is expanded', async () => {
    const wrapper = await mountReady()
    // No card expanded → handler returns early; nothing to assert beyond no throw.
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '25544',
          position: { alt_km: 1, velocity_kms: 1, track_deg: 1, lat: 1, lon: 1 },
        },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-body').exists()).toBe(false)
  })

  it('shows COULD NOT LOAD PASSES when the accordion fetch is non-OK', async () => {
    accResult = { ok: false, status: 500, body: {} }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-status').text()).toBe('COULD NOT LOAD PASSES')
  })

  it('shows NETWORK ERROR when the accordion fetch rejects', async () => {
    const wrapper = await mountReady()
    fetchOverride = (url) => {
      if (url.includes('/passes') && url.includes('/satellite/'))
        return Promise.reject(new Error('down'))
      return defaultRouter(url)
    }
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-status').text()).toBe('NETWORK ERROR')
  })

  it('shows the set-location prompt in the accordion when location vanishes', async () => {
    // Location present at mount (so the list loads) but gone by accordion fetch.
    let location: [number, number] | null = [10, 50]
    const wrapper = await mountReady({ getUserLocation: () => location })
    location = null
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-status').text()).toBe('SET LOCATION TO CALCULATE PASSES')
  })

  it('renders the no-passes-in-24h note when the accordion returns an empty list', async () => {
    accResult.body = { passes: [], computed_at: new Date().toISOString() }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-no-passes').text()).toContain('No passes in the next 24 hours')
  })
})

// =============================================================================
describe('SpacePasses — restoring a persisted expansion', () => {
  it('re-opens the exact pass that was left expanded', async () => {
    const control = makeFakeControl()
    const wrapper = mountPasses({ control })
    // Set the persisted key to the fixture pass before the refresh re-opens it.
    const pass = makePass()
    const spaceStore = (await import('@/stores/space')).useSpaceStore()
    spaceStore.passesExpandedKey = `${pass.norad_id}_${pass.aos_unix_ms}`
    await (wrapper.vm as unknown as { fetchPasses: () => Promise<void> }).fetchPasses()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
    expect(control.switchSatellite).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
  })

  it('falls back to the same satellite nearest pass when the exact AOS drifted', async () => {
    // Three passes for the same satellite so the reduce callback runs and both
    // the "closer" and "keep best" arms of its ternary are exercised; the target
    // AOS sits on the middle pass.
    passesResult.body = {
      passes: [
        makePass({ aos_unix_ms: NOW + 1_000, los_unix_ms: NOW + 300_000 }),
        makePass({ aos_unix_ms: NOW + 500_000, los_unix_ms: NOW + 800_000 }),
        makePass({ aos_unix_ms: NOW + 900_000, los_unix_ms: NOW + 1_200_000 }),
      ],
      satellite_count: 1,
      computed_at: '',
    }
    const control = makeFakeControl()
    const wrapper = mountPasses({ control })
    const spaceStore = (await import('@/stores/space')).useSpaceStore()
    // Same norad, AOS closest to the middle pass but matching none exactly.
    spaceStore.passesExpandedKey = `25544_${NOW + 500_123}`
    await (wrapper.vm as unknown as { fetchPasses: () => Promise<void> }).fetchPasses()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
  })

  it('clears the persisted key when that satellite has no remaining pass', async () => {
    const wrapper = mountPasses()
    const spaceStore = (await import('@/stores/space')).useSpaceStore()
    spaceStore.passesExpandedKey = `99999_${NOW + 600_000}`
    await (wrapper.vm as unknown as { fetchPasses: () => Promise<void> }).fetchPasses()
    await flushPromises()
    expect(spaceStore.passesExpandedKey).toBe('')
    expect(wrapper.find('.spp-acc-body').exists()).toBe(false)
  })
})

// =============================================================================
describe('SpacePasses — hover preview', () => {
  it('previews on mouse enter and clears (debounced) on mouse leave', async () => {
    vi.useFakeTimers()
    const control = makeFakeControl()
    const wrapper = mountPasses({ control })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    const card = wrapper.find('.spp-pass-card')
    await card.trigger('mouseenter')
    expect(control.previewSatellite).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
    await card.trigger('mouseleave')
    expect(control.clearPreview).not.toHaveBeenCalled() // debounced
    await vi.advanceTimersByTimeAsync(50)
    expect(control.clearPreview).toHaveBeenCalled()
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('cancels a pending clear timer when re-entering before it fires', async () => {
    vi.useFakeTimers()
    const control = makeFakeControl()
    const wrapper = mountPasses({ control })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    const card = wrapper.find('.spp-pass-card')
    await card.trigger('mouseleave') // schedules clear
    await card.trigger('mouseenter') // cancels the pending clear, re-previews
    await vi.advanceTimersByTimeAsync(100)
    expect(control.clearPreview).not.toHaveBeenCalled()
    expect(control.previewSatellite).toHaveBeenCalled()
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('does not throw on hover when no control is present', async () => {
    const wrapper = await mountReady({ control: null })
    const card = wrapper.find('.spp-pass-card')
    await card.trigger('mouseenter')
    await card.trigger('mouseleave')
    expect(wrapper.exists()).toBe(true)
  })
})

// =============================================================================
describe('SpacePasses — track & pass-notification buttons', () => {
  it('tracks the satellite when TRACK SATELLITE is clicked', async () => {
    const control = makeFakeControl()
    const wrapper = await mountReady({ control })
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-track-btn').trigger('click')
    expect(control.switchSatellite).toHaveBeenLastCalledWith('25544', 'ISS (ZARYA)', true)
  })

  it('untracks when already following that satellite', async () => {
    const control = makeFakeControl({ followedNoradId: '25544' })
    const wrapper = await mountReady({ control })
    await expandFirstCard(wrapper)
    const trackBtn = wrapper.find('.spp-acc-track-btn')
    expect(trackBtn.text()).toBe('UNTRACK SATELLITE')
    expect(trackBtn.classes()).toContain('spp-acc-track-btn--active')
    await trackBtn.trigger('click')
    expect(control.stopFollowing).toHaveBeenCalled()
  })

  it('reflects a satellite-follow-changed event in the button state', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('satellite-follow-changed', {
        detail: { noradId: '25544', following: true },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-track-btn').text()).toBe('UNTRACK SATELLITE')
    document.dispatchEvent(
      new CustomEvent('satellite-follow-changed', {
        detail: { noradId: '25544', following: false },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-track-btn').text()).toBe('TRACK SATELLITE')
  })

  it('toggles pass notifications, switching satellite first when not active', async () => {
    const control = makeFakeControl({ activeNoradId: '00000' })
    const wrapper = await mountReady({ control })
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-notif-btn').trigger('click')
    expect(control.switchSatellite).toHaveBeenLastCalledWith('25544', 'ISS (ZARYA)')
    expect(control.togglePassNotifications).toHaveBeenCalled()
  })

  it('does not switch satellite when notif toggled for the already-active sat', async () => {
    const control = makeFakeControl({ activeNoradId: '25544' })
    const wrapper = await mountReady({ control })
    await expandFirstCard(wrapper)
    control.switchSatellite.mockClear()
    await wrapper.find('.spp-acc-notif-btn').trigger('click')
    expect(control.switchSatellite).not.toHaveBeenCalled()
    expect(control.togglePassNotifications).toHaveBeenCalled()
  })

  it('does nothing on notif toggle when no control is present', async () => {
    const wrapper = await mountReady({ control: null })
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-notif-btn').trigger('click')
    expect(wrapper.exists()).toBe(true) // no throw
  })

  it('reflects satellite-pass-notif-changed: enable, then disable for the same sat', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('satellite-pass-notif-changed', {
        detail: { noradId: '25544', enabled: true },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-notif-btn').classes()).toContain('spp-acc-notif-btn--active')
    document.dispatchEvent(
      new CustomEvent('satellite-pass-notif-changed', {
        detail: { noradId: '25544', enabled: false },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-notif-btn').classes()).not.toContain('spp-acc-notif-btn--active')
  })

  it('leaves notif state untouched when a disable event names a different sat', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('satellite-pass-notif-changed', {
        detail: { noradId: '25544', enabled: true },
      }),
    )
    await wrapper.vm.$nextTick()
    document.dispatchEvent(
      new CustomEvent('satellite-pass-notif-changed', {
        detail: { noradId: '99999', enabled: false },
      }),
    )
    await wrapper.vm.$nextTick()
    // Still active for 25544 (the unrelated disable left it alone).
    expect(wrapper.find('.spp-acc-notif-btn').classes()).toContain('spp-acc-notif-btn--active')
  })

  it('opens with notifications pre-armed when the store reports them enabled', async () => {
    vi.mocked(isPassNotifEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-notif-btn').classes()).toContain('spp-acc-notif-btn--active')
  })
})

// =============================================================================
describe('SpacePasses — radio section', () => {
  function radioPass(extra: Partial<SatPass> = {}) {
    passesResult.body = {
      passes: [
        makePass({
          uplink_hz: 145_000_000,
          uplink_mode: 'FM',
          downlink_hz: 1_200_000_000,
          downlink_mode: 'USB',
          ctcss_hz: 88.5,
          transponder_type: 'Linear',
          beacon_hz: 5_000,
          radio_status: 'ACTIVE',
          packet_info: '9600 baud; FSK',
          radio_notes: 'note one; note two',
          ...extra,
        }),
      ],
      satellite_count: 1,
      computed_at: '',
    }
  }

  it('formats uplink/downlink/beacon frequencies across GHz/MHz/kHz units', async () => {
    radioPass()
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const text = wrapper.find('.spp-acc-section--radio').text()
    expect(text).toContain('1.200 GHz') // downlink
    expect(text).toContain('145.000 MHz') // uplink
    expect(text).toContain('5.000 kHz') // beacon
    expect(text).toContain('· FM') // uplink mode
    expect(text).toContain('· USB') // downlink mode
    expect(text).toContain('88.5 Hz') // ctcss
    expect(text).toContain('Linear') // transponder
    expect(text).toContain('Active') // formatStatus(ACTIVE)
  })

  it('renders a sub-kHz frequency in plain Hz', async () => {
    radioPass({ uplink_hz: 500, beacon_hz: undefined, downlink_hz: undefined })
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-section--radio').text()).toContain('500 Hz')
  })

  it('splits packet info and radio notes into list items', async () => {
    radioPass()
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const items = wrapper.findAll('.spp-acc-radio-list li').map((li) => li.text())
    expect(items).toEqual(expect.arrayContaining(['9600 baud', 'FSK', 'note one', 'note two']))
  })

  it('omits the radio section entirely when the pass has no radio info', async () => {
    const wrapper = await mountReady() // plain pass, no radio fields
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-section--radio').exists()).toBe(false)
  })
})

// =============================================================================
describe('SpacePasses — auto-tune & record', () => {
  function downlinkPass() {
    passesResult.body = {
      passes: [makePass({ downlink_hz: 437_000_000, downlink_mode: 'FM' })],
      satellite_count: 1,
      computed_at: '',
    }
  }

  it('arms auto-tune, persisting the setting and adding an alert card', async () => {
    downlinkPass()
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-autotune-btn').trigger('click')
    expect(setAutoTuneEnabled).toHaveBeenCalledWith(
      '25544',
      true,
      expect.objectContaining({ name: 'ISS (ZARYA)', downlinkHz: 437_000_000, downlinkMode: 'FM' }),
    )
    const store = useNotificationsStore()
    expect(store.items.some((i) => i.type === 'autotune' && i.noradId === '25544')).toBe(true)
  })

  it('disarms auto-tune and dismisses its alert card', async () => {
    downlinkPass()
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true) // currently armed
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const store = useNotificationsStore()
    store.add({
      type: 'autotune',
      title: 'ISS (ZARYA)',
      detail: 'Auto-tune on pass enabled',
      noradId: '25544',
      satName: 'ISS (ZARYA)',
    })
    await wrapper.find('.spp-acc-autotune-btn').trigger('click') // enabled=false
    expect(setAutoTuneEnabled).toHaveBeenCalledWith('25544', false, expect.anything())
    expect(store.items.some((i) => i.type === 'autotune' && i.noradId === '25544')).toBe(false)
  })

  it('shows the auto-tune button as active when armed', async () => {
    downlinkPass()
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-autotune-btn').classes()).toContain(
      'spp-acc-autotune-btn--active',
    )
  })

  it('disables the record button until auto-tune is armed', async () => {
    downlinkPass()
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-record-btn').attributes('disabled')).toBeDefined()
  })

  it('arms record while auto-tune is on, folding it into the existing alert card', async () => {
    downlinkPass()
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const store = useNotificationsStore()
    const existingId = store.add({
      type: 'autotune',
      title: 'ISS (ZARYA)',
      detail: 'Auto-tune on pass enabled',
      noradId: '25544',
      satName: 'ISS (ZARYA)',
    })
    await wrapper.find('.spp-acc-record-btn').trigger('click')
    expect(setRecordOnPassEnabled).toHaveBeenCalledWith('25544', true, expect.anything())
    const card = store.items.find((i) => i.id === existingId)!
    expect(card.detail).toBe('Auto-tune and record on pass enabled')
  })

  it('adds a fresh armed card if record is toggled with no existing card', async () => {
    downlinkPass()
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const store = useNotificationsStore()
    expect(store.items).toHaveLength(0)
    await wrapper.find('.spp-acc-record-btn').trigger('click')
    const card = store.items.find((i) => i.type === 'autotune' && i.noradId === '25544')!
    expect(card.detail).toBe('Auto-tune and record on pass enabled')
  })

  it('disarms record, reverting the card detail to auto-tune only', async () => {
    downlinkPass()
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    vi.mocked(isRecordOnPassEnabled).mockReturnValue(true) // currently recording
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const store = useNotificationsStore()
    const id = store.add({
      type: 'autotune',
      title: 'ISS (ZARYA)',
      detail: 'Auto-tune and record on pass enabled',
      noradId: '25544',
      satName: 'ISS (ZARYA)',
    })
    expect(wrapper.find('.spp-acc-record-btn').classes()).toContain('spp-acc-record-btn--active')
    await wrapper.find('.spp-acc-record-btn').trigger('click') // enabled=false
    expect(setRecordOnPassEnabled).toHaveBeenCalledWith('25544', false, expect.anything())
    expect(store.items.find((i) => i.id === id)!.detail).toBe('Auto-tune on pass enabled')
  })

  it('re-reads armed state on a satellite-auto-tune-changed event', async () => {
    downlinkPass()
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-autotune-btn').classes()).not.toContain(
      'spp-acc-autotune-btn--active',
    )
    // External arming: the store now reports armed, and the event nudges reactivity.
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    document.dispatchEvent(
      new CustomEvent('satellite-auto-tune-changed', {
        detail: { noradId: '25544', enabled: true },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-autotune-btn').classes()).toContain(
      'spp-acc-autotune-btn--active',
    )
  })

  it('does not render auto-tune/record buttons for a pass without a downlink', async () => {
    const wrapper = await mountReady() // plain pass, no downlink_hz
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-autotune-btn').exists()).toBe(false)
    expect(wrapper.find('.spp-acc-record-btn').exists()).toBe(false)
  })
})

// =============================================================================
describe('SpacePasses — auto-tune conflict warning', () => {
  it('warns when an armed pass overlaps another armed satellite pass', async () => {
    // Two armed sats with overlapping windows.
    passesResult.body = {
      passes: [
        makePass({
          norad_id: '25544',
          name: 'ISS',
          downlink_hz: 437_000_000,
          aos_unix_ms: NOW + 100_000,
          los_unix_ms: NOW + 400_000,
        }),
        makePass({
          norad_id: '40069',
          name: 'METEOR',
          downlink_hz: 137_000_000,
          aos_unix_ms: NOW + 200_000,
          los_unix_ms: NOW + 500_000,
        }),
      ],
      satellite_count: 2,
      computed_at: '',
    }
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true) // both armed
    const wrapper = await mountReady()
    // Expand the ISS card (first).
    await wrapper.findAll('.spp-pass-card')[0].trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    const warn = wrapper.find('.spp-acc-autotune-warn')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('Overlaps METEOR')
    expect(warn.text()).toContain('earlier pass keeps the radio')
  })

  it('appends a "+N more" suffix when several passes conflict', async () => {
    passesResult.body = {
      passes: [
        makePass({
          norad_id: '1',
          name: 'A',
          downlink_hz: 437_000_000,
          aos_unix_ms: NOW + 100_000,
          los_unix_ms: NOW + 600_000,
        }),
        makePass({
          norad_id: '2',
          name: 'B',
          downlink_hz: 137_000_000,
          aos_unix_ms: NOW + 150_000,
          los_unix_ms: NOW + 300_000,
        }),
        makePass({
          norad_id: '3',
          name: 'C',
          downlink_hz: 138_000_000,
          aos_unix_ms: NOW + 200_000,
          los_unix_ms: NOW + 350_000,
        }),
      ],
      satellite_count: 3,
      computed_at: '',
    }
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await wrapper.findAll('.spp-pass-card')[0].trigger('click') // sat A
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-autotune-warn').text()).toContain('+1 more')
  })

  it('shows no conflict warning when only one satellite is armed', async () => {
    passesResult.body = {
      passes: [makePass({ norad_id: '25544', downlink_hz: 437_000_000 })],
      satellite_count: 1,
      computed_at: '',
    }
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-autotune-warn').exists()).toBe(false)
  })
})

// =============================================================================
describe('SpacePasses — polar plot & upcoming-passes section', () => {
  it('plots the next pass with a sky track and shows its max elevation', async () => {
    accResult.body = {
      passes: [
        makeAccPass({
          aos_unix_ms: NOW + 1_200_000,
          los_unix_ms: NOW + 1_500_000,
          max_elevation_deg: 62.4,
          sky_track: [
            { az: 10, el: 0 },
            { az: 90, el: 45 },
            { az: 170, el: 5 },
          ],
        }),
      ],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.findComponent({ name: 'SatPolarPlot' }).exists()).toBe(true)
    expect(wrapper.find('.spp-acc-polar-title').text()).toContain('NEXT PASS')
    expect(wrapper.find('.spp-acc-polar-maxel').text()).toBe('MAX 62°')
  })

  it('labels and plots a currently-in-progress pass as CURRENT PASS', async () => {
    accResult.body = {
      passes: [
        makeAccPass({
          aos_unix_ms: NOW - 60_000,
          los_unix_ms: NOW + 120_000,
          sky_track: [
            { az: 0, el: 0 },
            { az: 90, el: 30 },
          ],
        }),
      ],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-polar-title').text()).toContain('CURRENT PASS')
  })

  it('shows the live marker only while the plotted pass is in progress', async () => {
    accResult.body = {
      passes: [
        makeAccPass({
          aos_unix_ms: NOW - 60_000,
          los_unix_ms: NOW + 120_000,
          sky_track: [
            { az: 0, el: 0 },
            { az: 90, el: 30 },
          ],
        }),
      ],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '25544',
          position: { alt_km: 400, velocity_kms: 7, track_deg: 90, lat: 0, lon: 0, az: 45, el: 20 },
        },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'SatPolarPlot' }).props('live')).toEqual({
      az: 45,
      el: 20,
    })
  })

  it('falls back to the NO UPCOMING PASS placeholder when no plottable pass exists', async () => {
    accResult.body = { passes: [], computed_at: new Date().toISOString() }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-polar-title').text()).toContain('NEXT PASS')
    expect(wrapper.find('.spp-acc-polar-empty').text()).toBe('NO UPCOMING PASS TO PLOT')
  })

  it('renders the accordion upcoming-pass cards with date/time/countdown', async () => {
    accResult.body = {
      passes: [makeAccPass({ aos_unix_ms: NOW + 1_200_000, los_unix_ms: NOW + 1_500_000 })],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const passCard = wrapper.find('.spp-acc-pass-card')
    expect(passCard.exists()).toBe(true)
    expect(passCard.find('.spp-acc-pass-countdown').text()).toContain('IN ')
    expect(passCard.find('.spp-acc-pass-maxel').text()).toBe('MAX 33.3°')
  })

  it('labels an in-progress accordion pass as NOW', async () => {
    accResult.body = {
      passes: [makeAccPass({ aos_unix_ms: NOW - 30_000, los_unix_ms: NOW + 90_000 })],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    const countdown = wrapper.find('.spp-acc-pass-countdown')
    expect(countdown.text()).toBe('NOW')
    expect(countdown.classes()).toContain('spp-in-progress')
  })
})

// =============================================================================
describe('SpacePasses — lifecycle & status bar', () => {
  it('shows a loading status bar while a fetch is in flight', async () => {
    // Hold the fetch open so the loading state is observable.
    let release: (value: unknown) => void = () => {}
    fetchOverride = () =>
      new Promise((resolve) => {
        release = () => resolve(makeResponse(passesResult))
      }) as Promise<unknown>
    const wrapper = mountPasses()
    await wrapper.vm.$nextTick()
    const bar = wrapper.find('#spp-status-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.classes()).toContain('spp-loading')
    expect(bar.text()).toBe('COMPUTING PASSES…')
    release(null)
    await flushPromises()
    wrapper.unmount()
  })

  it('refreshes the list on the periodic interval', async () => {
    vi.useFakeTimers()
    const wrapper = mountPasses()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    const callsAfterMount = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/api/space/passes')).length
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    await flushPromises()
    const callsAfterInterval = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/api/space/passes')).length
    expect(callsAfterInterval).toBeGreaterThan(callsAfterMount)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('ticks `now` forward each second so countdowns update', async () => {
    vi.useFakeTimers()
    const wrapper = mountPasses()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    // The tick replaces the passes array reference; just assert it runs cleanly.
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('.spp-pass-card').exists()).toBe(true)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('tears down intervals, aborts, and timers on unmount', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const wrapper = mountPasses()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    // Open an accordion (creates accFetchAbort) and schedule a clear-preview timer.
    await wrapper.find('.spp-pass-card').trigger('click')
    await flushPromises()
    await wrapper.find('.spp-pass-card').trigger('mouseleave')
    wrapper.unmount()
    // refreshInterval + tickInterval both cleared.
    expect(clearIntervalSpy).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('clears the location poll on unmount when one is running', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const wrapper = mountPasses({ getUserLocation: () => null })
    await vi.advanceTimersByTimeAsync(0)
    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

// =============================================================================
describe('SpacePasses — branch edge cases', () => {
  it('seeds notif state from the control when pass notifications are already on', async () => {
    // Exercises the init branch that reads activeNoradId when the control reports
    // pass notifications enabled at mount time.
    const control = makeFakeControl({ passNotificationsEnabled: true, activeNoradId: '25544' })
    const wrapper = await mountReady({ control })
    expect(wrapper.find('.spp-pass-card').exists()).toBe(true)
  })

  it('falls back to a generic message when the error response body is not JSON', async () => {
    fetchOverride = (url) => {
      if (url.includes('/api/space/passes')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('not json')),
        })
      }
      return defaultRouter(url)
    }
    const wrapper = await mountReady()
    expect(wrapper.find('.spp-message').text()).toBe('Error 500 — Failed to load passes')
  })

  it('arms auto-tune for an unnamed pass with no downlink mode', async () => {
    passesResult.body = {
      passes: [makePass({ name: '', norad_id: '40069', downlink_hz: 437_000_000 })],
      satellite_count: 1,
      computed_at: '',
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-autotune-btn').trigger('click')
    const call = vi.mocked(setAutoTuneEnabled).mock.calls[0]
    expect(call[2]).toMatchObject({ name: '40069', downlinkHz: 437_000_000 })
    expect(call[2]?.downlinkMode).toBeUndefined()
  })

  it('records an unnamed pass using the norad id as the name', async () => {
    passesResult.body = {
      passes: [makePass({ name: '', norad_id: '40069', downlink_hz: 437_000_000 })],
      satellite_count: 1,
      computed_at: '',
    }
    vi.mocked(isAutoTuneEnabled).mockReturnValue(true)
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    await wrapper.find('.spp-acc-record-btn').trigger('click')
    expect(setRecordOnPassEnabled).toHaveBeenCalledWith('40069', true, { name: '40069' })
  })

  it('uses the norad id when opening, tracking, notifying and hovering an unnamed pass', async () => {
    const control = makeFakeControl({ activeNoradId: '00000' })
    passesResult.body = {
      passes: [makePass({ name: '', norad_id: '40069' })],
      satellite_count: 1,
      computed_at: '',
    }
    const wrapper = await mountReady({ control })
    const card = wrapper.find('.spp-pass-card')
    await card.trigger('mouseenter')
    expect(control.previewSatellite).toHaveBeenCalledWith('40069', '40069')
    await expandFirstCard(wrapper)
    expect(control.switchSatellite).toHaveBeenCalledWith('40069', '40069') // openAccordion
    await wrapper.find('.spp-acc-track-btn').trigger('click')
    expect(control.switchSatellite).toHaveBeenLastCalledWith('40069', '40069', true) // trackSat
    control.switchSatellite.mockClear()
    await wrapper.find('.spp-acc-notif-btn').trigger('click')
    expect(control.switchSatellite).toHaveBeenCalledWith('40069', '40069') // togglePassNotif
  })

  it('clears a pending preview timer when mouse leaves twice in a row', async () => {
    vi.useFakeTimers()
    const control = makeFakeControl()
    const wrapper = mountPasses({ control })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    const card = wrapper.find('.spp-pass-card')
    await card.trigger('mouseleave') // schedules a clear
    await card.trigger('mouseleave') // sees the pending timer, clears + reschedules
    await vi.advanceTimersByTimeAsync(50)
    expect(control.clearPreview).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('plots nothing when the accordion passes are all in the past', async () => {
    accResult.body = {
      passes: [makeAccPass({ aos_unix_ms: NOW - 600_000, los_unix_ms: NOW - 300_000 })],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-polar-title').text()).toContain('NEXT PASS')
    expect(wrapper.find('.spp-acc-polar-empty').text()).toBe('NO UPCOMING PASS TO PLOT')
  })

  it('defaults the accordion list to empty when the response omits passes', async () => {
    accResult.body = { computed_at: new Date().toISOString() } // no `passes` key
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(wrapper.find('.spp-acc-status').text()).toContain('NEXT 24H')
    expect(wrapper.find('.spp-acc-no-passes').exists()).toBe(true)
  })

  it('silently ignores an AbortError from the accordion fetch', async () => {
    const wrapper = await mountReady()
    fetchOverride = (url) => {
      if (url.includes('/satellite/') && url.includes('/passes')) {
        const abortError = new Error('aborted')
        abortError.name = 'AbortError'
        return Promise.reject(abortError)
      }
      return defaultRouter(url)
    }
    await expandFirstCard(wrapper)
    // The catch returns early, leaving the initial computing status untouched.
    expect(wrapper.find('.spp-acc-status').text()).toBe('COMPUTING PASSES…')
  })

  it('aborts an in-flight accordion fetch when a refresh re-opens the card', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper) // first accordion fetch — leaves accFetchAbort set
    let release: (value: unknown) => void = () => {}
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let accCalls = 0
    fetchOverride = (url) => {
      if (url.includes('/satellite/') && url.includes('/passes')) {
        accCalls++
        if (accCalls === 1) return gate.then(() => makeResponse(accResult))
        return makeResponse(accResult)
      }
      return defaultRouter(url)
    }
    // First refresh re-opens the (persisted) card → fetchAccordionPasses runs with
    // accFetchAbort still set, so it aborts the prior controller; that first call
    // then resolves into an aborted signal and bails.
    const vm = wrapper.vm as unknown as { fetchPasses: () => Promise<void> }
    await vm.fetchPasses()
    await flushPromises() // openAccordion fired the gated (1st) call
    await vm.fetchPasses() // 2nd refresh aborts the gated call, fires the 3rd
    release(null)
    await flushPromises()
    expect(wrapper.find('.spp-acc-body').exists()).toBe(true)
  })

  it('warns on a real conflict while skipping duplicate and unarmed passes', async () => {
    passesResult.body = {
      passes: [
        // Armed sat "A" — two passes (the 2nd is a duplicate norad → skipped).
        makePass({
          norad_id: '1',
          name: 'A',
          downlink_hz: 437_000_000,
          aos_unix_ms: NOW + 100_000,
          los_unix_ms: NOW + 400_000,
        }),
        makePass({
          norad_id: '1',
          name: 'A',
          downlink_hz: 437_000_000,
          aos_unix_ms: NOW + 500_000,
          los_unix_ms: NOW + 700_000,
        }),
        // Unarmed sat "B" — skipped by the !isAutoTuneEnabled guard.
        makePass({
          norad_id: '2',
          name: 'B',
          downlink_hz: 137_000_000,
          aos_unix_ms: NOW + 150_000,
          los_unix_ms: NOW + 300_000,
        }),
        // Armed sat "C" — overlaps A → the genuine conflict.
        makePass({
          norad_id: '3',
          name: 'C',
          downlink_hz: 138_000_000,
          aos_unix_ms: NOW + 200_000,
          los_unix_ms: NOW + 350_000,
        }),
      ],
      satellite_count: 4,
      computed_at: '',
    }
    vi.mocked(isAutoTuneEnabled).mockImplementation(
      (noradId: string) => noradId === '1' || noradId === '3',
    )
    const wrapper = await mountReady()
    await wrapper.findAll('.spp-pass-card')[0].trigger('click') // expand sat A
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.spp-acc-autotune-warn').text()).toContain('Overlaps C')
  })

  it('updates telemetry but hides the live marker when look-angles are absent', async () => {
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    // No az/el at all → left operand of the look-angle guard is false.
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '25544',
          position: { alt_km: 410, velocity_kms: 7.6, track_deg: 50, lat: 5, lon: 6 },
        },
      }),
    )
    // az present but el missing → right operand of the guard is false.
    document.dispatchEvent(
      new CustomEvent('sat-position-update', {
        detail: {
          noradId: '25544',
          position: { alt_km: 410, velocity_kms: 7.6, track_deg: 50, lat: 5, lon: 6, az: 90 },
        },
      }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.spp-acc-cell-value').map((cell) => cell.text())).toContain('410 km')
  })
})

// =============================================================================
describe('SpacePasses — accessibility', () => {
  it('has no axe violations in the collapsed list', async () => {
    const wrapper = await mountReady()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  it('has no axe violations with an expanded radio + auto-tune card', async () => {
    passesResult.body = {
      passes: [
        makePass({
          uplink_hz: 145_000_000,
          downlink_hz: 437_000_000,
          downlink_mode: 'FM',
          radio_status: 'ACTIVE',
          packet_info: '9600 baud',
        }),
      ],
      satellite_count: 1,
      computed_at: '',
    }
    accResult.body = {
      passes: [
        makeAccPass({
          sky_track: [
            { az: 0, el: 0 },
            { az: 90, el: 30 },
          ],
        }),
      ],
      computed_at: new Date().toISOString(),
    }
    const wrapper = await mountReady()
    await expandFirstCard(wrapper)
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
