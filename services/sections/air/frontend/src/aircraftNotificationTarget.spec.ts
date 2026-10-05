import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { NotificationItem } from '@sentinel/shell-api/stores/notifications'
import {
  aircraftNotificationTarget,
  clearAircraftClickHandler,
  getAircraftClickHandler,
  registerAircraftClickHandler,
  resetAircraftNotificationTargetForTests,
} from './aircraftNotificationTarget'

function alert(fields: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 'n1', type: 'flight', title: 'BAW123', detail: '', ts: 0, ...fields }
}

function fakeRouter() {
  const push = vi.fn().mockResolvedValue(undefined)
  return { router: { push } as unknown as Router, push }
}

beforeEach(() => {
  resetAircraftNotificationTargetForTests()
})

describe('aircraft notification target', () => {
  it('belongs to Air and sorts after the satellite target', () => {
    expect(aircraftNotificationTarget.sectionId).toBe('air')
    expect(aircraftNotificationTarget.priority).toBe(20)
  })

  it('matches only alerts carrying an aircraft hex', () => {
    expect(aircraftNotificationTarget.matches(alert({ hex: 'ab1234' }))).toBe(true)
    expect(aircraftNotificationTarget.matches(alert())).toBe(false)
    expect(aircraftNotificationTarget.matches(alert({ hex: '' }))).toBe(false)
  })

  it('focuses the aircraft through the mounted Air map', () => {
    const handler = vi.fn()
    registerAircraftClickHandler(handler)
    const { router, push } = fakeRouter()

    aircraftNotificationTarget.open(alert({ hex: 'ab1234' }), { router })

    expect(handler).toHaveBeenCalledWith('ab1234')
    expect(push).not.toHaveBeenCalled()
  })

  it('routes to Air and hands the aircraft over once the map registers', () => {
    const { router, push } = fakeRouter()

    aircraftNotificationTarget.open(alert({ hex: 'ab1234' }), { router })
    expect(push).toHaveBeenCalledWith('/air/')

    const handler = vi.fn()
    registerAircraftClickHandler(handler)
    expect(handler).toHaveBeenCalledWith('ab1234')
  })

  it('hands a stashed aircraft over only once', () => {
    aircraftNotificationTarget.open(alert({ hex: 'ab1234' }), fakeRouter())
    registerAircraftClickHandler(vi.fn())

    const second = vi.fn()
    registerAircraftClickHandler(second)

    expect(second).not.toHaveBeenCalled()
  })

  it('routes again after the Air map unmounts and clears its handler', () => {
    const handler = vi.fn()
    registerAircraftClickHandler(handler)
    clearAircraftClickHandler()
    expect(getAircraftClickHandler()).toBeNull()
    const { router, push } = fakeRouter()

    aircraftNotificationTarget.open(alert({ hex: 'ab1234' }), { router })

    expect(handler).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/air/')
  })

  it('exposes the mounted handler for the overhead alerts service', () => {
    const handler = vi.fn()
    registerAircraftClickHandler(handler)
    expect(getAircraftClickHandler()).toBe(handler)
  })
})
