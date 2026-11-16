import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  AdsbTrackingPersistence,
  type AdsbTrackingPersistenceHost,
} from './AdsbTrackingPersistence'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'

const STORAGE_KEY = 'adsbTracking'

function aircraftFeature(overrides: Partial<AircraftProperties> = {}): AircraftGeoFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-1, 51] },
    properties: {
      hex: 'abc123',
      flight: 'BAW123 ',
      r: 'G-EUUA',
      t: 'a320',
      alt_baro: 30000,
      alt_geom: null,
      gs: 400,
      ias: null,
      mach: null,
      track: 90,
      baro_rate: 0,
      nav_altitude: null,
      nav_heading: null,
      category: 'A3',
      emergency: '',
      squawk: '1000',
      squawkEmerg: 0,
      rssi: null,
      military: false,
      stale: 0,
      silhouetteImage: '',
      silhouetteRadiusPx: 0,
      silhouetteRotates: 0,
      ...overrides,
    },
  }
}

function createHost() {
  const state = {
    taggedHex: null as string | null,
    selectedHex: null as string | null,
    following: false,
    features: [] as AircraftGeoFeature[],
    savedIsolatedHex: '',
  }
  const host: AdsbTrackingPersistenceHost = {
    taggedHex: () => state.taggedHex,
    selectedHex: () => state.selectedHex,
    isFollowing: () => state.following,
    features: () => state.features,
    savedIsolatedHex: () => state.savedIsolatedHex,
    applyIsolation: vi.fn(),
    applyTracking: vi.fn(),
  }
  return { host, state }
}

/** The calls fetch received, as [url, init]. */
function fetchCalls(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit | undefined][] {
  return fetchMock.mock.calls as [string, RequestInit | undefined][]
}

function savedHex(): string | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw).hex : undefined
}

