import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations, mountWithDeviceEdits } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import LocalDeviceForm from './LocalDeviceForm.vue'
import LocalDeviceRow from './LocalDeviceRow.vue'
import { h, type Slot } from 'vue'
import {
  provideDeviceActions,
  providePortOnly,
  type DeviceActionsSlotProps,
} from '../../composables/useDeviceActions'

vi.mock('../../api/sdrManagerLocalApi')

function mountRow(
  deviceOverrides: Parameters<typeof makeDevice>[0] = {},
  open = false,
  attachToBody = false,
  deviceActions?: Slot<DeviceActionsSlotProps>,
  portOnly = false,
) {
  const device = makeDevice(deviceOverrides)
  useLocalSdrStore().applyDeviceChanged(device)
  const mounted = mountWithDeviceEdits(
    LocalDeviceRow,
    { device, open },
    {
      attachToBody,
      prepare: () => {
        provideDeviceActions(() => deviceActions)
        providePortOnly(() => portOnly)
      },
    },
  )
  return { device, ...mounted }
}

/** A host page's action for each row, as Settings › SDR's ADD would be. */
const markActions: Slot<DeviceActionsSlotProps> = ({ deviceId }) => [
  h('button', { type: 'button', class: 'host-action' }, `ADD ${deviceId}`),
]

const ABSENT = { present: false, usb: null, state: 'configured' as const }

