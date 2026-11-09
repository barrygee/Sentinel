import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// The notifications store plays a sound on add(); keep the audio path out of jsdom.
vi.mock('@sentinel/shell-api/composables/useNotificationSound', () => ({
  playNotificationSound: vi.fn(),
}))

import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import {
  useSatelliteActions,
  type SatelliteActions,
  type SatelliteActionsOptions,
  type SatelliteActionTarget,
} from './useSatelliteActions'
import type { SatelliteControl } from '../controls/satellite/SatelliteControl'
import {
  isAutoTuneEnabled,
  isRecordOnPassEnabled,
  setAutoTuneEnabled,
  setPassNotifEnabled,
  getAllPassNotifs,
} from '../controls/satellite/passNotifStore'

const ARMED_AUTOTUNE = 'Auto-tune on pass enabled'
const ARMED_RECORD = 'Auto-tune and record on pass enabled'

const ISS: SatelliteActionTarget = {
  norad_id: '25544',
  name: 'ISS (ZARYA)',
  downlink_hz: 145_800_000,
  downlink_mode: 'FM',
}

interface FakeSatelliteControl {
  followedNoradId: string | null
  activeNoradId: string | null
  passNotificationsEnabled: boolean
  stopFollowing: ReturnType<typeof vi.fn>
  switchSatellite: ReturnType<typeof vi.fn>
  togglePassNotifications: ReturnType<typeof vi.fn>
}

function makeControl(overrides: Partial<FakeSatelliteControl> = {}): FakeSatelliteControl {
  return {
    followedNoradId: null,
    activeNoradId: null,
    passNotificationsEnabled: false,
    stopFollowing: vi.fn(),
    switchSatellite: vi.fn(),
    togglePassNotifications: vi.fn(),
    ...overrides,
  }
}

const mountedWrappers: VueWrapper[] = []

// The composable registers document listeners, which need a component's
// lifecycle, so it runs inside a throwaway host.
function setup(
  control: FakeSatelliteControl | null,
  extraOptions: Partial<SatelliteActionsOptions> = {},
): SatelliteActions {
  let actions!: SatelliteActions
  const Host = defineComponent({
    setup() {
      actions = useSatelliteActions({
        getSatelliteControl: () => control as unknown as SatelliteControl | null,
        ...extraOptions,
      })
      return () => h('div')
    },
  })
  mountedWrappers.push(mount(Host))
  return actions
}

function fire(eventName: string, detail: unknown): void {
  document.dispatchEvent(new CustomEvent(eventName, { detail }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}'))),
  )
})

