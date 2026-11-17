import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ACTIVE_SATELLITE_STORAGE_KEY,
  FOLLOW_STORAGE_KEY,
  readActiveSatellite,
  readFollowedSatellite,
  saveActiveSatellite,
  saveFollowedSatellite,
} from './satellitePersistence'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('storage keys', () => {
  // Existing installs hold these entries; renaming a key would forget them.
  it('keeps the keys earlier releases wrote', () => {
    expect(FOLLOW_STORAGE_KEY).toBe('sentinel_space_follow')
    expect(ACTIVE_SATELLITE_STORAGE_KEY).toBe('sentinel_space_activeSat')
  })
})

// Both entries are read by the same rules, so each reader runs the same cases.
describe.each([
  { entry: 'followed satellite', storageKey: FOLLOW_STORAGE_KEY, read: readFollowedSatellite },
  {
    entry: 'active satellite',
    storageKey: ACTIVE_SATELLITE_STORAGE_KEY,
    read: readActiveSatellite,
  },
])('reading the $entry', ({ storageKey, read }) => {
  it('returns null when nothing is stored', () => {
    expect(read()).toBeNull()
  })

  it('returns the stored satellite', () => {
    localStorage.setItem(storageKey, JSON.stringify({ noradId: '25544', name: 'ISS (ZARYA)' }))
    expect(read()).toEqual({ noradId: '25544', name: 'ISS (ZARYA)' })
  })

  it('uses the NORAD id as the name when the name is missing or empty', () => {
    localStorage.setItem(storageKey, JSON.stringify({ noradId: '33591' }))
    expect(read()).toEqual({ noradId: '33591', name: '33591' })
    localStorage.setItem(storageKey, JSON.stringify({ noradId: '33591', name: '' }))
    expect(read()).toEqual({ noradId: '33591', name: '33591' })
  })

  it('returns null for an entry without a NORAD id', () => {
    localStorage.setItem(storageKey, JSON.stringify({ name: 'NOAA 19' }))
    expect(read()).toBeNull()
  })

  it('returns null for an empty string entry', () => {
    localStorage.setItem(storageKey, '')
    expect(read()).toBeNull()
  })

  it('returns null for bad JSON instead of throwing', () => {
    localStorage.setItem(storageKey, '{bad json')
    expect(read()).toBeNull()
  })

  it('returns null when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(read()).toBeNull()
  })

  it('reads only its own entry', () => {
    const otherKey =
      storageKey === FOLLOW_STORAGE_KEY ? ACTIVE_SATELLITE_STORAGE_KEY : FOLLOW_STORAGE_KEY
    localStorage.setItem(otherKey, JSON.stringify({ noradId: '25544', name: 'ISS (ZARYA)' }))
    expect(read()).toBeNull()
  })
})

describe('saveFollowedSatellite', () => {
  it('stores the satellite under the follow key, readable back', () => {
    saveFollowedSatellite({ noradId: '28654', name: 'NOAA 18' })
    expect(JSON.parse(localStorage.getItem(FOLLOW_STORAGE_KEY)!)).toEqual({
      noradId: '28654',
      name: 'NOAA 18',
    })
    expect(readFollowedSatellite()).toEqual({ noradId: '28654', name: 'NOAA 18' })
    expect(localStorage.getItem(ACTIVE_SATELLITE_STORAGE_KEY)).toBeNull()
  })

  it('forgets the followed satellite when given null', () => {
    saveFollowedSatellite({ noradId: '28654', name: 'NOAA 18' })
    saveFollowedSatellite(null)
    expect(localStorage.getItem(FOLLOW_STORAGE_KEY)).toBeNull()
    expect(readFollowedSatellite()).toBeNull()
  })

  it('swallows a storage error on save and on forget', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => saveFollowedSatellite({ noradId: '28654', name: 'NOAA 18' })).not.toThrow()
    expect(() => saveFollowedSatellite(null)).not.toThrow()
  })
})

describe('saveActiveSatellite', () => {
  it('stores the satellite under the active key, readable back', () => {
    saveActiveSatellite({ noradId: '25544', name: 'ISS (ZARYA)' })
    expect(JSON.parse(localStorage.getItem(ACTIVE_SATELLITE_STORAGE_KEY)!)).toEqual({
      noradId: '25544',
      name: 'ISS (ZARYA)',
    })
    expect(readActiveSatellite()).toEqual({ noradId: '25544', name: 'ISS (ZARYA)' })
    expect(localStorage.getItem(FOLLOW_STORAGE_KEY)).toBeNull()
  })

  it('overwrites the previous active satellite', () => {
    saveActiveSatellite({ noradId: '25544', name: 'ISS (ZARYA)' })
    saveActiveSatellite({ noradId: '33591', name: 'NOAA 19' })
    expect(readActiveSatellite()).toEqual({ noradId: '33591', name: 'NOAA 19' })
  })

  it('swallows a storage error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveActiveSatellite({ noradId: '25544', name: 'ISS (ZARYA)' })).not.toThrow()
  })
})
