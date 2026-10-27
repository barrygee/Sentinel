import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import type { LocalDeviceStatus, LocalNoticeEvent } from '../../api/types'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import SerialFlashConfirmDialog from './SerialFlashConfirmDialog.vue'
import SerialFlashPanel from './SerialFlashPanel.vue'

vi.mock('../../api/sdrManagerLocalApi')

const SERIAL = '#sdr-manager-local-flash-device-1-serial'
const mounted: VueWrapper[] = []

function mountPanel(deviceOverrides: Partial<LocalDeviceStatus> = {}): VueWrapper {
  const device = makeDevice(deviceOverrides)
  useLocalSdrStore().applyDeviceChanged(device)
  const wrapper = mount(SerialFlashPanel, { props: { device }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

function byText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text() === text)!
}

/** Tick the acknowledgement, type a serial and press FLASH SERIAL. */
async function askToFlash(wrapper: VueWrapper, serial = 'ROOF-01'): Promise<void> {
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.get(SERIAL).setValue(serial)
  await byText(wrapper, 'FLASH SERIAL').trigger('click')
  await flushPromises()
}

async function confirmFlash(wrapper: VueWrapper, serial = 'ROOF-01'): Promise<void> {
  await askToFlash(wrapper, serial)
  await byText(wrapper, 'WRITE SERIAL').trigger('click')
  await flushPromises()
}

function notice(overrides: Partial<LocalNoticeEvent> = {}): LocalNoticeEvent {
  return {
    level: 'info',
    code: 'serial_flashed',
    message: 'Done.',
    device_id: 'device-1',
    ts: Date.now() + 1000,
    ...overrides,
  }
}

describe('SerialFlashPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    HTMLDialogElement.prototype.showModal = vi.fn() as unknown as () => void
    HTMLDialogElement.prototype.close = vi.fn() as unknown as () => void
    vi.mocked(api.flashSerial).mockResolvedValue({
      device_id: 'device-1',
      operation_id: 'op',
      status: 'in_progress',
      requires_replug: false,
    })
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    document.body.innerHTML = ''
  })

  describe('the form', () => {
    it('is a labelled section whose heading takes focus and names the device', () => {
      const wrapper = mountPanel()
      const heading = wrapper.get('h3')
      expect(heading.text()).toBe('FLASH A UNIQUE SERIAL — Roof')
      expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'))
      expect(document.activeElement).toBe(heading.element)
    })

    it('labels the serial field with its format as a hint', () => {
      const wrapper = mountPanel()
      expect(wrapper.get('label').text()).toBe('NEW SERIAL')
      expect(wrapper.get(`${SERIAL}-hint`).text()).toContain('1-32 letters')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('holds FLASH SERIAL back until the acknowledgement is ticked', async () => {
      const wrapper = mountPanel()
      expect(byText(wrapper, 'FLASH SERIAL').attributes('disabled')).toBeDefined()
      await wrapper.get('input[type="checkbox"]').setValue(true)
      expect(byText(wrapper, 'FLASH SERIAL').attributes('disabled')).toBeUndefined()
    })

    it.each(['starting', 'streaming'] as const)(
      'locks everything and says to switch it off while the device is %s',
      (state) => {
        const wrapper = mountPanel({ state })
        expect(wrapper.get('[role="alert"]').text()).toContain(`Roof is ${state}.`)
        expect(wrapper.get(SERIAL).attributes('disabled')).toBeDefined()
        expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
        expect(byText(wrapper, 'FLASH SERIAL').attributes('disabled')).toBeDefined()
      },
    )

    it.each(['configured', 'stopped', 'detected', 'error'] as const)(
      'lets a %s device be flashed',
      (state) => {
        const wrapper = mountPanel({ state })
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        expect(wrapper.get(SERIAL).attributes('disabled')).toBeUndefined()
      },
    )

    it('CANCEL closes the panel', async () => {
      const wrapper = mountPanel()
      useLocalSdrStore().openSerialFlash('device-1')
      await byText(wrapper, 'CANCEL').trigger('click')
      expect(useLocalSdrStore().serialFlashDeviceId).toBeNull()
    })
  })

  describe('checking the serial', () => {
    it('refuses an empty serial, flags and focuses the field, and opens no dialog', async () => {
      const wrapper = mountPanel()
      await askToFlash(wrapper, '')
      expect(wrapper.get(`${SERIAL}-error`).text()).toBe('Enter a serial.')
      expect(wrapper.get(SERIAL).attributes('aria-invalid')).toBe('true')
      expect(document.activeElement).toBe(wrapper.get(SERIAL).element)
      expect(wrapper.findComponent(SerialFlashConfirmDialog).exists()).toBe(false)
    })

    it('refuses a serial with a character outside the allowed set', async () => {
      const wrapper = mountPanel()
      await askToFlash(wrapper, 'bad serial!')
      expect(wrapper.get(`${SERIAL}-error`).text()).toBe(
        'Use 1-32 letters, numbers, hyphens or underscores.',
      )
      expect(wrapper.findComponent(SerialFlashConfirmDialog).exists()).toBe(false)
    })

    it('treats a serial of only spaces as empty', async () => {
      const wrapper = mountPanel()
      await askToFlash(wrapper, '   ')
      expect(wrapper.get(`${SERIAL}-error`).text()).toBe('Enter a serial.')
    })

    it('trims a good serial and asks for the final confirmation naming it', async () => {
      const wrapper = mountPanel()
      await askToFlash(wrapper, '  ROOF-01  ')
      const dialog = wrapper.findComponent(SerialFlashConfirmDialog)
      expect(dialog.exists()).toBe(true)
      expect(dialog.props()).toMatchObject({ serial: 'ROOF-01', deviceName: 'Roof' })
      expect(api.flashSerial).not.toHaveBeenCalled()
    })

    it('goes back to the form, writing nothing, when the dialog is cancelled', async () => {
      const wrapper = mountPanel()
      await askToFlash(wrapper)
      await wrapper.findComponent(SerialFlashConfirmDialog).vm.$emit('cancel')
      await flushPromises()
      expect(wrapper.findComponent(SerialFlashConfirmDialog).exists()).toBe(false)
      expect(api.flashSerial).not.toHaveBeenCalled()
    })
  })

  describe('writing', () => {
    it('shows STARTING… with the field locked while the request is in flight', async () => {
      vi.mocked(api.flashSerial).mockReturnValue(new Promise(() => undefined))
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      expect(api.flashSerial).toHaveBeenCalledWith('device-1', 'ROOF-01')
      expect(byText(wrapper, 'STARTING…').attributes('disabled')).toBeDefined()
      expect(wrapper.get(SERIAL).attributes('disabled')).toBeDefined()
      expect(wrapper.findComponent(SerialFlashConfirmDialog).exists()).toBe(false)
    })

    it('warns not to unplug the device once the write is accepted', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      expect(wrapper.get('.serial-flash-progress').text()).toBe(
        'Writing the serial — don’t unplug Roof…',
      )
      expect(wrapper.find(SERIAL).exists()).toBe(false)
    })

    it('shows the API’s refusal and returns to the form, ready to try again', async () => {
      vi.mocked(api.flashSerial).mockRejectedValue(
        new SdrManagerApiError(409, 'serial_in_use', 'raw'),
      )
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      expect(wrapper.get('[role="alert"]').text()).toBe(
        'That serial is already used by another device. Choose a different one.',
      )
      expect(wrapper.get(SERIAL).attributes('disabled')).toBeUndefined()
      expect(byText(wrapper, 'FLASH SERIAL')).toBeDefined()
    })

    it('clears an earlier refusal when it tries again', async () => {
      vi.mocked(api.flashSerial).mockRejectedValueOnce(new TypeError('x'))
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      expect(wrapper.get('[role="alert"]').text()).toBe('The serial could not be written.')
      await byText(wrapper, 'FLASH SERIAL').trigger('click')
      await byText(wrapper, 'WRITE SERIAL').trigger('click')
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
    })
  })

  describe('the outcome, which arrives later as a notice', () => {
    it('reports success and says nothing about replugging when none is needed', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice())
      await flushPromises()
      const outcome = wrapper.get('.serial-flash-outcome')
      expect(outcome.text()).toBe('Serial ROOF-01 written.')
      expect(outcome.classes()).not.toContain('sdr-devices-form-error')
    })

    it('says to unplug and replug when the dongle must be replugged', async () => {
      vi.mocked(api.flashSerial).mockResolvedValue({
        device_id: 'device-1',
        operation_id: 'op',
        status: 'in_progress',
        requires_replug: true,
      })
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice())
      await flushPromises()
      expect(wrapper.get('.serial-flash-outcome').text()).toBe(
        'Serial ROOF-01 written. Unplug Roof and plug it back in to use it.',
      )
    })

    it.each(['warn', 'error'] as const)(
      'reports a %s notice as a failure with the wording for its code',
      async (level) => {
        const wrapper = mountPanel()
        await confirmFlash(wrapper)
        useLocalSdrStore().applyNotice(notice({ level, code: 'flash_failed' }))
        await flushPromises()
        const outcome = wrapper.get('.serial-flash-outcome')
        expect(outcome.text()).toBe(
          'The write failed partway through. Check the device is still connected.',
        )
        expect(outcome.classes()).toContain('sdr-devices-form-error')
      },
    )

    it('uses a general failure sentence for a code it has no wording for', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice({ level: 'error', code: 'who_knows' }))
      await flushPromises()
      expect(wrapper.get('.serial-flash-outcome').text()).toBe('The serial could not be written.')
    })

    it('ignores a notice about another device', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice({ device_id: 'device-2' }))
      useLocalSdrStore().applyNotice(notice({ device_id: null, code: 'other' }))
      await flushPromises()
      expect(wrapper.find('.serial-flash-progress').exists()).toBe(true)
    })

    it('ignores a notice from before this write started', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice({ ts: 1 }))
      await flushPromises()
      expect(wrapper.find('.serial-flash-progress').exists()).toBe(true)
    })

    it('ignores notices while no write is waiting on an outcome', async () => {
      const wrapper = mountPanel()
      useLocalSdrStore().applyNotice(notice())
      await flushPromises()
      expect(wrapper.find(SERIAL).exists()).toBe(true)
      expect(wrapper.find('.serial-flash-outcome').exists()).toBe(false)
    })

    it('CLOSE after the outcome closes the panel', async () => {
      const wrapper = mountPanel()
      await confirmFlash(wrapper)
      useLocalSdrStore().applyNotice(notice())
      await flushPromises()
      useLocalSdrStore().openSerialFlash('device-1')
      await byText(wrapper, 'CLOSE').trigger('click')
      expect(useLocalSdrStore().serialFlashDeviceId).toBeNull()
    })
  })

  it('has no accessibility violations in every phase', async () => {
    const wrapper = mountPanel({ state: 'streaming' })
    await expectNoAxeViolations(wrapper)
    wrapper.unmount()
    mounted.pop()

    const flow = mountPanel()
    await askToFlash(flow, '')
    await expectNoAxeViolations(flow)
    await confirmFlash(flow)
    await expectNoAxeViolations(flow)
    useLocalSdrStore().applyNotice(notice({ level: 'error', code: 'flash_failed' }))
    await flushPromises()
    await expectNoAxeViolations(flow)
  })
})
