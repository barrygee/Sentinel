import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type Slot } from 'vue'
import {
  provideDeviceActions,
  useDeviceActions,
  type DeviceActionsSlotProps,
} from './useDeviceActions'

/** Mounts a reader of the slot, under a provider of `slot` when one is given. */
function readSlot(provider?: () => Slot<DeviceActionsSlotProps> | undefined) {
  let read: ReturnType<typeof useDeviceActions> | undefined
  const Reader = defineComponent({
    setup() {
      read = useDeviceActions()
      return () => h('div')
    },
  })
  const Provider = defineComponent({
    setup() {
      if (provider) provideDeviceActions(provider)
      return () => h(Reader)
    },
  })
  mount(provider ? Provider : Reader)
  return read!
}

describe('useDeviceActions', () => {
  it('reads the slot a control above provided, when it is asked', () => {
    const given: { slot?: Slot<DeviceActionsSlotProps> } = {}
    const read = readSlot(() => given.slot)
    expect(read()).toBeUndefined()
    // Read at render time, so a slot given later is seen.
    given.slot = () => [h('span', 'ADD')]
    expect(read()).toBe(given.slot)
  })

  it('reads no slot outside a control that provides one', () => {
    expect(readSlot()()).toBeUndefined()
  })
})
