import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { computed } from 'vue'
import {
  aircraftBellSubscriptions,
  overheadAlertSubscriptions,
  resetAirNotificationSubscriptionsForTests,
} from './airNotificationSubscriptions'
import { useAirNotifStore } from './stores/airNotif'
import { useAirStore, sentryAlertLocationId, USER_ALERT_LOCATION_ID } from './stores/air'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ put: vi.fn(), getNamespace: vi.fn() }))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

// The real zones need geolocation and the Sentry poll; stand in with the same
// shape, derived from the air store so switching an alert off shows through.
vi.mock('./composables/useOverheadAlertZones', () => ({ useOverheadAlertZones: vi.fn() }))
import { useOverheadAlertZones } from './composables/useOverheadAlertZones'

const SENTRY_ID = sentryAlertLocationId(3)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  resetAirNotificationSubscriptionsForTests()
  vi.mocked(settingsApi.put).mockReset().mockResolvedValue(undefined)
  vi.mocked(settingsApi.getNamespace).mockReset().mockResolvedValue(null)
  vi.mocked(useOverheadAlertZones)
    .mockReset()
    .mockImplementation(() => {
      const airStore = useAirStore()
      const locations = computed(() =>
        [
          { id: USER_ALERT_LOCATION_ID, label: 'YOU', isUser: true },
          { id: SENTRY_ID, label: 'GATESHEAD', isUser: false },
        ].map((place) => ({ ...place, lon: 0, lat: 51, ...airStore.overheadAlertFor(place.id) })),
      )
      return { locations, activeZones: computed(() => []) }
    })
})

describe('aircraftBellSubscriptions', () => {
  it('comes first in the Alerts card', () => {
    expect(aircraftBellSubscriptions.kind).toBe('aircraft')
    expect(aircraftBellSubscriptions.order).toBe(10)
  })

  it('lists each belled aircraft by callsign', () => {
    const airNotif = useAirNotifStore()
    airNotif.enable('4ca7b1', 'BAW123')

    expect(aircraftBellSubscriptions.list()).toEqual([
      { id: '4ca7b1', label: `${airNotif.callsignFor('4ca7b1')} — landing & departure` },
    ])
    expect(aircraftBellSubscriptions.list()[0]!.label).toContain('BAW123')
  })

  it('turns off only the bells it is given', () => {
    const airNotif = useAirNotifStore()
    airNotif.enable('4ca7b1', 'BAW123')
    airNotif.enable('abc123')

    aircraftBellSubscriptions.turnOff(['4ca7b1'])

    expect(airNotif.isEnabled('4ca7b1')).toBe(false)
    expect(airNotif.isEnabled('abc123')).toBe(true)
  })
})

describe('overheadAlertSubscriptions', () => {
  it('comes after the satellite pass bells', () => {
    expect(overheadAlertSubscriptions.kind).toBe('overhead')
    expect(overheadAlertSubscriptions.order).toBe(30)
  })

  it('lists nothing while no overhead alert is on', () => {
    expect(overheadAlertSubscriptions.list()).toEqual([])
  })

  it('lists each place and aircraft kind that is on', () => {
    const airStore = useAirStore()
    airStore.setOverheadAlert(USER_ALERT_LOCATION_ID, { civil: true })
    airStore.setOverheadAlert(SENTRY_ID, { civil: true, mil: true })

    expect(overheadAlertSubscriptions.list()).toEqual([
      { id: 'user:civil', label: 'Sentinel location — civil aircraft overhead' },
      { id: `${SENTRY_ID}:civil`, label: 'Sentry: GATESHEAD — civil aircraft overhead' },
      { id: `${SENTRY_ID}:mil`, label: 'Sentry: GATESHEAD — military aircraft overhead' },
    ])
  })

  it('builds the zones once and reuses them', () => {
    overheadAlertSubscriptions.list()
    overheadAlertSubscriptions.list()
    expect(useOverheadAlertZones).toHaveBeenCalledTimes(1)
  })

  it('refresh() reloads the overhead alerts from the config database', () => {
    const load = vi.spyOn(useAirStore(), 'loadOverheadAlertsFromConfig').mockResolvedValue()
    overheadAlertSubscriptions.refresh!()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('turns off one flag of a Sentry location (whose id has a colon) and saves', async () => {
    const airStore = useAirStore()
    airStore.setOverheadAlert(SENTRY_ID, { civil: true, mil: true, radiusNm: 7 })

    await overheadAlertSubscriptions.turnOff([`${SENTRY_ID}:mil`])

    expect(airStore.overheadAlertFor(SENTRY_ID)).toEqual({ civil: true, mil: false, radiusNm: 7 })
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'overheadAlerts', airStore.overheadAlerts)
  })

  it('ignores ids with no valid flag and saves nothing', async () => {
    const airStore = useAirStore()
    airStore.setOverheadAlert(USER_ALERT_LOCATION_ID, { civil: true })

    await overheadAlertSubscriptions.turnOff(['user:radius'])

    expect(airStore.overheadAlertFor(USER_ALERT_LOCATION_ID).civil).toBe(true)
    expect(settingsApi.put).not.toHaveBeenCalled()
  })
})
