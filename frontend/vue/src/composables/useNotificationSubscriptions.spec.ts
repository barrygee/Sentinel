import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { computed } from 'vue'
import { useNotificationSubscriptions } from './useNotificationSubscriptions'
import { useAirNotifStore } from '@/stores/airNotif'
import { useAirStore, sentryAlertLocationId, USER_ALERT_LOCATION_ID } from '@/stores/air'
import {
  isPassNotifEnabled,
  setPassNotifEnabled,
  setAutoTuneEnabled,
} from '@/components/space/controls/satellite/passNotifStore'

vi.mock('@/services/settingsApi', () => ({ put: vi.fn(), getNamespace: vi.fn() }))
import * as settingsApi from '@/services/settingsApi'

// The real zones need geolocation and the Sentry poll; stand in with the same
// shape, derived from the air store so switching an alert off shows through.
vi.mock('@/composables/useOverheadAlertZones', () => ({ useOverheadAlertZones: vi.fn() }))
import { useOverheadAlertZones } from '@/composables/useOverheadAlertZones'

const SENTRY_ID = sentryAlertLocationId(3)

function useZonesFromStore(): void {
  vi.mocked(useOverheadAlertZones).mockImplementation(() => {
    const airStore = useAirStore()
    const locations = computed(() =>
      [
        { id: USER_ALERT_LOCATION_ID, label: 'YOU', isUser: true },
        { id: SENTRY_ID, label: 'GATESHEAD', isUser: false },
      ].map((place) => ({ ...place, lon: 0, lat: 51, ...airStore.overheadAlertFor(place.id) })),
    )
    return { locations, activeZones: computed(() => []) }
  })
}

function labels(subscriptions: { label: string }[]): string[] {
  return subscriptions.map((subscription) => subscription.label)
}

describe('useNotificationSubscriptions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.put).mockReset().mockResolvedValue(undefined)
    vi.mocked(settingsApi.getNamespace).mockReset().mockResolvedValue(null)
    useZonesFromStore()
  })

  it('is empty when nothing is switched on', () => {
    const { subscriptions } = useNotificationSubscriptions()
    expect(subscriptions.value).toEqual([])
  })

  it('lists aircraft bells by callsign, falling back to the hex', () => {
    const airNotif = useAirNotifStore()
    airNotif.enable('4ca7b1', 'BAW123')
    airNotif.enable('abc123')
    const { subscriptions } = useNotificationSubscriptions()
    expect(subscriptions.value).toEqual([
      { key: 'aircraft:4ca7b1', label: 'BAW123 — landing & departure' },
      { key: 'aircraft:abc123', label: 'abc123 — landing & departure' },
    ])
  })

  it('lists satellite pass bells, but not auto-tune-only satellites', () => {
    setPassNotifEnabled('25544', true, 'ISS (ZARYA)')
    setAutoTuneEnabled('40069', true, {
      name: 'METEOR-M 2',
      downlinkHz: 137100000,
      downlinkMode: 'WFM',
    })
    const { subscriptions } = useNotificationSubscriptions()
    expect(subscriptions.value).toEqual([
      { key: 'satellite:25544', label: 'ISS (ZARYA) — pass alert' },
    ])
  })

  it('falls back to the NORAD id for a satellite saved without a name', () => {
    localStorage.setItem('space_pass_notifs', JSON.stringify({ '99999': { name: '', bell: true } }))
    const { subscriptions } = useNotificationSubscriptions()
    expect(labels(subscriptions.value)).toEqual(['99999 — pass alert'])
  })

  it('lists each overhead alert that is on, per place and aircraft kind', () => {
    const airStore = useAirStore()
    airStore.setOverheadAlert(USER_ALERT_LOCATION_ID, { civil: true })
    airStore.setOverheadAlert(SENTRY_ID, { mil: true })
    const { subscriptions } = useNotificationSubscriptions()
    expect(subscriptions.value).toEqual([
      { key: 'overhead:user:civil', label: 'Sentinel location — civil aircraft overhead' },
      { key: `overhead:${SENTRY_ID}:mil`, label: 'Sentry: GATESHEAD — military aircraft overhead' },
    ])
  })

  it('refresh() re-reads satellite bells switched on elsewhere and reloads overhead alerts', async () => {
    const { subscriptions, refresh } = useNotificationSubscriptions()
    expect(subscriptions.value).toEqual([])
    setPassNotifEnabled('25544', true, 'ISS (ZARYA)')
    // The pass store is not reactive, so the list only catches up on refresh.
    expect(subscriptions.value).toEqual([])
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      overheadAlerts: { user: { civil: false, mil: true, radiusNm: 5 } },
    })
    refresh()
    await vi.waitFor(() =>
      expect(labels(subscriptions.value)).toEqual([
        'ISS (ZARYA) — pass alert',
        'Sentinel location — military aircraft overhead',
      ]),
    )
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('air')
  })

  describe('turnOff', () => {
    it('switches off exactly the given subscriptions', async () => {
      const airNotif = useAirNotifStore()
      airNotif.enable('4ca7b1', 'BAW123')
      airNotif.enable('abc123')
      setPassNotifEnabled('25544', true, 'ISS (ZARYA)')
      const { subscriptions, turnOff } = useNotificationSubscriptions()

      await turnOff(['aircraft:4ca7b1', 'satellite:25544'])

      expect(airNotif.isEnabled('4ca7b1')).toBe(false)
      expect(airNotif.isEnabled('abc123')).toBe(true)
      expect(isPassNotifEnabled('25544')).toBe(false)
      expect(labels(subscriptions.value)).toEqual(['abc123 — landing & departure'])
      // Bells live in this browser only — nothing goes to the backend.
      expect(settingsApi.put).not.toHaveBeenCalled()
    })

    it('turns off one overhead flag and saves overhead alerts to the backend', async () => {
      const airStore = useAirStore()
      airStore.setOverheadAlert(SENTRY_ID, { civil: true, mil: true, radiusNm: 7 })
      const { turnOff } = useNotificationSubscriptions()

      // The Sentry location id itself contains a colon.
      await turnOff([`overhead:${SENTRY_ID}:mil`])

      expect(airStore.overheadAlertFor(SENTRY_ID)).toEqual({ civil: true, mil: false, radiusNm: 7 })
      expect(settingsApi.put).toHaveBeenCalledWith('air', 'overheadAlerts', airStore.overheadAlerts)
    })

    it('ignores unknown kinds and overhead keys with no valid flag', async () => {
      const airStore = useAirStore()
      airStore.setOverheadAlert(USER_ALERT_LOCATION_ID, { civil: true })
      const { turnOff } = useNotificationSubscriptions()

      await turnOff(['mystery:1', 'overhead:user:radius'])

      expect(airStore.overheadAlertFor(USER_ALERT_LOCATION_ID).civil).toBe(true)
      expect(settingsApi.put).not.toHaveBeenCalled()
    })
  })
})
