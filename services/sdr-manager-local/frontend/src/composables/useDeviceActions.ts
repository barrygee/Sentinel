import { inject, provide, type InjectionKey, type Slot } from 'vue'

/** What the `device-actions` slot is given for one SDR's row. */
export interface DeviceActionsSlotProps {
  deviceId: string
}

/** Reads the slot at render time, so a slot the parent adds or drops later is followed. */
type DeviceActionsSlotGetter = () => Slot<DeviceActionsSlotProps> | undefined

const DEVICE_ACTIONS_KEY: InjectionKey<DeviceActionsSlotGetter> = Symbol('localDeviceActions')

/**
 * `LocalDevicesControl`'s `device-actions` slot, handed down to every
 * `LocalDeviceRow` it renders (several components below), so a host page can
 * put its own action at the end of each SDR's row: Settings › SDR's ADD.
 */
export function provideDeviceActions(getSlot: DeviceActionsSlotGetter): void {
  provide(DEVICE_ACTIONS_KEY, getSlot)
}

/** The row's view of that slot: undefined outside a control that provides one. */
export function useDeviceActions(): DeviceActionsSlotGetter {
  return inject(DEVICE_ACTIONS_KEY, () => undefined)
}