afterEach(() => {
  mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('useSatelliteActions — initial state', () => {
  it('starts with nothing followed or notifying when there is no control', () => {
    const actions = setup(null)
    expect(actions.followedNoradId.value).toBeNull()
    expect(actions.notifNoradId.value).toBeNull()
    expect(actions.armedTick.value).toBe(0)
  })

  it('takes the followed satellite and active pass alerts from the control', () => {
    const actions = setup(
      makeControl({ followedNoradId: '111', activeNoradId: '222', passNotificationsEnabled: true }),
    )
    expect(actions.followedNoradId.value).toBe('111')
    expect(actions.notifNoradId.value).toBe('222')
  })

  it('shows no pass alerts when the control has them off', () => {
    const actions = setup(makeControl({ activeNoradId: '222', passNotificationsEnabled: false }))
    expect(actions.notifNoradId.value).toBeNull()
  })
})

describe('useSatelliteActions — arming reads', () => {
  it('reads auto-tune and record arming from the store', () => {
    const actions = setup(makeControl())
    expect(actions.isArmed(ISS.norad_id)).toBe(false)
    expect(actions.isRecordArmed(ISS.norad_id)).toBe(false)
    setAutoTuneEnabled(ISS.norad_id, true, { name: ISS.name })
    expect(actions.isArmed(ISS.norad_id)).toBe(true)
    expect(actions.isRecordArmed(ISS.norad_id)).toBe(false)
  })

  it('syncPassNotifState highlights the satellite only when its alerts are on', () => {
    const actions = setup(makeControl())
    actions.syncPassNotifState(ISS.norad_id)
    expect(actions.notifNoradId.value).toBeNull()
    setPassNotifEnabled(ISS.norad_id, true, ISS.name)
    actions.syncPassNotifState(ISS.norad_id)
    expect(actions.notifNoradId.value).toBe(ISS.norad_id)
  })
})

describe('useSatelliteActions — trackSat', () => {
  it('starts following a satellite that is not followed', () => {
    const control = makeControl()
    setup(control).trackSat(ISS)
    expect(control.switchSatellite).toHaveBeenCalledWith(ISS.norad_id, ISS.name, true)
    expect(control.stopFollowing).not.toHaveBeenCalled()
  })

  it('falls back to the NORAD id when the satellite has no name', () => {
    const control = makeControl()
    setup(control).trackSat({ ...ISS, name: '' })
    expect(control.switchSatellite).toHaveBeenCalledWith(ISS.norad_id, ISS.norad_id, true)
  })

  it('stops following the satellite that is already followed', () => {
    const control = makeControl({ followedNoradId: ISS.norad_id })
    setup(control).trackSat(ISS)
    expect(control.stopFollowing).toHaveBeenCalledOnce()
    expect(control.switchSatellite).not.toHaveBeenCalled()
  })

  it('does nothing without a control, followed or not', () => {
    const actions = setup(null)
    expect(() => actions.trackSat(ISS)).not.toThrow()
    actions.followedNoradId.value = ISS.norad_id
    expect(() => actions.trackSat(ISS)).not.toThrow()
  })
})

describe('useSatelliteActions — togglePassNotif', () => {
  it('does nothing without a control', () => {
    expect(() => setup(null).togglePassNotif(ISS)).not.toThrow()
  })

  it('selects the satellite first when the map shows another one', () => {
    const control = makeControl({ activeNoradId: '999' })
    setup(control).togglePassNotif({ ...ISS, name: '' })
    expect(control.switchSatellite).toHaveBeenCalledWith(ISS.norad_id, ISS.norad_id)
    expect(control.togglePassNotifications).toHaveBeenCalledOnce()
    expect(control.switchSatellite.mock.invocationCallOrder[0]).toBeLessThan(
      control.togglePassNotifications.mock.invocationCallOrder[0]!,
    )
  })

  it('selects by name when the satellite has one', () => {
    const control = makeControl({ activeNoradId: '999' })
    setup(control).togglePassNotif(ISS)
    expect(control.switchSatellite).toHaveBeenCalledWith(ISS.norad_id, ISS.name)
  })

  it('toggles alerts without reselecting when the satellite is already active', () => {
    const control = makeControl({ activeNoradId: ISS.norad_id })
    setup(control).togglePassNotif(ISS)
    expect(control.switchSatellite).not.toHaveBeenCalled()
    expect(control.togglePassNotifications).toHaveBeenCalledOnce()
  })
})

describe('useSatelliteActions — toggleAutoTune', () => {
  it('arms the satellite, announces it and adds one armed alert card', () => {
    const onAutoTuneToggled = vi.fn()
    const actions = setup(makeControl(), { onAutoTuneToggled })
    const announced = vi.fn()
    document.addEventListener('satellite-auto-tune-changed', announced)

    actions.toggleAutoTune(ISS)

    document.removeEventListener('satellite-auto-tune-changed', announced)
    expect(isAutoTuneEnabled(ISS.norad_id)).toBe(true)
    expect(getAllPassNotifs()[ISS.norad_id]).toMatchObject({
      name: ISS.name,
      downlinkHz: ISS.downlink_hz,
      downlinkMode: 'FM',
    })
    expect(onAutoTuneToggled).toHaveBeenCalledWith(ISS.norad_id)
    expect((announced.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      noradId: ISS.norad_id,
      enabled: true,
    })
    // Bumped by the toggle and again by the composable's own event listener.
    expect(actions.armedTick.value).toBe(2)
    const cards = useNotificationsStore().items
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      type: 'autotune',
      title: ISS.name,
      detail: ARMED_AUTOTUNE,
      noradId: ISS.norad_id,
      satName: ISS.name,
    })
  })

  it('stores no downlink mode and uses the NORAD id when those are missing', () => {
    const actions = setup(makeControl())
    actions.toggleAutoTune({ norad_id: '43017', name: '', downlink_hz: 435_000_000 })
    const stored = getAllPassNotifs()['43017']
    expect(stored).toMatchObject({ name: '43017', downlinkHz: 435_000_000 })
    expect(stored).not.toHaveProperty('downlinkMode')
    expect(useNotificationsStore().items[0]).toMatchObject({ title: '43017', satName: '43017' })
  })

  it('works without an onAutoTuneToggled callback', () => {
    const actions = setup(makeControl())
    expect(() => actions.toggleAutoTune(ISS)).not.toThrow()
    expect(isAutoTuneEnabled(ISS.norad_id)).toBe(true)
  })

  it('disarming removes only this satellite’s armed cards and reports the toggle', () => {
    const onAutoTuneToggled = vi.fn()
    const actions = setup(makeControl(), { onAutoTuneToggled })
    const notifications = useNotificationsStore()
    actions.toggleAutoTune(ISS)
    // Cards that must survive: a live trace alert for the same satellite, another
    // satellite's armed card, and a non-autotune card with the armed wording.
    notifications.add({
      type: 'autotune',
      title: 'x',
      detail: 'Tuned to 145.800',
      noradId: ISS.norad_id,
    })
    notifications.add({ type: 'autotune', title: 'y', detail: ARMED_AUTOTUNE, noradId: '43017' })
    notifications.add({
      type: 'tracking',
      title: 'z',
      detail: ARMED_AUTOTUNE,
      noradId: ISS.norad_id,
    })
    // A record-armed card for this satellite goes too.
    notifications.add({ type: 'autotune', title: 'r', detail: ARMED_RECORD, noradId: ISS.norad_id })
    onAutoTuneToggled.mockClear()

    actions.toggleAutoTune(ISS)

    expect(isAutoTuneEnabled(ISS.norad_id)).toBe(false)
    expect(notifications.items.map((item) => item.title).sort()).toEqual(['x', 'y', 'z'])
    expect(onAutoTuneToggled).toHaveBeenCalledWith(ISS.norad_id)
  })
})

