import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostForm from './RemoteHostForm.vue'
import { SdrManagerApiError } from '../api/sdrManagerRemoteApi'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

vi.mock('../api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sdrManagerRemoteApi')>()
  return {
    ...actual,
    createHost: vi.fn(),
    updateHost: vi.fn(),
    testHost: vi.fn(),
  }
})

import { createHost, updateHost, testHost } from '../api/sdrManagerRemoteApi'

const mockCreateSdrManagerHost = vi.mocked(createHost)
const mockUpdateSdrManagerHost = vi.mocked(updateHost)
const mockTestSdrManagerHost = vi.mocked(testHost)

const EXISTING_HOST: SdrManagerHost = {
  id: 5,
  name: 'Roof Pi',
  address: '192.168.1.50',
  port: 8000,
  enabled: true,
  auth_token_set: true,
  is_local: false,
  created_at: 0,
  last_seen_at: 100,
  last_error: null,
  reachable: true,
  api_version: '1.0.0',
}

function makeSavedHost(overrides: Partial<SdrManagerHost> = {}): SdrManagerHost {
  return { ...EXISTING_HOST, ...overrides }
}

describe('RemoteHostForm', () => {
  beforeEach(() => {
    // The form's MORE disclosure reads appStore.isOnline to decide
    // whether the site map can load, so these mounts need an active Pinia.
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults a new form to port 8000 and an empty address/label', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('8000')
  })

  it('prefills the form from an existing host', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('192.168.1.50')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('Roof Pi')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('8000')
  })

  it('shows the "password set" placeholder for a host with a stored password', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const tokenInput = wrapper.findAll('.sdr-devices-form-input')[3]!
    expect(tokenInput.attributes('placeholder')).toBe('Password set — leave blank to keep it')
  })

  it.each([
    [0, '192.168.1.99'],
    [2, '9000'],
    [2, ''],
  ])('asks for the password again once input %i moves the host', async (index, value) => {
    // The backend drops the stored password when the address or port changes.
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    await inputs[index]!.setValue(value)
    const expected =
      value === ''
        ? 'Password set — leave blank to keep it'
        : 'Address changed — enter the password again'
    expect(inputs[3]!.attributes('placeholder')).toBe(expected)
  })

  it('shows a plain optional-token placeholder for a host without a stored token', async () => {
    const wrapper = mount(RemoteHostForm, {
      props: { host: { ...EXISTING_HOST, auth_token_set: false } },
    })
    const tokenInput = wrapper.findAll('.sdr-devices-form-input')[3]!
    expect(tokenInput.attributes('placeholder')).toBe("The password set on that host's console")
  })

  it('does not render TEST CONNECTION for a new (unsaved) host', () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    expect(
      wrapper.findAll('.sdr-devices-btn').some((btn) => btn.text() === 'TEST CONNECTION'),
    ).toBe(false)
  })

  it('requires an IP address before saving a new host', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('IP address is required.')
    expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
  })

  it('creates a new host and probes it after a successful save', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    await inputs[0]!.setValue('10.0.0.9')
    await inputs[1]!.setValue('Attic')
    await inputs[3]!.setValue('secret-token')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith({
      name: 'Attic',
      address: '10.0.0.9',
      port: 8000,
      auth_token: 'secret-token',
    })
    expect(mockTestSdrManagerHost).toHaveBeenCalledWith(5)
    expect(wrapper.find('.remote-host-probe').text()).toContain('ok')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('sends an explicit null name when the label is left blank on create', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
      expect.objectContaining({ name: null, auth_token: '' }),
    )
  })

  it('updates an existing host, omitting auth_token when left blank', async () => {
    mockUpdateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    const patch = mockUpdateSdrManagerHost.mock.calls[0]![1]
    expect(mockUpdateSdrManagerHost).toHaveBeenCalledWith(5, expect.anything())
    expect(patch).not.toHaveProperty('auth_token')
    expect(patch).toMatchObject({ name: 'Roof Pi', address: '192.168.1.50', port: 8000 })
  })

  it('includes auth_token in the patch when the operator types a new one', async () => {
    mockUpdateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    await wrapper.findAll('.sdr-devices-form-input')[3]!.setValue('new-token')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockUpdateSdrManagerHost.mock.calls[0]![1]).toMatchObject({ auth_token: 'new-token' })
  })

  it('clears the label to null on update when the field is emptied', async () => {
    mockUpdateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    await wrapper.findAll('.sdr-devices-form-input')[1]!.setValue('')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockUpdateSdrManagerHost.mock.calls[0]![1]).toMatchObject({ name: null })
  })

  it('defaults the port to 8000 when cleared to a falsy value', async () => {
    mockUpdateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    await wrapper.findAll('.sdr-devices-form-input')[2]!.setValue(0)
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockUpdateSdrManagerHost.mock.calls[0]![1]).toMatchObject({ port: 8000 })
  })

  it('defaults the port to 8000 on create when cleared to a falsy value', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    await inputs[0]!.setValue('10.0.0.9')
    await inputs[2]!.setValue(0)
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(expect.objectContaining({ port: 8000 }))
  })

  it("shows the host's rejection message verbatim, including which device holds a conflicting port", async () => {
    mockCreateSdrManagerHost.mockRejectedValue(
      new SdrManagerApiError(409, 'port_conflict', 'Port 1234 is already in use by device rtl-3.', {
        conflicting_device_id: 'rtl-3',
      }),
    )
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
      'Port 1234 is already in use by device rtl-3.',
    )
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('falls back to a generic save-failed message for a non-SdrManagerApiError failure', async () => {
    mockCreateSdrManagerHost.mockRejectedValue(new Error('boom'))
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Save failed.')
  })

  it('does not fail the save when the post-save probe itself fails', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockRejectedValue(new Error('probe unreachable'))
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.find('.remote-host-probe').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
  })

  it('probes an existing host on TEST CONNECTION and shows an unreachable result', async () => {
    mockTestSdrManagerHost.mockResolvedValue({ reachable: false, detail: 'Connection refused' })
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const testButton = wrapper
      .findAll('.sdr-devices-btn')
      .find((button) => button.text() === 'TEST CONNECTION')!
    await testButton.trigger('click')
    await flushPromises()
    expect(mockTestSdrManagerHost).toHaveBeenCalledWith(5)
    expect(wrapper.find('.remote-host-probe--fail').text()).toContain('Connection refused')
  })

  it('reports a probe failure inline when TEST CONNECTION throws', async () => {
    mockTestSdrManagerHost.mockRejectedValue(new Error('network down'))
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const testButton = wrapper
      .findAll('.sdr-devices-btn')
      .find((button) => button.text() === 'TEST CONNECTION')!
    await testButton.trigger('click')
    await flushPromises()
    expect(wrapper.find('.remote-host-probe--fail').text()).toContain(
      'Could not reach Sentinel to run the probe.',
    )
  })

  it('does nothing when probeExisting is invoked without a stored host', async () => {
    // TEST CONNECTION is only ever rendered when a host is present
    // (`v-if="host"`), so this defensive guard cannot be reached by clicking
    // through the UI. Exercised directly to prove it returns without probing.
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await (wrapper.vm as unknown as { probeExisting: () => Promise<void> }).probeExisting()
    expect(mockTestSdrManagerHost).not.toHaveBeenCalled()
    expect(wrapper.find('.remote-host-probe').exists()).toBe(false)
  })

  it('emits cancel when CANCEL is clicked', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.find('.sdr-devices-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('focuses the address field shortly after mount', async () => {
    vi.useFakeTimers()
    const wrapper = mount(RemoteHostForm, {
      props: { host: null },
      attachTo: document.body,
    })
    const addressInput = wrapper.findAll('.sdr-devices-form-input')[0]!.element as HTMLInputElement
    vi.runAllTimers()
    expect(document.activeElement).toBe(addressInput)
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  describe("this machine's row (is_local)", () => {
    const LOCAL_HOST = makeSavedHost({
      id: 9,
      name: null,
      address: 'host.docker.internal',
      auth_token_set: false,
      is_local: true,
    })

    it('shows only the label field, with a note that the row is linked automatically', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      const labels = wrapper.findAll('.sdr-devices-form-label').map((label) => label.text())
      expect(labels).toEqual(['LABEL'])
      expect(wrapper.find('input[aria-label="SDR host IP address or hostname"]').exists()).toBe(
        false,
      )
      expect(wrapper.find('input[type="password"]').exists()).toBe(false)
      expect(wrapper.find('.remote-host-local-note').text()).toContain('Linked automatically')
      const labelInput = wrapper.find('input[aria-label="SDR host label"]')
      expect(labelInput.attributes('placeholder')).toBe('This machine')
    })

    it('saves the label alone, never the address, port or password', async () => {
      mockUpdateSdrManagerHost.mockResolvedValue({ ...LOCAL_HOST, name: 'Shack' })
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('input[aria-label="SDR host label"]').setValue('  Shack  ')
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      await flushPromises()
      expect(mockUpdateSdrManagerHost).toHaveBeenCalledTimes(1)
      expect(mockUpdateSdrManagerHost).toHaveBeenCalledWith(9, { name: 'Shack' })
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
      // No post-save probe for this machine: its connection is not the operator's.
      expect(mockTestSdrManagerHost).not.toHaveBeenCalled()
      expect(wrapper.emitted('save')).toHaveLength(1)
    })

    it('clears the label to null when the field is left blank', async () => {
      mockUpdateSdrManagerHost.mockResolvedValue(LOCAL_HOST)
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('input[aria-label="SDR host label"]').setValue('   ')
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      await flushPromises()
      expect(mockUpdateSdrManagerHost).toHaveBeenCalledWith(9, { name: null })
    })

    it("shows the API's rejection and does not emit save when the label is refused", async () => {
      mockUpdateSdrManagerHost.mockRejectedValue(
        new SdrManagerApiError(409, 'local_host_managed', 'This machine is managed by Sentinel.'),
      )
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        'This machine is managed by Sentinel.',
      )
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(
        (wrapper.find('.sdr-devices-btn--primary').element as HTMLButtonElement).disabled,
      ).toBe(false)
    })

    it('falls back to a generic message for a failure that is not a host rejection', async () => {
      mockUpdateSdrManagerHost.mockRejectedValue(new TypeError('boom'))
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Save failed.')
    })

    it('disables SAVE while the label is being saved', async () => {
      let finishSave: (host: SdrManagerHost) => void = () => {}
      mockUpdateSdrManagerHost.mockReturnValue(
        new Promise((resolve) => {
          finishSave = resolve
        }),
      )
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      expect(
        (wrapper.find('.sdr-devices-btn--primary').element as HTMLButtonElement).disabled,
      ).toBe(true)
      finishSave(LOCAL_HOST)
      await flushPromises()
      expect(
        (wrapper.find('.sdr-devices-btn--primary').element as HTMLButtonElement).disabled,
      ).toBe(false)
    })

    it('focuses the label field shortly after mount, as there is no address field', () => {
      vi.useFakeTimers()
      const wrapper = mount(RemoteHostForm, {
        props: { host: LOCAL_HOST },
        attachTo: document.body,
      })
      vi.runAllTimers()
      expect(document.activeElement).toBe(
        wrapper.find('input[aria-label="SDR host label"]').element,
      )
      wrapper.unmount()
    })

    it('has no accessibility violations', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      expect(
        await axe(wrapper.html(), {
          rules: { region: { enabled: false } },
        }),
      ).toHaveNoViolations()
    })
  })
})
