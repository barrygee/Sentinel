import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { useAirNotifStore } from '../stores/airNotif'
import { useAircraftAlertToggle } from './useAircraftAlertToggle'
import type { AdsbLiveControl } from '../controls/adsb/AdsbLiveControl'

function makeControl(features: Array<Record<string, unknown>> = []) {
  return {
    _geojson: { features: features.map((properties) => ({ properties })) },
    _trackingNotifIds: null as Record<string, string> | null,
    _rebuildTagForHex: vi.fn(),
  }
}

function setup(control: ReturnType<typeof makeControl> | null) {
  const notifications = useNotificationsStore()
  const airNotif = useAirNotifStore()
  let nextId = 0
  const add = vi.spyOn(notifications, 'add').mockImplementation(() => `n${++nextId}`)
  const dismiss = vi.spyOn(notifications, 'dismiss').mockImplementation(() => {})
  const { toggleAlerts } = useAircraftAlertToggle(
    () => control as unknown as AdsbLiveControl | null,
  )
  return { airNotif, add, dismiss, toggleAlerts }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useAircraftAlertToggle — turning alerts on', () => {
  it('enables alerts under the live callsign and posts a tracking notice with an action', () => {
    const control = makeControl([{ hex: 'aa1', flight: ' BAW1 ', r: 'G-AAA' }])
    const { airNotif, add, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    expect(airNotif.isEnabled('aa1')).toBe(true)
    expect(airNotif.callsignFor('aa1')).toBe('BAW1')
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tracking',
        title: 'BAW1',
        action: expect.objectContaining({ label: 'DISABLE ALERTS' }),
      }),
    )
    expect(control._trackingNotifIds).toEqual({ aa1: 'n1' })
    expect(control._rebuildTagForHex).toHaveBeenCalledWith('aa1')
  })

  it('names the alert by registration, then hex, when there is no callsign', () => {
    const control = makeControl([
      { hex: 'aa1', flight: '  ', r: ' G-AAA ' },
      { hex: 'bb2', flight: '', r: '' },
    ])
    const { add, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    toggleAlerts('bb2')
    expect(add.mock.calls.map(([options]) => options.title)).toEqual(['G-AAA', 'bb2'])
  })

  it('uses the remembered name for an aircraft no longer in the feed', () => {
    const control = makeControl([])
    const { airNotif, add, toggleAlerts } = setup(control)
    airNotif.enable('aa1', 'SAVED1')
    airNotif.disable('aa1')
    toggleAlerts('aa1')
    expect(add.mock.calls[0]![0].title).toBe('SAVED1')
  })

  it('replaces an earlier tracking notice for the same aircraft instead of stacking', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    control._trackingNotifIds = { aa1: 'stale' }
    const { dismiss, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    expect(dismiss).toHaveBeenCalledWith('stale')
    expect(control._trackingNotifIds).toEqual({ aa1: 'n1' })
  })

  it('keeps other aircraft’s tracking notices when adding one', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    control._trackingNotifIds = { bb2: 'other' }
    const { dismiss, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    expect(dismiss).not.toHaveBeenCalled()
    expect(control._trackingNotifIds).toEqual({ bb2: 'other', aa1: 'n1' })
  })

  it('the notice’s DISABLE ALERTS action turns alerts off and rebuilds the tag', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    const { airNotif, add, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    control._rebuildTagForHex.mockClear()
    add.mock.calls[0]![0].action!.callback()
    expect(airNotif.isEnabled('aa1')).toBe(false)
    expect(control._trackingNotifIds).toEqual({})
    expect(control._rebuildTagForHex).toHaveBeenCalledWith('aa1')
  })

  it('the action still works after the control dropped its notice table', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    const { airNotif, add, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    control._trackingNotifIds = null
    add.mock.calls[0]![0].action!.callback()
    expect(airNotif.isEnabled('aa1')).toBe(false)
    expect(control._rebuildTagForHex).toHaveBeenLastCalledWith('aa1')
  })

  it('without a map control, enables alerts and posts a plain tracking notice', () => {
    const { airNotif, add, toggleAlerts } = setup(null)
    toggleAlerts('aa1')
    expect(airNotif.isEnabled('aa1')).toBe(true)
    // With no name remembered, the store answers with the hex.
    expect(add).toHaveBeenCalledWith({ type: 'tracking', title: 'aa1' })
  })
})

describe('useAircraftAlertToggle — turning alerts off', () => {
  it('disables alerts, dismisses the tracking notice and posts notif-off', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    const { airNotif, add, dismiss, toggleAlerts } = setup(control)
    toggleAlerts('aa1')
    add.mockClear()
    toggleAlerts('aa1')
    expect(airNotif.isEnabled('aa1')).toBe(false)
    expect(dismiss).toHaveBeenCalledWith('n1')
    expect(control._trackingNotifIds).toEqual({})
    expect(add).toHaveBeenCalledWith({ type: 'notif-off', title: 'BAW1' })
    expect(control._rebuildTagForHex).toHaveBeenLastCalledWith('aa1')
  })

  it('dismisses nothing when there is no tracking notice to dismiss', () => {
    const control = makeControl([{ hex: 'aa1', flight: 'BAW1' }])
    const { airNotif, dismiss, toggleAlerts } = setup(control)
    airNotif.enable('aa1', 'BAW1')
    toggleAlerts('aa1')
    expect(dismiss).not.toHaveBeenCalled()
    expect(airNotif.isEnabled('aa1')).toBe(false)
  })

  it('without a map control, disables alerts and posts notif-off', () => {
    const { airNotif, add, toggleAlerts } = setup(null)
    airNotif.enable('aa1', 'BAW1')
    toggleAlerts('aa1')
    expect(airNotif.isEnabled('aa1')).toBe(false)
    expect(add).toHaveBeenCalledWith({ type: 'notif-off', title: 'BAW1' })
  })
})
