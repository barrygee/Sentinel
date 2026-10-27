import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations, mountWithDeviceEdits } from '../../testing/componentTestUtils'
import { makeConstraints, makeDevice } from '../../testing/factories'
import LocalDeviceForm from './LocalDeviceForm.vue'

const DEVICE_ID = 'device-1'
const NAME = '#sdr-manager-local-device-1-name'
const PORT = '#sdr-manager-local-device-1-port'
const ANTENNA = '#sdr-manager-local-device-1-antenna'
const NOTES = '#sdr-manager-local-device-1-notes'

function mountForm(
  deviceOverrides: Parameters<typeof makeDevice>[0] = {},
  options: Parameters<typeof mountWithDeviceEdits>[2] = {},
) {
  const device = makeDevice(deviceOverrides)
  const store = useLocalSdrStore()
  store.applyDeviceChanged(device)
  return { device, ...mountWithDeviceEdits(LocalDeviceForm, { device }, options) }
}

describe('LocalDeviceForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts from the device’s saved values', () => {
    const { wrapper } = mountForm({ name: 'Roof', antenna: 'Discone', notes: 'Attic shelf' })
    expect((wrapper.get(NAME).element as HTMLInputElement).value).toBe('Roof')
    expect((wrapper.get(PORT).element as HTMLInputElement).value).toBe('1234')
    expect((wrapper.get(ANTENNA).element as HTMLInputElement).value).toBe('Discone')
    expect((wrapper.get(NOTES).element as HTMLTextAreaElement).value).toBe('Attic shelf')
    expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toBe('PUBLIC')
  })

  it('has labelled fields and only a CANCEL button, because APPLY CHANGES saves', () => {
    const { wrapper } = mountForm()
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'NAME',
      'OUTPUT PORT',
      'ANTENNA',
      'NOTES',
    ])
    expect(wrapper.findAll('button').filter((button) => !button.attributes('role'))).toHaveLength(1)
    expect(wrapper.findAll('button').some((button) => button.text() === 'CANCEL')).toBe(true)
    expect(wrapper.text()).not.toContain('SAVE')
  })

  it('limits the lengths of the free-text fields', () => {
    const { wrapper } = mountForm()
    expect(wrapper.get(NAME).attributes('maxlength')).toBe('64')
    expect(wrapper.get(ANTENNA).attributes('maxlength')).toBe('120')
    expect(wrapper.get(NOTES).attributes('maxlength')).toBe('2000')
  })

  it('bounds the port field by the API’s rules once they are known', () => {
    const store = useLocalSdrStore()
    store.constraints = makeConstraints({ port_min: 2000, port_max: 3000 })
    const { wrapper } = mountForm()
    expect(wrapper.get(PORT).attributes('min')).toBe('2000')
    expect(wrapper.get(PORT).attributes('max')).toBe('3000')
  })

  it('leaves the port field unbounded before the rules are known', () => {
    const { wrapper } = mountForm()
    expect(wrapper.get(PORT).attributes('min')).toBeUndefined()
    expect(wrapper.get(PORT).attributes('max')).toBeUndefined()
  })

  it('shows the control port as the output port plus two', async () => {
    const { wrapper } = mountForm()
    expect(wrapper.get(`${PORT}-hint`).text()).toBe('Its control port is 1236.')
    await wrapper.get(PORT).setValue(2000)
    expect(wrapper.get(`${PORT}-hint`).text()).toBe('Its control port is 2002.')
  })

  it('describes the control port generically while the port is empty', async () => {
    const { wrapper } = mountForm()
    await wrapper.get(PORT).setValue('')
    expect(wrapper.get(`${PORT}-hint`).text()).toBe('Its control port is the port + 2.')
  })

  it('offers the API’s suggested port to a device that has none yet', () => {
    useLocalSdrStore().portSuggestion = 1240
    const { wrapper } = mountForm({ output: null, record_id: null, name: '' })
    expect((wrapper.get(PORT).element as HTMLInputElement).value).toBe('1240')
  })

  it('stages an edit instead of saving it', async () => {
    const { wrapper, deviceEdits, stage } = mountForm()
    await wrapper.get(NAME).setValue('Attic')
    expect(deviceEdits.edits.drafts.get(DEVICE_ID)?.name).toBe('Attic')
    expect(stage).toHaveBeenCalledTimes(1)
    expect(typeof stage.mock.calls[0]![0]).toBe('function')
  })

  it('stages each kind of field', async () => {
    const { wrapper, deviceEdits } = mountForm()
    await wrapper.get(PORT).setValue(2000)
    await wrapper.get(ANTENNA).setValue('Yagi')
    await wrapper.get(NOTES).setValue('Windy')
    expect(deviceEdits.edits.drafts.get(DEVICE_ID)).toMatchObject({
      port: 2000,
      antenna: 'Yagi',
      notes: 'Windy',
    })
  })

  it('stages a null port when the port field is emptied', async () => {
    const { wrapper, deviceEdits } = mountForm()
    await wrapper.get(PORT).setValue('')
    expect(deviceEdits.edits.drafts.get(DEVICE_ID)?.port).toBeNull()
  })

  it('drops the staged edit when the fields return to the saved values', async () => {
    const { wrapper, deviceEdits } = mountForm()
    await wrapper.get(NAME).setValue('Attic')
    expect(deviceEdits.edits.drafts.has(DEVICE_ID)).toBe(true)
    await wrapper.get(NAME).setValue('Roof')
    expect(deviceEdits.edits.drafts.has(DEVICE_ID)).toBe(false)
  })

  it('stages a visibility change and explains what each choice means', async () => {
    const { wrapper, deviceEdits } = mountForm()
    expect(wrapper.text()).toContain('Listed for other Sentinels on the network to use.')
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click')
    expect(deviceEdits.edits.drafts.get(DEVICE_ID)?.visibility).toBe('private')
    expect(wrapper.text()).toContain('Not listed for other Sentinels.')
  })

  it('names the visibility radio group by its VISIBILITY label', () => {
    const { wrapper } = mountForm()
    const group = wrapper.get('[role="radiogroup"]')
    expect(wrapper.get(`#${group.attributes('aria-labelledby')}`).text()).toBe('VISIBILITY')
  })

  it('keeps the row’s stream switch when a field is edited afterwards', async () => {
    const { wrapper, deviceEdits, device } = mountForm()
    deviceEdits.updateDraft(device, { ...deviceEdits.draftFor(device), enabled: true })
    await wrapper.get(NAME).setValue('Attic')
    expect(deviceEdits.edits.drafts.get(DEVICE_ID)).toMatchObject({ name: 'Attic', enabled: true })
  })

  it('CANCEL drops the draft and its messages and closes the form', async () => {
    const { wrapper, deviceEdits } = mountForm()
    deviceEdits.openDeviceId.value = DEVICE_ID
    await wrapper.get(NAME).setValue('Attic')
    deviceEdits.errors[DEVICE_ID] = { name: 'Bad', port: null, form: null }
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'CANCEL')!
    await cancel.trigger('click')
    expect(deviceEdits.edits.drafts.has(DEVICE_ID)).toBe(false)
    expect(deviceEdits.errors[DEVICE_ID]).toBeUndefined()
    expect(deviceEdits.openDeviceId.value).toBeNull()
  })

  it('swallows a submit (Enter in a field) rather than reloading the page or saving', async () => {
    const { wrapper, stage } = mountForm()
    const submitEvent = new Event('submit', { cancelable: true })
    wrapper.get('form').element.dispatchEvent(submitEvent)
    expect(submitEvent.defaultPrevented).toBe(true)
    expect(stage).not.toHaveBeenCalled()
  })

  it('shows the dongle warnings above the fields', () => {
    const { wrapper } = mountForm({ needs_identification: true })
    expect(wrapper.find('.warning-notice').exists()).toBe(true)
  })

  describe('messages from a refused APPLY CHANGES', () => {
    it('shows no messages and flags no field by default', () => {
      const { wrapper } = mountForm()
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
      expect(wrapper.get(NAME).attributes('aria-invalid')).toBe('false')
      expect(wrapper.get(PORT).attributes('aria-invalid')).toBe('false')
    })

    it('shows each message beside the field it names and flags that field', () => {
      const { wrapper } = mountForm(
        {},
        {
          prepare: (deviceEdits) => {
            deviceEdits.errors[DEVICE_ID] = { name: 'Name taken.', port: 'Port busy.', form: null }
          },
        },
      )
      expect(wrapper.get(`${NAME}-error`).text()).toBe('Name taken.')
      expect(wrapper.get(`${PORT}-error`).text()).toBe('Port busy.')
      expect(wrapper.get(NAME).attributes('aria-invalid')).toBe('true')
      expect(wrapper.get(PORT).attributes('aria-describedby')).toContain(`${PORT.slice(1)}-error`)
    })

    it('shows a form-wide message as an alert', () => {
      const { wrapper } = mountForm(
        {},
        {
          prepare: (deviceEdits) => {
            deviceEdits.errors[DEVICE_ID] = { name: null, port: null, form: 'Could not save.' }
          },
        },
      )
      expect(wrapper.get('[role="alert"]').text()).toBe('Could not save.')
    })

    it('focuses the name field when the form mounts with a name error', async () => {
      const { wrapper } = mountForm(
        {},
        {
          attachToBody: true,
          prepare: (deviceEdits) => {
            deviceEdits.errors[DEVICE_ID] = { name: 'Name taken.', port: 'Port busy.', form: null }
          },
        },
      )
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get(NAME).element)
      wrapper.unmount()
    })

    it('focuses the port field when only the port is in error', async () => {
      const { wrapper } = mountForm(
        {},
        {
          attachToBody: true,
          prepare: (deviceEdits) => {
            deviceEdits.errors[DEVICE_ID] = { name: null, port: 'Port busy.', form: null }
          },
        },
      )
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get(PORT).element)
      wrapper.unmount()
    })

    it('moves no focus when the form mounts with only a form-wide message', async () => {
      const { wrapper } = mountForm(
        {},
        {
          attachToBody: true,
          prepare: (deviceEdits) => {
            deviceEdits.errors[DEVICE_ID] = { name: null, port: null, form: 'Boom.' }
          },
        },
      )
      await flushPromises()
      expect(document.activeElement).toBe(document.body)
      wrapper.unmount()
    })

    it('moves no focus when it mounts without any message', async () => {
      const { wrapper } = mountForm({}, { attachToBody: true })
      await flushPromises()
      expect(document.activeElement).toBe(document.body)
      wrapper.unmount()
    })

    it('focuses the first field in error when a later APPLY is refused', async () => {
      const { wrapper, deviceEdits } = mountForm({}, { attachToBody: true })
      deviceEdits.errors[DEVICE_ID] = { name: null, port: 'Port busy.', form: null }
      deviceEdits.focusRequest.value += 1
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get(PORT).element)
      deviceEdits.errors[DEVICE_ID] = { name: 'Name taken.', port: 'Port busy.', form: null }
      deviceEdits.focusRequest.value += 1
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get(NAME).element)
      wrapper.unmount()
    })

    it('leaves focus alone when the refusal names no field', async () => {
      const { wrapper, deviceEdits } = mountForm({}, { attachToBody: true })
      deviceEdits.errors[DEVICE_ID] = { name: null, port: null, form: 'Boom.' }
      deviceEdits.focusRequest.value += 1
      await flushPromises()
      expect(document.activeElement).toBe(document.body)
      wrapper.unmount()
    })
  })

  it('has no accessibility violations, including with errors showing', async () => {
    const { wrapper, deviceEdits } = mountForm({ needs_identification: true })
    await expectNoAxeViolations(wrapper)
    deviceEdits.errors[DEVICE_ID] = { name: 'Name taken.', port: 'Port busy.', form: 'Boom.' }
    await wrapper.vm.$nextTick()
    await expectNoAxeViolations(wrapper)
  })
})
