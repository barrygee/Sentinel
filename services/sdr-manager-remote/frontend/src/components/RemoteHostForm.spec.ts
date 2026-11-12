import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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
    previewCertificate: vi.fn(),
  }
})

import { createHost, updateHost, testHost, previewCertificate } from '../api/sdrManagerRemoteApi'

const mockCreateSdrManagerHost = vi.mocked(createHost)
const mockUpdateSdrManagerHost = vi.mocked(updateHost)
const mockTestSdrManagerHost = vi.mocked(testHost)
const mockPreviewCertificate = vi.mocked(previewCertificate)

const FINGERPRINT = Array(32).fill('AB').join(':')
const TLS_PREVIEW = {
  tls_available: true,
  detail: 'ok',
  fingerprint: FINGERPRINT,
  subject: 'CN=Roof Pi authority',
  not_valid_after: 'Nov 10 12:00:00 2036 GMT',
  matches_pinned: null,
}
const NO_TLS_PREVIEW = {
  tls_available: false,
  detail:
    "This SDR host doesn't offer HTTPS: its console password would cross the network unencrypted.",
}

/** ADD, then the certificate check's confirm button: how every new host is added now. */
async function addThroughTheCheck(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.sdr-devices-btn--primary').trigger('click')
  await flushPromises()
  await wrapper.find('.remote-host-certificate .sdr-devices-btn--primary').trigger('click')
  await flushPromises()
}

const EXISTING_HOST: SdrManagerHost = {
  id: 5,
  name: 'Roof Pi',
  address: '192.168.1.50',
  port: 8000,
  enabled: true,
  auth_token_set: true,
  is_local: false,
  may_use_private: false,
  auto_add_sdrs: false,
  created_at: 0,
  last_seen_at: 100,
  last_error: null,
  reachable: true,
  api_version: '1.0.0',
  transport: 'https',
  tls_fingerprint: FINGERPRINT,
  tls_state: 'pinned',
}

function makeSavedHost(overrides: Partial<SdrManagerHost> = {}): SdrManagerHost {
  return { ...EXISTING_HOST, ...overrides }
}

/** Each visible `<label>` caption mapped to the aria-label of the control its `for` points at. */
function captionTargets(wrapper: VueWrapper): Record<string, string | undefined> {
  return Object.fromEntries(
    wrapper
      .findAll('label.ba-form-field__label')
      .map((label) => [
        label.text(),
        wrapper.find(`#${label.attributes('for')}`).attributes('aria-label'),
      ]),
  )
}