/** Let the fetch promise chain settle. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve()
}

let fetchMock: ReturnType<typeof vi.fn>
let host: AdsbTrackingPersistenceHost
let state: ReturnType<typeof createHost>['state']
let persistence: AdsbTrackingPersistence

beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }))
  vi.stubGlobal('fetch', fetchMock)
  ;({ host, state } = createHost())
  persistence = new AdsbTrackingPersistence(host)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---- save ----

describe('save', () => {
  it('saves the followed tagged aircraft and posts it with its trimmed callsign', () => {
    state.following = true
    state.taggedHex = 'abc123'
    state.features = [aircraftFeature()]
    persistence.save()
    expect(savedHex()).toBe('abc123')
    expect(fetchCalls(fetchMock)).toEqual([
      [
        '/api/air/tracking',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: 'abc123', callsign: 'BAW123', follow: true }),
        },
      ],
    ])
  })

  it('falls back to the selected aircraft when no tag is pinned', () => {
    state.following = true
    state.selectedHex = 'sel1'
    persistence.save()
    expect(savedHex()).toBe('sel1')
  })

  it('uses the registration when the aircraft has no callsign', () => {
    state.following = true
    state.taggedHex = 'abc123'
    state.features = [aircraftFeature({ flight: '  ', r: ' G-EUUA ' })]
    persistence.save()
    expect(JSON.parse(fetchCalls(fetchMock)[0]![1]!.body as string).callsign).toBe('G-EUUA')
  })

  it('sends an empty callsign when the aircraft has neither, or is not in the feed', () => {
    state.following = true
    state.taggedHex = 'abc123'
    state.features = [aircraftFeature({ flight: '', r: '' })]
    persistence.save()
    state.features = []
    persistence.save()
    const callsigns = fetchCalls(fetchMock)
      .filter(([url]) => url === '/api/air/tracking')
      .map(([, init]) => JSON.parse(init!.body as string).callsign)
    expect(callsigns).toEqual(['', ''])
  })

  it('tells the backend to forget the previously followed aircraft when it changes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'old/1' }))
    state.following = true
    state.taggedHex = 'abc123'
    persistence.save()
    expect(fetchCalls(fetchMock)[0]).toEqual(['/api/air/tracking/old%2F1', { method: 'DELETE' }])
    expect(savedHex()).toBe('abc123')
  })

  it('does not delete when the followed aircraft is unchanged', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.following = true
    state.taggedHex = 'abc123'
    persistence.save()
    expect(fetchCalls(fetchMock).some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('treats an unreadable saved entry as no previous aircraft', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    state.following = true
    state.taggedHex = 'abc123'
    persistence.save()
    expect(fetchCalls(fetchMock)).toHaveLength(1)
    expect(savedHex()).toBe('abc123')
  })

  it('clears the saved aircraft and deletes it from the backend when nothing is followed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.taggedHex = 'abc123' // tagged but not followed: not tracking
    persistence.save()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(fetchCalls(fetchMock)).toEqual([['/api/air/tracking/abc123', { method: 'DELETE' }]])
  })

  it('clears without a delete when nothing was saved, or the entry is unreadable', () => {
    persistence.save()
    localStorage.setItem(STORAGE_KEY, 'garbage')
    persistence.save()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not follow the selection when following is off', () => {
    state.selectedHex = 'sel1'
    persistence.save()
    expect(savedHex()).toBeUndefined()
  })

  it('ignores a failed request', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'old' }))
    state.following = true
    state.taggedHex = 'abc123'
    persistence.save()
    state.following = false
    persistence.save()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('swallows a storage error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    state.following = true
    state.taggedHex = 'abc123'
    expect(() => persistence.save()).not.toThrow()
  })
})

// ---- restoreIsolation ----

describe('restoreIsolation', () => {
  it('re-isolates the saved aircraft once it is in the feed', () => {
    state.savedIsolatedHex = 'abc123'
    state.features = [aircraftFeature()]
    persistence.restoreIsolation()
    expect(host.applyIsolation).toHaveBeenCalledWith('abc123')
    expect(persistence.isolationRestored).toBe(true)
  })

  it('waits, without marking it restored, while the aircraft is not in the feed', () => {
    state.savedIsolatedHex = 'abc123'
    persistence.restoreIsolation()
    expect(host.applyIsolation).not.toHaveBeenCalled()
    expect(persistence.isolationRestored).toBe(false)
    state.features = [aircraftFeature()]
    persistence.restoreIsolation()
    expect(host.applyIsolation).toHaveBeenCalledTimes(1)
  })

  it('runs only once', () => {
    state.savedIsolatedHex = 'abc123'
    state.features = [aircraftFeature()]
    persistence.restoreIsolation()
    persistence.restoreIsolation()
    expect(host.applyIsolation).toHaveBeenCalledTimes(1)
  })

  it('marks it done with nothing saved', () => {
    persistence.restoreIsolation()
    expect(persistence.isolationRestored).toBe(true)
    expect(host.applyIsolation).not.toHaveBeenCalled()
  })

  it('defers to a followed aircraft', () => {
    state.savedIsolatedHex = 'abc123'
    state.features = [aircraftFeature()]
    state.following = true
    persistence.restoreIsolation()
    expect(persistence.isolationRestored).toBe(true)
    expect(host.applyIsolation).not.toHaveBeenCalled()
  })
})

// ---- applySaved ----

describe('applySaved', () => {
  it('is done with nothing saved', () => {
    expect(persistence.applySaved()).toBe(true)
    expect(host.applyTracking).not.toHaveBeenCalled()
  })

  it('is done when the saved entry has no hex', () => {
    localStorage.setItem(STORAGE_KEY, '{}')
    expect(persistence.applySaved()).toBe(true)
    expect(host.applyTracking).not.toHaveBeenCalled()
  })

  it('is not done while the aircraft is not in the feed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.features = [aircraftFeature({ hex: 'other' })]
    expect(persistence.applySaved()).toBe(false)
    expect(host.applyTracking).not.toHaveBeenCalled()
  })

  it('follows the aircraft again once it is in the feed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    const feature = aircraftFeature()
    state.features = [aircraftFeature({ hex: 'other' }), feature]
    expect(persistence.applySaved()).toBe(true)
    expect(host.applyTracking).toHaveBeenCalledWith(feature)
  })

  it('fails on an unreadable saved entry', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(persistence.applySaved()).toBe(false)
  })

  it('fails when applying the restore throws', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.features = [aircraftFeature()]
    vi.mocked(host.applyTracking).mockImplementation(() => {
      throw new Error('no map')
    })
    expect(persistence.applySaved()).toBe(false)
  })
})

// ---- restoreTracking ----

describe('restoreTracking', () => {
  it("takes the backend's followed aircraft over this browser's, then applies it", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'local' }))
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { hex: 'notfollowed', follow: false },
            { hex: 'abc123', follow: true },
          ]),
      }),
    )
    const feature = aircraftFeature()
    state.features = [feature]
    persistence.restoreTracking()
    await settle()
    expect(fetchCalls(fetchMock)[0]![0]).toBe('/api/air/tracking')
    expect(savedHex()).toBe('abc123')
    expect(host.applyTracking).toHaveBeenCalledWith(feature)
    expect(persistence.trackingRestored).toBe(true)
  })

  it("keeps this browser's entry when the backend follows nothing", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.features = [aircraftFeature()]
    persistence.restoreTracking()
    await settle()
    expect(savedHex()).toBe('abc123')
    expect(host.applyTracking).toHaveBeenCalledTimes(1)
  })

  it('ignores the body of a failed response', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve([{ hex: 'fromerrorpage', follow: true }]),
      }),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    const feature = aircraftFeature()
    state.features = [feature]
    persistence.restoreTracking()
    await settle()
    expect(savedHex()).toBe('abc123')
    expect(host.applyTracking).toHaveBeenCalledWith(feature)
    expect(persistence.trackingRestored).toBe(true)
  })

  it('runs only once while it succeeds', async () => {
    persistence.restoreTracking()
    persistence.restoreTracking()
    await settle()
    persistence.restoreTracking()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tries again on the next call while the aircraft is not in the feed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    persistence.restoreTracking()
    await settle()
    expect(persistence.trackingRestored).toBe(false)
    state.features = [aircraftFeature()]
    persistence.restoreTracking()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(host.applyTracking).toHaveBeenCalledTimes(1)
    expect(persistence.trackingRestored).toBe(true)
  })

  it('falls back to the local entry when the backend is unreachable', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    state.features = [aircraftFeature()]
    persistence.restoreTracking()
    await settle()
    expect(host.applyTracking).toHaveBeenCalledTimes(1)
    expect(persistence.trackingRestored).toBe(true)
  })

  it('tries again later when unreachable and the aircraft is not in the feed', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hex: 'abc123' }))
    persistence.restoreTracking()
    await settle()
    expect(persistence.trackingRestored).toBe(false)
  })
})