describe('useSatelliteActions — toggleRecord', () => {
  it('folds record into the existing armed card and back out again', () => {
    const actions = setup(makeControl())
    const notifications = useNotificationsStore()
    const announced = vi.fn()
    document.addEventListener('satellite-record-on-pass-changed', announced)
    actions.toggleAutoTune(ISS)

    actions.toggleRecord(ISS)
    expect(isRecordOnPassEnabled(ISS.norad_id)).toBe(true)
    expect(actions.isRecordArmed(ISS.norad_id)).toBe(true)
    expect(notifications.items).toHaveLength(1)
    expect(notifications.items[0]!.detail).toBe(ARMED_RECORD)

    actions.toggleRecord(ISS)
    document.removeEventListener('satellite-record-on-pass-changed', announced)
    expect(isRecordOnPassEnabled(ISS.norad_id)).toBe(false)
    expect(notifications.items).toHaveLength(1)
    expect(notifications.items[0]!.detail).toBe(ARMED_AUTOTUNE)
    expect(announced.mock.calls.map((call) => (call[0] as CustomEvent).detail)).toEqual([
      { noradId: ISS.norad_id, enabled: true },
      { noradId: ISS.norad_id, enabled: false },
    ])
  })

  it('adds a fresh combined card when the armed card was dismissed', () => {
    const actions = setup(makeControl())
    setAutoTuneEnabled(ISS.norad_id, true, { name: '' })
    actions.toggleRecord({ ...ISS, name: '' })
    expect(useNotificationsStore().items).toHaveLength(1)
    expect(useNotificationsStore().items[0]).toMatchObject({
      type: 'autotune',
      title: ISS.norad_id,
      detail: ARMED_RECORD,
      noradId: ISS.norad_id,
      satName: ISS.norad_id,
    })
  })
})

describe('useSatelliteActions — document events', () => {
  it('follows satellite-follow-changed', () => {
    const actions = setup(makeControl())
    fire('satellite-follow-changed', { noradId: ISS.norad_id, following: true })
    expect(actions.followedNoradId.value).toBe(ISS.norad_id)
    fire('satellite-follow-changed', { noradId: ISS.norad_id, following: false })
    expect(actions.followedNoradId.value).toBeNull()
  })

  it('follows satellite-pass-notif-changed without clearing another satellite', () => {
    const actions = setup(makeControl())
    fire('satellite-pass-notif-changed', { noradId: ISS.norad_id, enabled: true })
    expect(actions.notifNoradId.value).toBe(ISS.norad_id)
    fire('satellite-pass-notif-changed', { noradId: '43017', enabled: false })
    expect(actions.notifNoradId.value).toBe(ISS.norad_id)
    fire('satellite-pass-notif-changed', { noradId: ISS.norad_id, enabled: false })
    expect(actions.notifNoradId.value).toBeNull()
  })

  it('re-reads arming when another component toggles auto-tune', async () => {
    const actions = setup(makeControl())
    setAutoTuneEnabled(ISS.norad_id, true, { name: ISS.name })
    fire('satellite-auto-tune-changed', { noradId: ISS.norad_id, enabled: true })
    await nextTick()
    expect(actions.armedTick.value).toBe(1)
  })

  it('stops listening once the host unmounts', () => {
    const actions = setup(makeControl())
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    fire('satellite-follow-changed', { noradId: ISS.norad_id, following: true })
    expect(actions.followedNoradId.value).toBeNull()
  })
})