describe('RemoteHostForm', () => {
  beforeEach(() => {
    // The form's MORE disclosure reads appStore.isOnline to decide
    // whether the site map can load, so these mounts need an active Pinia.
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockPreviewCertificate.mockResolvedValue(TLS_PREVIEW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults a new form to port 8000 and an empty address/label', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const inputs = wrapper.findAll('.ba-text-field__input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('8000')
  })

  it('prefills the form from an existing host', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const inputs = wrapper.findAll('.ba-text-field__input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('192.168.1.50')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('Roof Pi')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('8000')
  })

  it('shows the "password set" placeholder for a host with a stored password', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const tokenInput = wrapper.findAll('.ba-text-field__input')[3]!
    expect(tokenInput.attributes('placeholder')).toBe('Password set — leave blank to keep it')
  })

  it.each([
    [0, '192.168.1.99'],
    [2, '9000'],
    [2, ''],
  ])('asks for the password again once input %i moves the host', async (index, value) => {
    // The backend drops the stored password when the address or port changes.
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const inputs = wrapper.findAll('.ba-text-field__input')
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
    const tokenInput = wrapper.findAll('.ba-text-field__input')[3]!
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
    const inputs = wrapper.findAll('.ba-text-field__input')
    await inputs[0]!.setValue('10.0.0.9')
    await inputs[1]!.setValue('Attic')
    await inputs[3]!.setValue('secret-token')
    await addThroughTheCheck(wrapper)
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith({
      name: 'Attic',
      address: '10.0.0.9',
      port: 8000,
      auth_token: 'secret-token',
      auto_add_sdrs: false,
      transport: 'https',
      tls_fingerprint: FINGERPRINT,
    })
    expect(mockPreviewCertificate).toHaveBeenCalledWith({ address: '10.0.0.9', port: 8000 })
    expect(mockTestSdrManagerHost).toHaveBeenCalledWith(5)
    // A reachable host needs no message.
    expect(wrapper.find('.remote-host-probe').exists()).toBe(false)
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('sends an explicit null name when the label is left blank on create', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
      expect.objectContaining({ name: null, auth_token: '' }),
    )
  })

  describe('ADD SDRS', () => {
    function autoAddRadios(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('[role="radio"]')
    }

    it('starts a new host on MANUALLY, saying how its SDRs become radios', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      expect(autoAddRadios(wrapper)[0]!.attributes('aria-checked')).toBe('true')
      expect(wrapper.find('.remote-host-auto-add-note').text()).toBe(
        'Choose which of its SDRs become radios with ADD.',
      )
      // The group is named by its label, unique to the new-host form.
      const labelId = wrapper.find('[role="radiogroup"]').attributes('aria-labelledby')
      expect(labelId).toBe('remote-host-new-auto-add-label')
      expect(wrapper.find(`#${labelId}`).text()).toBe('ADD SDRS')
    })

    it('lets the ADD SDRS pills wrap under their caption on a narrow screen', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      const row = wrapper.get('[role="radiogroup"]').element.closest('.ba-form-field')!
      expect(row.classList.contains('ba-form-field--wrap-control')).toBe(true)
    })

    it('adds a host set to AUTOMATICALLY with auto_add_sdrs on', async () => {
      mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
      mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
      await autoAddRadios(wrapper)[1]!.trigger('click')
      expect(wrapper.find('.remote-host-auto-add-note').exists()).toBe(false)
      await addThroughTheCheck(wrapper)
      expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
        expect.objectContaining({ address: '10.0.0.9', auto_add_sdrs: true }),
      )
    })

    it("shows an existing host's setting, under its own label id", () => {
      const wrapper = mount(RemoteHostForm, {
        props: { host: makeSavedHost({ auto_add_sdrs: true }) },
      })
      expect(autoAddRadios(wrapper)[1]!.attributes('aria-checked')).toBe('true')
      expect(wrapper.find('[role="radiogroup"]').attributes('aria-labelledby')).toBe(
        'remote-host-5-auto-add-label',
      )
    })

    it('stages a change to it as a draft, and none once switched back', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await autoAddRadios(wrapper)[1]!.trigger('click')
      const drafts = () => wrapper.emitted('draft')!
      expect(drafts().at(-1)![0]).toEqual({
        address: '192.168.1.50',
        name: 'Roof Pi',
        port: 8000,
        authToken: '',
        autoAddSdrs: true,
      })
      await autoAddRadios(wrapper)[0]!.trigger('click')
      expect(drafts().at(-1)![0]).toBeNull()
    })
  })

  describe('editing an existing host (staged for APPLY CHANGES)', () => {
    function fields(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('.ba-text-field__input')
    }
    function lastDraft(wrapper: ReturnType<typeof mount>): unknown {
      const drafts = wrapper.emitted('draft')!
      return drafts[drafts.length - 1]![0]
    }

    it('has no SAVE or ADD button, only CHECK CERTIFICATE, TEST CONNECTION and CANCEL', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      expect(wrapper.findAll('.sdr-devices-btn').map((button) => button.text())).toEqual([
        'CHECK CERTIFICATE',
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
        autoAddSdrs: false,
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
        autoAddSdrs: false,
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
          stagedDraft: {
            address: '10.1.1.1',
            name: 'Staged',
            port: 8100,
            authToken: 'tok',
            autoAddSdrs: false,
          },
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
          stagedDraft: {
            address: '192.168.1.50',
            name: 'Staged',
            port: 8000,
            authToken: '',
            autoAddSdrs: false,
          },
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
    const inputs = wrapper.findAll('.ba-text-field__input')
    await inputs[0]!.setValue('10.0.0.9')
    await inputs[2]!.setValue(0)
    await addThroughTheCheck(wrapper)
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(expect.objectContaining({ port: 8000 }))
  })

  it("shows the host's rejection message verbatim, including which device holds a conflicting port", async () => {
    mockCreateSdrManagerHost.mockRejectedValue(
      new SdrManagerApiError(409, 'port_conflict', 'Port 1234 is already in use by device rtl-3.', {
        conflicting_device_id: 'rtl-3',
      }),
    )
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
      'Port 1234 is already in use by device rtl-3.',
    )
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('falls back to a generic save-failed message for a non-SdrManagerApiError failure', async () => {
    mockCreateSdrManagerHost.mockRejectedValue(new Error('boom'))
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Save failed.')
  })

  it('labels the new-host action ADD, and says CHECKING while it reads the certificate', async () => {
    let finishPreview: (preview: typeof TLS_PREVIEW) => void = () => {}
    mockPreviewCertificate.mockReturnValue(
      new Promise((resolve) => {
        finishPreview = resolve
      }),
    )
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    const addButton = () => wrapper.find('.sdr-devices-btn--primary')
    expect(addButton().text()).toBe('ADD')
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addButton().trigger('click')
    expect(addButton().text()).toBe('CHECKING')
    expect((addButton().element as HTMLButtonElement).disabled).toBe(true)
    finishPreview(TLS_PREVIEW)
    await flushPromises()
    // The check replaces the actions row until the operator decides.
    expect(addButton().text()).toBe('TRUST AND ADD')
    expect((addButton().element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables TRUST AND ADD while the host is being added', async () => {
    let finishCreate: (host: SdrManagerHost) => void = () => {}
    mockCreateSdrManagerHost.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve
      }),
    )
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    const trustButton = () => wrapper.find('.remote-host-certificate .sdr-devices-btn--primary')
    await trustButton().trigger('click')
    expect((trustButton().element as HTMLButtonElement).disabled).toBe(true)
    finishCreate(makeSavedHost())
    await flushPromises()
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  describe('the certificate check on ADD', () => {
    async function openCheck(wrapper: VueWrapper): Promise<void> {
      await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
      await wrapper.findAll('.ba-text-field__input')[2]!.setValue(8123)
      await wrapper.find('.sdr-devices-btn--primary').trigger('click')
      await flushPromises()
    }

    it('shows the fingerprint to compare and adds nothing until trusted', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      expect(mockPreviewCertificate).toHaveBeenCalledWith({ address: '10.0.0.9', port: 8123 })
      expect(wrapper.find('.remote-host-certificate-fingerprint').text()).toContain('AB:AB')
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
    })

    it('adds a host without HTTPS over plain HTTP only when asked to', async () => {
      mockPreviewCertificate.mockResolvedValue(NO_TLS_PREVIEW)
      mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
      mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      const confirm = wrapper.find('.remote-host-certificate .sdr-devices-btn--primary')
      expect(confirm.text()).toBe('ADD WITHOUT ENCRYPTION')
      await confirm.trigger('click')
      await flushPromises()
      expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
        expect.objectContaining({ transport: 'http' }),
      )
      expect(mockCreateSdrManagerHost.mock.calls[0]![0]).not.toHaveProperty('tls_fingerprint')
    })

    it('CANCEL closes the check and brings back ADD, without adding', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      await wrapper.find('.remote-host-certificate .sdr-devices-btn').trigger('click')
      expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
      expect(wrapper.find('.sdr-devices-btn--primary').text()).toBe('ADD')
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
    })

    it("shows why the host's certificate could not be read", async () => {
      mockPreviewCertificate.mockRejectedValue(
        new SdrManagerApiError(502, 'host_unreachable', 'Could not reach SDR host 10.0.0.9:8123.'),
      )
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        'Could not reach SDR host 10.0.0.9:8123.',
      )
      expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
    })

    it('falls back to a generic message when the read fails some other way', async () => {
      mockPreviewCertificate.mockRejectedValue(new Error('boom'))
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        "Could not read the host's certificate.",
      )
    })

    it('closes a check the host no longer matches, so ADD reads it again', async () => {
      mockCreateSdrManagerHost.mockRejectedValue(
        new SdrManagerApiError(409, 'certificate_changed', 'Check it again.', {
          fingerprint: 'CD:CD',
        }),
      )
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await openCheck(wrapper)
      await wrapper.find('.remote-host-certificate .sdr-devices-btn--primary').trigger('click')
      await flushPromises()
      expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Check it again.')
    })

    it('does nothing if asked to add with no check open', async () => {
      // TRUST AND ADD exists only while a check is open; the guard is defensive.
      const wrapper = mount(RemoteHostForm, { props: { host: null } })
      await (wrapper.vm as unknown as { addHost: () => Promise<void> }).addHost()
      expect(mockCreateSdrManagerHost).not.toHaveBeenCalled()
    })

    it('has no accessibility violations while the check is open', async () => {
      const wrapper = mount(RemoteHostForm, { props: { host: null }, attachTo: document.body })
      await openCheck(wrapper)
      expect(await axe(wrapper.element)).toHaveNoViolations()
      wrapper.unmount()
    })
  })

  it('does not emit drafts while a new host is being typed', async () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    expect(wrapper.emitted('draft')).toBeUndefined()
  })

  it('trims the address when adding a host', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('  10.0.0.9  ')
    await addThroughTheCheck(wrapper)
    expect(mockCreateSdrManagerHost).toHaveBeenCalledWith(
      expect.objectContaining({ address: '10.0.0.9' }),
    )
  })

  it('shows the add error from the API above a later successful retry, then clears it', async () => {
    mockCreateSdrManagerHost.mockRejectedValueOnce(
      new SdrManagerApiError(409, 'duplicate', 'Host already exists.'),
    )
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Host already exists.')
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
    await addThroughTheCheck(wrapper)
    expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
  })

  it('does not fail the save when the post-save probe itself fails', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockRejectedValue(new Error('probe unreachable'))
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
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
    expect(wrapper.find('.remote-host-probe').text()).toBe('Connection refused')
  })

  it('reports a probe failure inline when TEST CONNECTION throws', async () => {
    mockTestSdrManagerHost.mockRejectedValue(new Error('network down'))
    const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
    const testButton = wrapper
      .findAll('.sdr-devices-btn')
      .find((button) => button.text() === 'TEST CONNECTION')!
    await testButton.trigger('click')
    await flushPromises()
    expect(wrapper.find('.remote-host-probe').text()).toBe(
      'Could not reach Sentinel to run the probe.',
    )
  })

  describe('the test button', () => {
    const testButton = (wrapper: VueWrapper) => wrapper.find('.remote-host-test button')

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('says connecting, and can’t be pressed, while the test runs', async () => {
      let finishTest: (result: { reachable: boolean; detail: string }) => void = () => {}
      mockTestSdrManagerHost.mockReturnValue(new Promise((resolve) => (finishTest = resolve)))
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      expect(testButton(wrapper).text()).toBe('CONNECTING')
      expect(testButton(wrapper).attributes('disabled')).toBeDefined()
      finishTest({ reachable: true, detail: 'ok' })
      await flushPromises()
    })

    it('shows a success on the button, with no message or status dot', async () => {
      mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      expect(testButton(wrapper).text()).toBe('SUCCESSFULLY CONNECTED')
      expect(testButton(wrapper).attributes('disabled')).toBeDefined()
      expect(wrapper.find('.remote-host-probe').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('ok')
    })

    it('shows a failure on the button, with the reason below', async () => {
      mockTestSdrManagerHost.mockResolvedValue({ reachable: false, detail: 'Connection refused' })
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      expect(testButton(wrapper).text()).toBe('UNSUCCESSFUL')
      expect(wrapper.find('.remote-host-probe').text()).toBe('Connection refused')
    })

    it('shows a test that couldn’t run as a failure', async () => {
      mockTestSdrManagerHost.mockRejectedValue(new Error('network down'))
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      expect(testButton(wrapper).text()).toBe('UNSUCCESSFUL')
    })

    it('holds the result, then can be run again', async () => {
      mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      vi.advanceTimersByTime(3999)
      await nextTick()
      expect(testButton(wrapper).text()).toBe('SUCCESSFULLY CONNECTED')
      vi.advanceTimersByTime(1)
      await nextTick()
      expect(testButton(wrapper).text()).toBe('TEST CONNECTION')
      expect(testButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('clears the old reason when a new test starts', async () => {
      mockTestSdrManagerHost.mockResolvedValueOnce({ reachable: false, detail: 'Refused' })
      mockTestSdrManagerHost.mockResolvedValueOnce({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      vi.advanceTimersByTime(4000)
      await nextTick()
      await testButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.find('.remote-host-probe').exists()).toBe(false)
    })

    it('cancels the pending reset when the form closes', async () => {
      mockTestSdrManagerHost.mockResolvedValue({ reachable: true, detail: 'ok' })
      const wrapper = mount(RemoteHostForm, { props: { host: EXISTING_HOST } })
      await testButton(wrapper).trigger('click')
      await flushPromises()
      const pendingTimers = vi.getTimerCount()
      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(pendingTimers - 1)
    })
  })

  it('reports why a newly added host could not be reached', async () => {
    mockCreateSdrManagerHost.mockResolvedValue(makeSavedHost())
    mockTestSdrManagerHost.mockResolvedValue({ reachable: false, detail: 'Connection refused' })
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    await wrapper.findAll('.ba-text-field__input')[0]!.setValue('10.0.0.9')
    await addThroughTheCheck(wrapper)
    expect(wrapper.find('.remote-host-probe').text()).toBe('Connection refused')
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

  it('ties each visible caption to its input', () => {
    const wrapper = mount(RemoteHostForm, { props: { host: null } })
    expect(captionTargets(wrapper)).toEqual({
      'IP ADDRESS': 'SDR host IP address or hostname',
      LABEL: 'SDR host label',
      PORT: 'SDR Manager API port',
      'CONSOLE PASSWORD': 'SDR host console password',
    })
  })

  it('focuses the address field shortly after mount', async () => {
    vi.useFakeTimers()
    const wrapper = mount(RemoteHostForm, {
      props: { host: null },
      attachTo: document.body,
    })
    const addressInput = wrapper.findAll('.ba-text-field__input')[0]!.element as HTMLInputElement
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
      may_use_private: true,
      auto_add_sdrs: false,
    })

    it('shows only the label and ADD SDRS, with a note that the row is linked automatically', () => {
      const wrapper = mount(RemoteHostForm, { props: { host: LOCAL_HOST } })
      const labels = wrapper.findAll('.ba-form-field__label').map((label) => label.text())
      expect(labels).toEqual(['LABEL', 'ADD SDRS'])
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
            autoAddSdrs: false,
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
