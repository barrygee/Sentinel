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

// Build a hover-tag element optionally containing the bell button and an SVG.
function makeTagElement(options: { withButton?: boolean; withSvg?: boolean; withSlash?: boolean }) {
  const tag = document.createElement('div')
  if (options.withButton) {
    const button = document.createElement('button')
    button.className = 'iss-notif-btn'
    if (options.withSvg) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      if (options.withSlash) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        svg.appendChild(line)
      }
      button.appendChild(svg)
    }
    tag.appendChild(button)
  }
  return tag
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

describe('SatellitePassNotifier.wireButton', () => {
  it('does nothing when the element has no bell button', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: false })
    expect(() => notifier.wireButton(tag)).not.toThrow()
  })

  it('stops mousedown propagation on the button', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    const event = new MouseEvent('mousedown', { bubbles: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    button.dispatchEvent(event)
    expect(stopSpy).toHaveBeenCalled()
  })

  it('toggles enabled on click even when the button has no svg', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true, withSvg: false })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(isPassNotifEnabled(NORAD)).toBe(true)
  })

  it('removes the slash and marks active when enabling with an svg', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true, withSvg: true, withSlash: true })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(button.classList.contains('iss-notif-btn--active')).toBe(true)
    expect(button.querySelector('line')).toBeNull()
  })

  it('adds a slash and clears active when disabling with an svg', () => {
    // Start enabled so the click disables.
    setPassNotifEnabled(NORAD, true, SAT_NAME)
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true, withSvg: true, withSlash: false })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(button.classList.contains('iss-notif-btn--active')).toBe(false)
    const slash = button.querySelector('line')
    expect(slash).not.toBeNull()
    expect(slash!.getAttribute('x1')).toBe('1.5')
    expect(slash!.getAttribute('stroke-linecap')).toBe('square')
  })

  it('marks active without touching slashes when enabling an svg that has none', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true, withSvg: true, withSlash: false })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(button.classList.contains('iss-notif-btn--active')).toBe(true)
    // Enabling without an existing slash leaves the svg slash-free (no add).
    expect(button.querySelector('line')).toBeNull()
  })

  it('clears active without adding a slash when disabling an svg that already has one', () => {
    setPassNotifEnabled(NORAD, true, SAT_NAME)
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true, withSvg: true, withSlash: true })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(button.classList.contains('iss-notif-btn--active')).toBe(false)
    // The pre-existing slash is left in place (not duplicated).
    expect(button.querySelectorAll('line')).toHaveLength(1)
  })

  it('stops click propagation', () => {
    const notifier = new SatellitePassNotifier(makeContext())
    const tag = makeTagElement({ withButton: true })
    notifier.wireButton(tag)
    const button = tag.querySelector('.iss-notif-btn') as HTMLElement

    const event = new MouseEvent('click', { bubbles: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    button.dispatchEvent(event)
    expect(stopSpy).toHaveBeenCalled()
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
