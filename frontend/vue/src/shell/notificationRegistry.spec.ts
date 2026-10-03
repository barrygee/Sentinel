import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NotificationItem } from '@/stores/notifications'
import {
  findNotificationTarget,
  registerNotificationDismissHook,
  registerNotificationTarget,
  resetNotificationRegistryForTests,
  runNotificationDismissHooks,
  type NotificationTarget,
} from './notificationRegistry'

function alert(fields: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 'n1', type: 'system', title: 'T', detail: '', ts: 0, ...fields }
}

function target(sectionId: string, priority: number, field: 'hex' | 'noradId'): NotificationTarget {
  return { sectionId, priority, matches: (item) => Boolean(item[field]), open: vi.fn() }
}

beforeEach(() => {
  resetNotificationRegistryForTests()
})

describe('notification targets', () => {
  it('finds nothing when no section registered a target', () => {
    expect(findNotificationTarget(alert({ hex: 'ab1234' }))).toBeUndefined()
  })

  it('finds the target that matches the alert', () => {
    const air = target('air', 20, 'hex')
    const space = target('space', 10, 'noradId')
    registerNotificationTarget(air)
    registerNotificationTarget(space)

    expect(findNotificationTarget(alert({ hex: 'ab1234' }))).toBe(air)
    expect(findNotificationTarget(alert({ noradId: '25544' }))).toBe(space)
    expect(findNotificationTarget(alert())).toBeUndefined()
  })

  it('prefers the lower priority when an alert matches two, whatever the registration order', () => {
    const air = target('air', 20, 'hex')
    const space = target('space', 10, 'noradId')
    registerNotificationTarget(air)
    registerNotificationTarget(space)

    expect(findNotificationTarget(alert({ hex: 'ab1234', noradId: '25544' }))).toBe(space)
  })

  it('refuses a second target from the same section', () => {
    registerNotificationTarget(target('air', 20, 'hex'))
    expect(() => registerNotificationTarget(target('air', 30, 'hex'))).toThrow(
      'Section "air" already registered a notification target',
    )
  })
})

describe('notification dismiss hooks', () => {
  it('runs nothing for a type without hooks', () => {
    expect(() => runNotificationDismissHooks(alert({ type: 'autotune' }))).not.toThrow()
  })

  it('runs every hook for the alert’s type, in registration order, and only those', () => {
    const calls: string[] = []
    registerNotificationDismissHook('autotune', (item) => void calls.push(`first ${item.id}`))
    registerNotificationDismissHook('autotune', (item) => void calls.push(`second ${item.id}`))
    registerNotificationDismissHook('system', () => void calls.push('system'))

    runNotificationDismissHooks(alert({ id: 'a1', type: 'autotune' }))

    expect(calls).toEqual(['first a1', 'second a1'])
  })
})
