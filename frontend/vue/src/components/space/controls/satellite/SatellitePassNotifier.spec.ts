import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { SatellitePassNotifier, type SatellitePassNotifierContext } from './SatellitePassNotifier'
import { useNotificationsStore } from '@/stores/notifications'
import { isPassNotifEnabled, setPassNotifEnabled } from './passNotifStore'

const NORAD = '25544'
const SAT_NAME = 'ISS (ZARYA)'

let notificationsStore: ReturnType<typeof useNotificationsStore>
let userLocation: [number, number] | null
let changedEvents: Array<{ noradId: string; enabled: boolean }>

function onChanged(event: Event): void {
  changedEvents.push((event as CustomEvent).detail)
}

function makeContext(
  overrides: Partial<SatellitePassNotifierContext> = {},
): SatellitePassNotifierContext {
  return {
    notificationsStore,
    getUserLocation: () => userLocation,
    getActiveNoradId: () => NORAD,
    getActiveSatName: () => SAT_NAME,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  notificationsStore = useNotificationsStore()
  userLocation = [10, 20]
  changedEvents = []
  document.addEventListener('satellite-pass-notif-changed', onChanged)
})

afterEach(() => {
  document.removeEventListener('satellite-pass-notif-changed', onChanged)
  vi.useRealTimers()
  localStorage.clear()
})

describe('SatellitePassNotifier.enabled', () => {
  it('reflects the persisted enabled flag for the active satellite', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    expect(notifier.enabled).toBe(false)
    setPassNotifEnabled(NORAD, true, SAT_NAME)
    expect(notifier.enabled).toBe(true)
  })
})

describe('SatellitePassNotifier lifecycle no-ops', () => {
  it('onActivated and stop are safe to call', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    expect(() => {
      notifier.onActivated()
      notifier.stop()
    }).not.toThrow()
  })
})

describe('SatellitePassNotifier.toggleEnabled', () => {
  it('enables notifications, fires the change event, and adds a tracking alert', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    notifier.toggleEnabled()

    expect(isPassNotifEnabled(NORAD)).toBe(true)
    expect(changedEvents).toEqual([{ noradId: NORAD, enabled: true }])
    const alert = notificationsStore.items.find((i) => i.detail === 'Pass notifications enabled')
    expect(alert).toMatchObject({ type: 'tracking', title: SAT_NAME, noradId: NORAD })
    expect(alert!.action?.label).toBe('DISABLE NOTIFICATIONS')
  })

  it('disabling fires the change event and dismisses the enabled alert', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    notifier.toggleEnabled() // enable
    changedEvents = []
    notifier.toggleEnabled() // disable

    expect(isPassNotifEnabled(NORAD)).toBe(false)
    expect(changedEvents).toEqual([{ noradId: NORAD, enabled: false }])
    expect(notificationsStore.items.find((i) => i.detail === 'Pass notifications enabled')).toBe(
      undefined,
    )
  })

  it('the alert action callback disables notifications for that satellite', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    notifier.toggleEnabled()
    const alert = notificationsStore.items.find((i) => i.detail === 'Pass notifications enabled')!
    changedEvents = []

    alert.action!.callback()

    expect(isPassNotifEnabled(NORAD)).toBe(false)
    expect(changedEvents).toEqual([{ noradId: NORAD, enabled: false }])
  })
})

describe('SatellitePassNotifier deferred enable (no location yet)', () => {
  it('waits for a location, then enables and fires the change event', () => {
    vi.useFakeTimers()
    userLocation = null
    const notifier = new SatellitePassNotifier(makeContext())
    notifier.toggleEnabled()

    // Nothing enabled yet — still waiting for a location.
    expect(isPassNotifEnabled(NORAD)).toBe(false)
    expect(changedEvents).toEqual([])

    // No notification alert is added on the deferred path.
    expect(notificationsStore.items).toHaveLength(0)

    userLocation = [1, 2]
    vi.advanceTimersByTime(500)

    expect(isPassNotifEnabled(NORAD)).toBe(true)
    expect(changedEvents).toEqual([{ noradId: NORAD, enabled: true }])
  })

  it('gives up after 30s if no location ever arrives', () => {
    vi.useFakeTimers()
    userLocation = null
    const notifier = new SatellitePassNotifier(makeContext())
    notifier.toggleEnabled()

    vi.advanceTimersByTime(30000)
    // Now a location appears, but the poller has already been cleared.
    userLocation = [1, 2]
    vi.advanceTimersByTime(5000)

    expect(isPassNotifEnabled(NORAD)).toBe(false)
    expect(changedEvents).toEqual([])
  })
})

describe('SatellitePassNotifier._dismissEnabledAlert filtering', () => {
  it('dismisses only matching tracking alerts, leaving others intact', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    // A matching alert for our satellite, plus two that must survive.
    notificationsStore.add({
      type: 'tracking',
      title: SAT_NAME,
      detail: 'Pass notifications enabled',
      noradId: NORAD,
    })
    notificationsStore.add({
      type: 'tracking',
      title: 'Other',
      detail: 'Pass notifications enabled',
      noradId: '99999',
    })
    notificationsStore.add({
      type: 'tracking',
      title: SAT_NAME,
      detail: 'Some other detail',
      noradId: NORAD,
    })
    // Mark enabled so toggleEnabled takes the disable branch and dismisses.
    setPassNotifEnabled(NORAD, true, SAT_NAME)

    notifier.toggleEnabled()

    const remaining = notificationsStore.items
    expect(
      remaining.some((i) => i.noradId === NORAD && i.detail === 'Pass notifications enabled'),
    ).toBe(false)
    expect(remaining.some((i) => i.noradId === '99999')).toBe(true)
    expect(remaining.some((i) => i.detail === 'Some other detail')).toBe(true)
  })
})
