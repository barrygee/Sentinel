import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AircraftEventDetector } from './AircraftEventDetector'
import { useNotificationsStore } from '@/stores/notifications'
import { useAirNotifStore } from '@/stores/airNotif'
import type { ParsedAircraft } from './adsbParse'

vi.mock('@/composables/useNotificationSound', () => ({
  playNotificationSound: vi.fn(),
}))

type NotificationsStore = ReturnType<typeof useNotificationsStore>
type AirNotifStore = ReturnType<typeof useAirNotifStore>

// RAF Benson — used so _nearestAirport resolves to a known airport with an ICAO.
const BENSON: [number, number] = [-1.0972, 51.6164]

function aircraft(
  overrides: Partial<ParsedAircraft> & Pick<ParsedAircraft, 'hex'>,
): ParsedAircraft {
  return {
    lat: BENSON[1],
    lon: BENSON[0],
    alt: 0,
    gs: 0,
    flight: '',
    r: '',
    military: false,
    ...overrides,
  }
}

function notificationsByType(notifications: NotificationsStore, type: string) {
  return notifications.items.filter((item) => item.type === type)
}

let notifications: NotificationsStore
let airNotif: AirNotifStore

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  notifications = useNotificationsStore()
  airNotif = useAirNotifStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AircraftEventDetector departures', () => {
  it('fires a departure for an opted-in aircraft that leaves the ground', () => {
    airNotif.enable('abc123', 'BAW1')
    const detector = new AircraftEventDetector(notifications, airNotif)

    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })]) // on the ground
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })]) // airborne

    const departures = notificationsByType(notifications, 'departure')
    expect(departures).toHaveLength(1)
    expect(departures[0]!.title).toBe('BAW1')
    // Detail is the nearest airport in "Name (ICAO)" form.
    expect(departures[0]!.detail).toMatch(/^.+\s\(.+\)$/)
  })

  it('does not fire a departure without having first been seen on the ground', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)

    // First sighting is already airborne — no prior on-ground state.
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })])
    expect(notificationsByType(notifications, 'departure')).toHaveLength(0)
  })

  it('does not fire a departure for an aircraft that is not opted in', () => {
    const detector = new AircraftEventDetector(notifications, airNotif)
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })])
    expect(notificationsByType(notifications, 'departure')).toHaveLength(0)
  })

  it('does not fire a second departure while the aircraft stays airborne', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })])
    detector.process([aircraft({ hex: 'abc123', alt: 3000, gs: 250 })])
    expect(notificationsByType(notifications, 'departure')).toHaveLength(1)
  })

  it('falls back to registration when no callsign is present', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0, r: 'G-TEST' })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200, r: 'G-TEST' })])
    expect(notificationsByType(notifications, 'departure')[0]!.title).toBe('G-TEST')
  })
})

describe('AircraftEventDetector landings', () => {
  it('fires a landed event for an opted-in aircraft whose altitude drops to zero', () => {
    airNotif.enable('abc123', 'BAW2')
    const detector = new AircraftEventDetector(notifications, airNotif)

    detector.process([aircraft({ hex: 'abc123', alt: 5000, gs: 200 })]) // airborne
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })]) // on the ground

    const landed = notificationsByType(notifications, 'flight')
    expect(landed).toHaveLength(1)
    expect(landed[0]!.title).toBe('BAW2')
    // Detail is the nearest airport in "Name (ICAO)" form.
    expect(landed[0]!.detail).toMatch(/^.+\s\(.+\)$/)
  })

  it('does not fire a landed event for an aircraft that is not opted in', () => {
    const detector = new AircraftEventDetector(notifications, airNotif)
    detector.process([aircraft({ hex: 'abc123', alt: 5000, gs: 200 })])
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    expect(notificationsByType(notifications, 'flight')).toHaveLength(0)
  })

  it('allows a fresh departure after landing again', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })]) // departs
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })]) // lands (resets hasDeparted)
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })]) // departs again

    expect(notificationsByType(notifications, 'departure')).toHaveLength(2)
  })
})

describe('AircraftEventDetector state management', () => {
  it('skips entries without a hex', () => {
    const detector = new AircraftEventDetector(notifications, airNotif)
    expect(() => detector.process([aircraft({ hex: '' })])).not.toThrow()
    expect(notifications.items).toHaveLength(0)
  })

  it('prunes transition state for aircraft that drop out of the feed', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)

    detector.process([aircraft({ hex: 'abc123', alt: 5000, gs: 200 })])
    detector.process([]) // abc123 gone → its prevAlt state is pruned

    // Because the prior altitude was pruned, a later on-ground sighting is NOT
    // read as a landing transition (no prevAlt > 0 remembered).
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    expect(notificationsByType(notifications, 'flight')).toHaveLength(0)
  })

  it('prunes departed/on-ground state so a returning aircraft can depart again', () => {
    airNotif.enable('abc123')
    const detector = new AircraftEventDetector(notifications, airNotif)

    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })]) // seen on ground
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })]) // departs (state set)
    detector.process([]) // drops out → on-ground/departed state pruned

    // Re-appearing fresh: must be seen on the ground again before it can depart.
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })])
    expect(notificationsByType(notifications, 'departure')).toHaveLength(2)
  })
})

describe('AircraftEventDetector with no airports data', () => {
  it('omits the detail line when no nearest airport can be resolved', async () => {
    vi.resetModules()
    vi.doMock('../airports/AirportsControl', () => ({
      AIRPORTS_DATA: { type: 'FeatureCollection', features: [] },
    }))
    vi.doMock('@/composables/useNotificationSound', () => ({ playNotificationSound: vi.fn() }))

    const { AircraftEventDetector: FreshDetector } = await import('./AircraftEventDetector')
    const detector = new FreshDetector(notifications, airNotif)

    airNotif.enable('abc123')
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])
    detector.process([aircraft({ hex: 'abc123', alt: 1500, gs: 200 })])

    const departure = notifications.items.find((item) => item.type === 'departure')!
    expect(departure.detail).toBe('')
    vi.doUnmock('../airports/AirportsControl')
  })

  it('omits the detail line on a landing when no nearest airport can be resolved', async () => {
    vi.resetModules()
    vi.doMock('../airports/AirportsControl', () => ({
      AIRPORTS_DATA: { type: 'FeatureCollection', features: [] },
    }))
    vi.doMock('@/composables/useNotificationSound', () => ({ playNotificationSound: vi.fn() }))

    const { AircraftEventDetector: FreshDetector } = await import('./AircraftEventDetector')
    const detector = new FreshDetector(notifications, airNotif)

    airNotif.enable('abc123')
    detector.process([aircraft({ hex: 'abc123', alt: 5000, gs: 200 })])
    detector.process([aircraft({ hex: 'abc123', alt: 0, gs: 0 })])

    const landed = notifications.items.find((item) => item.type === 'flight')!
    expect(landed.detail).toBe('')
    vi.doUnmock('../airports/AirportsControl')
  })
})