describe('LocalDeviceRow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(api.listDevices).mockRejectedValue(new Error('offline'))
  })

  it('shows the state as a dot, then the name and the address the device streams on', () => {
    const { wrapper } = mountRow({ state: 'streaming' })
    const dot = wrapper.get('.sdr-device-state-dot')
    expect(dot.classes()).toContain('sdr-device-state-dot--live')
    expect(dot.attributes('title')).toBe('Streaming')
    expect(wrapper.text()).not.toContain('STREAMING')
    expect(wrapper.get('.local-device-name').text()).toBe('Roof')
    expect(wrapper.get('.local-device-address').text()).toBe('0.0.0.0:1234')
  })

  it("shows only the port under a title that gives the machine's address", () => {
    const { wrapper } = mountRow({}, false, false, undefined, true)
    expect(wrapper.get('.local-device-address').text()).toBe('port 1234')
  })

  it("ends the row with the host page's action for that device", () => {
    const { wrapper } = mountRow({ device_id: 'serial:7' }, false, false, markActions)
    const action = wrapper.get('.host-action')
    expect(action.text()).toBe('ADD serial:7')
    // After the edit button, at the row's end.
    const rowButtons = wrapper.findAll('.sdr-device-row button')
    expect(rowButtons.at(-1)!.classes()).toContain('host-action')
  })

  it('has no action of its own when the host page gives none', () => {
    const { wrapper } = mountRow({}, false, false, undefined)
    expect(wrapper.find('.host-action').exists()).toBe(false)
  })

  it('hides the action while asking whether to forget the device', async () => {
    const { wrapper } = mountRow(ABSENT, false, false, markActions)
    await wrapper.get('button[title="Forget"]').trigger('click')
    expect(wrapper.find('.host-action').exists()).toBe(false)
  })

  it('makes the dot red while the device is unplugged', () => {
    const { wrapper } = mountRow(ABSENT)
    expect(wrapper.get('.sdr-device-state-dot').attributes('title')).toBe('Not plugged in')
  })

  it('names an unnamed device by its id', () => {
    const { wrapper } = mountRow({ name: '', device_id: 'abc-9' })
    expect(wrapper.get('.local-device-name').text()).toBe('abc-9')
  })

  it('marks a device seen for the first time NOT SET UP and offers no stream switch', () => {
    const { wrapper } = mountRow({ record_id: null, output: null, name: '', state: 'detected' })
    expect(wrapper.get('.local-device-address').text()).toBe('NOT SET UP')
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
    expect(wrapper.get('button[title="Set up"]').attributes('aria-label')).toBe('Set up device-1')
  })

  it('shows neither an address nor NOT SET UP for a configured device without output', () => {
    const { wrapper } = mountRow({ output: null })
    expect(wrapper.find('.local-device-address').exists()).toBe(false)
  })

  it('dims an unplugged device', () => {
    const { wrapper } = mountRow(ABSENT)
    expect(wrapper.get('.sdr-device-info').classes()).toContain('sdr-device-info--unavailable')
    expect(mountRow({}).wrapper.get('.sdr-device-info').classes()).not.toContain(
      'sdr-device-info--unavailable',
    )
  })

  describe('stream switch', () => {
    it('is named for the device and reflects whether it streams', () => {
      const { wrapper } = mountRow({ enabled: true })
      const toggle = wrapper.get('[role="switch"]')
      expect(toggle.attributes('aria-label')).toBe('Stream Roof')
      expect(toggle.attributes('aria-checked')).toBe('true')
    })

    it('stages the change and says it is waiting for APPLY CHANGES', async () => {
      const { wrapper, deviceEdits, stage } = mountRow({ enabled: false })
      expect(wrapper.find('.local-device-staged').exists()).toBe(false)
      await wrapper.get('[role="switch"]').trigger('click')
      expect(deviceEdits.edits.drafts.get('device-1')?.enabled).toBe(true)
      expect(stage).toHaveBeenCalled()
      expect(wrapper.get('.local-device-staged').text()).toBe('EDITED — APPLY TO SAVE')
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    })

    it('drops the staged edit when switched back to what is saved', async () => {
      const { wrapper, deviceEdits } = mountRow({ enabled: false })
      await wrapper.get('[role="switch"]').trigger('click')
      await wrapper.get('[role="switch"]').trigger('click')
      expect(deviceEdits.edits.drafts.has('device-1')).toBe(false)
      expect(wrapper.find('.local-device-staged').exists()).toBe(false)
    })
  })

  describe('edit button', () => {
    it('reports whether the form is open and emits toggle when pressed', async () => {
      const { wrapper, child } = mountRow({}, false)
      const edit = wrapper.get('button[title="Edit"]')
      expect(edit.attributes('aria-expanded')).toBe('false')
      expect(edit.attributes('aria-label')).toBe('Edit Roof')
      await edit.trigger('click')
      expect(child.emitted('toggle')).toHaveLength(1)
    })

    it('opens the form and marks itself active while open', () => {
      const { wrapper } = mountRow({}, true)
      expect(wrapper.findComponent(LocalDeviceForm).exists()).toBe(true)
      expect(wrapper.get('button[title="Edit"]').attributes('aria-expanded')).toBe('true')
      expect(wrapper.get('button[title="Edit"]').classes()).toContain('sdr-device-btn--active')
      expect(wrapper.get('.sdr-device-item').classes()).toContain('sdr-device-item--open')
    })

    it('has no form while closed', () => {
      expect(mountRow({}, false).wrapper.findComponent(LocalDeviceForm).exists()).toBe(false)
    })
  })

  describe('forgetting an unplugged device', () => {
    it('offers FORGET only for a device that is not plugged in', () => {
      expect(mountRow({}).wrapper.find('button[title="Forget"]').exists()).toBe(false)
      expect(mountRow(ABSENT).wrapper.find('button[title="Forget"]').exists()).toBe(true)
    })

    it('asks YES / NO first, hides the other controls, and focuses YES', async () => {
      const { wrapper } = mountRow(ABSENT, false, true)
      await wrapper.get('button[title="Forget"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('.sdr-device-confirm-label').text()).toBe('FORGET?')
      expect(wrapper.find('[role="switch"]').exists()).toBe(false)
      expect(wrapper.find('button[title="Edit"]').exists()).toBe(false)
      const yes = wrapper.get('.sdr-device-confirm-btn--yes')
      expect(yes.attributes('aria-label')).toBe('Forget Roof and its saved settings')
      expect(document.activeElement).toBe(yes.element)
      wrapper.unmount()
    })

    it('puts the controls back when the answer is NO, without calling the API', async () => {
      const { wrapper } = mountRow(ABSENT)
      await wrapper.get('button[title="Forget"]').trigger('click')
      const no = wrapper
        .findAll('.sdr-device-confirm-btn')
        .find((button) => button.text() === 'NO')!
      await no.trigger('click')
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      expect(wrapper.find('button[title="Edit"]').exists()).toBe(true)
      expect(api.forgetDevice).not.toHaveBeenCalled()
    })

    it('forgets the device at once on YES and removes it from the store', async () => {
      vi.mocked(api.forgetDevice).mockResolvedValue(undefined)
      const { wrapper } = mountRow(ABSENT)
      await wrapper.get('button[title="Forget"]').trigger('click')
      await wrapper.get('.sdr-device-confirm-btn--yes').trigger('click')
      await flushPromises()
      expect(api.forgetDevice).toHaveBeenCalledWith('device-1')
      expect(useLocalSdrStore().devicesById['device-1']).toBeUndefined()
      expect(wrapper.find('.local-device-row-error').exists()).toBe(false)
    })

    it('shows the API’s refusal in an alert and drops the confirmation', async () => {
      vi.mocked(api.forgetDevice).mockRejectedValue(
        new SdrManagerApiError(409, 'device_present', 'raw'),
      )
      const { wrapper } = mountRow(ABSENT)
      await wrapper.get('button[title="Forget"]').trigger('click')
      await wrapper.get('.sdr-device-confirm-btn--yes').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe(
        'This device was plugged back in, so it can no longer be forgotten.',
      )
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      expect(useLocalSdrStore().devicesById['device-1']).toBeDefined()
    })

    it('clears an earlier refusal when it tries again', async () => {
      vi.mocked(api.forgetDevice)
        .mockRejectedValueOnce(new SdrManagerApiError(409, 'device_present', 'raw'))
        .mockResolvedValueOnce(undefined)
      const { wrapper } = mountRow(ABSENT)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await wrapper.get('button[title="Forget"]').trigger('click')
        await wrapper.get('.sdr-device-confirm-btn--yes').trigger('click')
        await flushPromises()
      }
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  it('has no accessibility violations in its normal, staged, confirming and error states', async () => {
    vi.mocked(api.forgetDevice).mockRejectedValue(new TypeError('x'))
    const { wrapper } = mountRow(ABSENT, true)
    await expectNoAxeViolations(wrapper)
    await wrapper.get('[role="switch"]').trigger('click')
    await expectNoAxeViolations(wrapper)
    await wrapper.get('button[title="Forget"]').trigger('click')
    await expectNoAxeViolations(wrapper)
    await wrapper.get('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
