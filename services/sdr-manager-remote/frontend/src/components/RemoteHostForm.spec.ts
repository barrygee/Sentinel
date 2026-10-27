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

  describe('editing an existing host (staged for APPLY CHANGES)', () => {
    function fields(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('.sdr-devices-form-input')
    }
    function lastDraft(wrapper: ReturnType<typeof mount>): unknown {
      const drafts = wrapper.emitted('draft')!
      return drafts[drafts.length - 1]![0]
    }

    it('has no SAVE or ADD button, only TEST CONNECTION and CANCEL', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      expect(wrapper.findAll('.sdr-devices-btn').map((button) => button.text())).toEqual([
        'TEST CONNECTION',
        'CANCEL',
      ])
      expect(wrapper.find('.sdr-devices-btn--primary').exists()).toBe(false)
    })

    it('emits nothing until a field is edited', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await flushPromises()
      expect(wrapper.emitted('draft')).toBeUndefined()
    })

    it('never saves on its own: editing only drafts', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await fields(wrapper)[1]!.setValue('Attic')
      await flushPromises()
      expect(mockUpdateSdrManagerHost).not.toHaveBeenCalled()
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('emits the edited fields as a draft, with the typed password', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await fields(wrapper)[0]!.setValue('10.0.0.9')
      await fields(wrapper)[1]!.setValue('Attic')
      await fields(wrapper)[2]!.setValue(9000)
      await fields(wrapper)[3]!.setValue('new-token')
      expect(lastDraft(wrapper)).toEqual({
        address: '10.0.0.9',
        name: 'Attic',
        port: 9000,
        authToken: 'new-token',
      })
    })

    it('emits a draft with a blank password when only the label changed', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await fields(wrapper)[1]!.setValue('')
      expect(lastDraft(wrapper)).toEqual({
        address: '192.168.1.50',
        name: '',
        port: 8000,
        authToken: '',
      })
    })

    it('emits null once the edits are reverted to what is saved', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await fields(wrapper)[1]!.setValue('Attic')
      expect(lastDraft(wrapper)).not.toBeNull()
      await fields(wrapper)[1]!.setValue('Roof Pi')
      expect(lastDraft(wrapper)).toBeNull()
    })

    it('counts a typed password as a change even when everything else matches', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await fields(wrapper)[3]!.setValue('x')
      expect(lastDraft(wrapper)).toMatchObject({ authToken: 'x' })
    })

    it('reopens on the staged draft instead of the saved values', () => {
      const wrapper = mount(RemoteHostForm, {
        props: {
          host: EXISTING_HOST,
          stagedDraft: { address: '10.1.1.1', name: 'Staged', port: 8100, authToken: 'tok' },
        },
      })
      const inputs = fields(wrapper)
      expect((inputs[0]!.element as HTMLInputElement).value).toBe('10.1.1.1')
      expect((inputs[1]!.element as HTMLInputElement).value).toBe('Staged')
      expect((inputs[2]!.element as HTMLInputElement).value).toBe('8100')
      expect((inputs[3]!.element as HTMLInputElement).value).toBe('tok')
    })

    it('reverting a reopened staged draft to the saved values emits null', async () => {
      const wrapper = mount(RemoteHostForm, {
        props: {
          host: EXISTING_HOST,
          stagedDraft: { address: '192.168.1.50', name: 'Staged', port: 8000, authToken: '' },
        },
      })
      await fields(wrapper)[1]!.setValue('Roof Pi')
      expect(lastDraft(wrapper)).toBeNull()
    })

    it('shows the reason APPLY CHANGES refused this host', () => {
      const wrapper = mount(RemoteHostForm, {
        props: { host: EXISTING_HOST, applyError: 'Port 1234 is already in use.' },
      })
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Port 1234 is already in use.')
    })

    it('shows no error when APPLY CHANGES has not refused it', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST, applyError: null } })
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
    })

    it('emits cancel from CANCEL', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      const cancel = wrapper
        .findAll('.sdr-devices-btn')
        .find((button) => button.text() === 'CANCEL')!
      await cancel.trigger('click')
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })
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

  it('labels the new-host action ADD and disables it while the host is being added', async () => {
    let finishCreate: (host: SdrManagerHost) => void = () => {}
    mockCreateSdrManagerHost.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve
      }),
    )
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const addButton = () => wrapper.find('.sdr-devices-btn--primary')
    expect(addButton().text()).toBe('ADD')
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await addButton().trigger('click')
    expect((addButton().element as HTMLButtonElement).disabled).toBe(true)
    finishCreate(makeSavedHost())
    await flushPromises()
    expect((addButton().element as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not emit drafts while a new host is being typed', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    expect(wrapper.emitted('draft')).toBeUndefined()
  })

  it('trims the address when adding a host', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('  10.0.0.9  ')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
      expect.objectContaining({ address: '10.0.0.9' }),
    )
  })

  it('shows the add error from the API above a later successful retry, then clears it', async () => {
    mockCreateSdrManagerHost.mockRejectedValueOnce(
      new SdrManagerApiError(409, 'duplicate', 'Host already exists.'),
    )
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.sdr-devices-form-input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Host already exists.')
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
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

    it('has no ADD or SAVE button, only TEST CONNECTION and CANCEL', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      expect(wrapper.find('.sdr-devices-btn--primary').exists()).toBe(false)
      expect(wrapper.findAll('.sdr-devices-btn').map((button) => button.text())).toEqual([
        'TEST CONNECTION',
        'CANCEL',
      ])
    })

    it('drafts a label edit without saving, and without creating or updating anything', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      await wrapper.find('input[aria-label="SDR host label"]').setValue('Shack')
      const drafts = wrapper.emitted('draft')!
      expect(drafts[drafts.length - 1]![0]).toMatchObject({ name: 'Shack' })
      expect(mockUpdateSdrManagerHost).not.toHaveBeenCalled()
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('drafts null once the label is back to what is saved', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      const labelInput = wrapper.find('input[aria-label="SDR host label"]')
      await labelInput.setValue('Shack')
      await labelInput.setValue('')
      const drafts = wrapper.emitted('draft')!
      expect(drafts[drafts.length - 1]![0]).toBeNull()
    })

    it('reopens on the staged label', () => {
      const wrapper = mount(RemoteHostForm, {
        props: {
          host: LOCAL_HOST,
          stagedDraft: {
            address: 'host.docker.internal',
            name: 'Shack',
            port: 8000,
            authToken: '',
          },
        },
      })
      expect(
        (wrapper.find('input[aria-label="SDR host label"]').element as HTMLInputElement).value,
      ).toBe('Shack')
    })

    it("shows the API's refusal handed back by APPLY CHANGES", () => {
      const wrapper = mount(RemoteHostForm, {
        props: { host: LOCAL_HOST, applyError: 'This machine is managed by Sentinel.' },
      })
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        'This machine is managed by Sentinel.',
      )
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
