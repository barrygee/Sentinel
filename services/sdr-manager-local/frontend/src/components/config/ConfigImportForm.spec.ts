import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import ConfigImportForm from './ConfigImportForm.vue'

const FILE_SELECTOR = '#sdr-manager-local-config-file'

function mountForm(busy = false): VueWrapper {
  return mount(ConfigImportForm, { props: { busy } })
}

/** Choose `fileText` as a file named `fileName` (none at all when `fileText` is null). */
async function pickFile(
  wrapper: VueWrapper,
  fileText: string | null,
  fileName = 'sdr.json',
): Promise<void> {
  const input = wrapper.get(FILE_SELECTOR)
  const files = fileText === null ? [] : [new File([fileText], fileName)]
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const TWO_DEVICES_AND_HOTSPOT = JSON.stringify({ devices: [{}, {}], hotspot: { ssid: 'x' } })

function checkboxes(wrapper: VueWrapper): { devices: HTMLInputElement; hotspot: HTMLInputElement } {
  const [devices, hotspot] = wrapper.findAll('input[type="checkbox"]')
  return {
    devices: devices!.element as HTMLInputElement,
    hotspot: hotspot!.element as HTMLInputElement,
  }
}

describe('ConfigImportForm', () => {
  it('starts with only the file chooser, labelled FILE', () => {
    const wrapper = mountForm()
    expect(wrapper.get('label').text()).toBe('FILE')
    expect(wrapper.get(FILE_SELECTOR).attributes('accept')).toBe('application/json,.json')
    expect(wrapper.find('.config-import-summary').exists()).toBe(false)
    // Only CHOOSE FILE: no CLEAR or IMPORT until a file is staged.
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['CHOOSE FILE'])
    expect(wrapper.get('.config-import-file-name').text()).toBe('No file chosen')
  })

  it('opens the hidden native picker from CHOOSE FILE, styled like the other buttons', async () => {
    const wrapper = mountForm()
    const input = wrapper.get(FILE_SELECTOR).element as HTMLInputElement
    const opened = vi.spyOn(input, 'click').mockImplementation(() => undefined)

    const choose = wrapper.get('button')
    expect(choose.classes()).toContain('sdr-devices-btn')
    expect(input.hidden).toBe(true)
    await choose.trigger('click')

    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('names the chosen file beside the button, and forgets it on CLEAR', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, JSON.stringify({ version: 1, devices: [{}] }), 'roof-pi.json')
    expect(wrapper.get('.config-import-file-name').text()).toBe('roof-pi.json')
    expect(wrapper.get('button').attributes('aria-describedby')).toContain(
      'sdr-manager-local-config-file-name',
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'CLEAR')!
      .trigger('click')

    expect(wrapper.get('.config-import-file-name').text()).toBe('No file chosen')
  })

  it('summarises a file with devices and hotspot settings', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT, 'backup.json')
    expect(wrapper.get('.config-import-summary').text()).toBe(
      'backup.json: 2 devices and hotspot settings.',
    )
  })

  it('uses the singular for one device and omits the hotspot when the file has none', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, JSON.stringify({ devices: [{}] }))
    expect(wrapper.get('.config-import-summary').text()).toBe('sdr.json: 1 device.')
  })

  it('treats an explicit null hotspot as no hotspot', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, JSON.stringify({ devices: [{}], hotspot: null }))
    expect(wrapper.get('.config-import-summary').text()).not.toContain('hotspot')
    expect(checkboxes(wrapper).hotspot.disabled).toBe(true)
  })

  it('applies devices by default and leaves hotspot settings off until chosen', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    const { devices, hotspot } = checkboxes(wrapper)
    expect(devices.checked).toBe(true)
    expect(hotspot.checked).toBe(false)
    expect(hotspot.disabled).toBe(false)
  })

  it('disables and unticks the device choice when the file holds no devices', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, JSON.stringify({ hotspot: { ssid: 'x' } }))
    const { devices } = checkboxes(wrapper)
    expect(devices.disabled).toBe(true)
    expect(devices.checked).toBe(false)
    expect(wrapper.get('.config-import-summary').text()).toBe(
      'sdr.json: 0 devices and hotspot settings.',
    )
  })

  it('emits exactly what was chosen when IMPORT is pressed', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('import')).toEqual([
      [
        {
          config: { devices: [{}, {}], hotspot: { ssid: 'x' } },
          apply_devices: true,
          apply_hotspot: true,
        },
      ],
    ])
  })

  it('disables IMPORT when neither kind is ticked', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows IMPORTING… and disables IMPORT while busy', async () => {
    const wrapper = mountForm(true)
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    const button = wrapper.get('button[type="submit"]')
    expect(button.text()).toBe('IMPORTING…')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('emits nothing when the form is submitted with no file chosen', async () => {
    const wrapper = mountForm()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('import')).toBeUndefined()
  })

  it('names a file that is not JSON and flags the field', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, 'not json at all', 'broken.json')
    expect(wrapper.get('#sdr-manager-local-config-file-error').text()).toBe(
      'broken.json is not valid JSON.',
    )
    const choose = wrapper.get('button')
    expect(choose.attributes('aria-invalid')).toBe('true')
    expect(choose.attributes('aria-describedby')).toBe(
      'sdr-manager-local-config-file-name sdr-manager-local-config-file-error',
    )
    expect(wrapper.find('.config-import-summary').exists()).toBe(false)
  })

  it.each([
    ['an array', '[1, 2]'],
    ['a string', '"hello"'],
    ['a number', '7'],
    ['null', 'null'],
  ])('refuses JSON that is %s rather than a configuration object', async (_kind, text) => {
    const wrapper = mountForm()
    await pickFile(wrapper, text, 'odd.json')
    expect(wrapper.get('.ba-form-field__error').text()).toBe(
      'odd.json doesn’t look like an SDR Manager configuration file.',
    )
    expect(wrapper.find('.config-import-summary').exists()).toBe(false)
  })

  it('leaves the field unflagged when there is no error', () => {
    // CHOOSE FILE carries the field's state: the hidden input is never focused.
    const choose = mountForm().get('button')
    expect(choose.attributes('aria-invalid')).toBe('false')
    expect(choose.attributes('aria-describedby')).toBe('sdr-manager-local-config-file-name')
  })

  it('flags the file field and describes it with the error while there is one', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, 'bad', 'odd.json')
    const choose = wrapper.get('button')
    expect(choose.attributes('aria-invalid')).toBe('true')
    expect(choose.attributes('aria-describedby')).toContain('sdr-manager-local-config-file-error')
    expect(wrapper.get('#sdr-manager-local-config-file-error').text()).toContain('odd.json')
    const input = wrapper.get(FILE_SELECTOR)
    expect(wrapper.get(`label[for="${input.attributes('id')}"]`).text()).toBe('FILE')
  })

  it('drops a previous file and its error when the choice is emptied', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    await pickFile(wrapper, null)
    expect(wrapper.find('.config-import-summary').exists()).toBe(false)
    await pickFile(wrapper, 'bad')
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(true)
    await pickFile(wrapper, null)
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
  })

  it('replaces an error with the summary when a good file follows a bad one', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, 'bad')
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    expect(wrapper.find('.config-import-summary').exists()).toBe(true)
  })

  it('resets the hotspot choice when another file is picked', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    expect(checkboxes(wrapper).hotspot.checked).toBe(false)
  })

  it('forgets the file from CLEAR', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    const clear = wrapper.findAll('button').find((button) => button.text() === 'CLEAR')
    await clear!.trigger('click')
    expect(wrapper.find('.config-import-summary').exists()).toBe(false)
  })

  it('exposes clear() to its parent, and it is harmless once the input is gone', async () => {
    const wrapper = mountForm()
    await pickFile(wrapper, 'bad')
    ;(wrapper.vm as unknown as { clear: () => void }).clear()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ba-form-field__error').exists()).toBe(false)
    const clear = (wrapper.vm as unknown as { clear: () => void }).clear
    wrapper.unmount()
    expect(() => clear()).not.toThrow()
  })

  it('has no accessibility violations before, during and after choosing a file', async () => {
    const wrapper = mountForm()
    await expectNoAxeViolations(wrapper)
    await pickFile(wrapper, 'bad')
    await expectNoAxeViolations(wrapper)
    await pickFile(wrapper, TWO_DEVICES_AND_HOTSPOT)
    await expectNoAxeViolations(wrapper)
  })
})
