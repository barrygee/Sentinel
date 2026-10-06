import { describe, it, expect, beforeEach } from 'vitest'
import { satellitePassSubscriptions } from './satelliteNotificationSubscriptions'
import { isPassNotifEnabled, setPassNotifEnabled } from './controls/satellite/passNotifStore'

describe('satellitePassSubscriptions', () => {
  beforeEach(() => localStorage.clear())

  it('sits between the aircraft bells and the overhead alerts', () => {
    expect(satellitePassSubscriptions.kind).toBe('satellite')
    expect(satellitePassSubscriptions.order).toBe(20)
  })

  it('lists only satellites whose pass bell is on, by name', () => {
    setPassNotifEnabled('25544', true, 'ISS (ZARYA)')
    setPassNotifEnabled('20580', true, 'HST')
    setPassNotifEnabled('20580', false)

    expect(satellitePassSubscriptions.list()).toEqual([
      { id: '25544', label: 'ISS (ZARYA) — pass alert' },
    ])
  })

  it('falls back to the NORAD id when a stored entry has no name', () => {
    // The store always names an entry it writes; an unnamed one can only come
    // from storage written by an older build, so seed it directly.
    localStorage.setItem('space_pass_notifs', JSON.stringify({ '43013': { name: '', bell: true } }))
    expect(satellitePassSubscriptions.list()).toEqual([
      { id: '43013', label: '43013 — pass alert' },
    ])
  })

  it('turns off each pass bell it is given', () => {
    setPassNotifEnabled('25544', true, 'ISS (ZARYA)')
    setPassNotifEnabled('43013', true, 'NOAA 20')

    satellitePassSubscriptions.turnOff(['25544'])

    expect(isPassNotifEnabled('25544')).toBe(false)
    expect(isPassNotifEnabled('43013')).toBe(true)
  })
})
