import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { NotificationItem } from '@sentinel/shell-api/stores/notifications'
import { isAutoTuneEnabled, setAutoTuneEnabled } from './controls/satellite/passNotifStore'
import {
  cancelAutoTuneOnDismiss,
  clearSatelliteClickHandler,
  getSatelliteClickHandler,
  registerSatelliteClickHandler,
  resetSatelliteNotificationTargetForTests,
  satelliteNotificationTarget,
} from './satelliteNotificationTarget'

function alert(fields: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 'n1', type: 'autotune', title: 'ISS PASS', detail: '', ts: 0, ...fields }
}

function fakeRouter() {
  const push = vi.fn().mockResolvedValue(undefined)
  return { router: { push } as unknown as Router, push }
}

beforeEach(() => {
  resetSatelliteNotificationTargetForTests()
  localStorage.clear()
})

describe('satellite notification target', () => {
  it('belongs to Space and sorts before the aircraft target', () => {
    expect(satelliteNotificationTarget.sectionId).toBe('space')
    expect(satelliteNotificationTarget.priority).toBe(10)
  })

  it('matches only alerts carrying a NORAD id', () => {
    expect(satelliteNotificationTarget.matches(alert({ noradId: '25544' }))).toBe(true)
    expect(satelliteNotificationTarget.matches(alert())).toBe(false)
  })

  it('focuses the satellite through the mounted Space map, by its clean name', () => {
    const handler = vi.fn()
    registerSatelliteClickHandler(handler)
    const { router, push } = fakeRouter()

    satelliteNotificationTarget.open(alert({ noradId: '25544', satName: 'ISS (ZARYA)' }), {
      router,
    })

    expect(handler).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to the title, then the NORAD id, for the name', () => {
    const handler = vi.fn()
    registerSatelliteClickHandler(handler)

    satelliteNotificationTarget.open(alert({ noradId: '25544' }), fakeRouter())
    satelliteNotificationTarget.open(alert({ noradId: '25544', title: '' }), fakeRouter())

    expect(handler.mock.calls).toEqual([
      ['25544', 'ISS PASS'],
      ['25544', '25544'],
    ])
  })

  it('routes to Space and hands the satellite over once the map registers', () => {
    const { router, push } = fakeRouter()

    satelliteNotificationTarget.open(alert({ noradId: '25544', satName: 'ISS' }), { router })
    expect(push).toHaveBeenCalledWith('/space/')

    const handler = vi.fn()
    registerSatelliteClickHandler(handler)
    expect(handler).toHaveBeenCalledWith('25544', 'ISS')

    const later = vi.fn()
    registerSatelliteClickHandler(later)
    expect(later).not.toHaveBeenCalled()
  })

  it('routes again after the Space map clears its handler', () => {
    registerSatelliteClickHandler(vi.fn())
    clearSatelliteClickHandler()
    expect(getSatelliteClickHandler()).toBeNull()
    const { router, push } = fakeRouter()

    satelliteNotificationTarget.open(alert({ noradId: '25544' }), { router })

    expect(push).toHaveBeenCalledWith('/space/')
  })
})

describe('cancelAutoTuneOnDismiss', () => {
  const changes: CustomEvent[] = []
  function record(event: Event): void {
    changes.push(event as CustomEvent)
  }
  beforeEach(() => {
    changes.length = 0
    document.addEventListener('satellite-auto-tune-changed', record)
  })
  afterEach(() => {
    document.removeEventListener('satellite-auto-tune-changed', record)
  })

  it('turns auto-tune off for the card’s satellite and announces it', () => {
    setAutoTuneEnabled('25544', true)

    cancelAutoTuneOnDismiss(alert({ noradId: '25544' }))

    expect(isAutoTuneEnabled('25544')).toBe(false)
    expect(changes.map((event) => event.detail)).toEqual([{ noradId: '25544', enabled: false }])
  })

  it('does nothing when auto-tune is already off', () => {
    cancelAutoTuneOnDismiss(alert({ noradId: '25544' }))

    expect(changes).toEqual([])
  })

  it('does nothing for a card without a satellite', () => {
    cancelAutoTuneOnDismiss(alert())

    expect(changes).toEqual([])
  })
})
