import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import type { LocalConfigFile, LocalConfigImportResult } from '../../api/types'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeAuthState } from '../../testing/factories'
import ConfigImportForm from './ConfigImportForm.vue'
import ConfigImportReport from './ConfigImportReport.vue'
import ConfigTransferControl from './ConfigTransferControl.vue'

vi.mock('../../api/sdrManagerLocalApi')

const IMPORT_RESULT: LocalConfigImportResult = {
  devices: [],
  devices_applied: 2,
  devices_skipped: 0,
  devices_failed: 0,
  hotspot_applied: false,
  hotspot_detail: '',
  console_password_applied: false,
  console_password_detail: '',
  generated_at: 0,
}

let createObjectUrl: ReturnType<typeof vi.fn>
let revokeObjectUrl: ReturnType<typeof vi.fn>
let anchorClicks: { href: string; download: string }[]

function mountControl(): VueWrapper {
  const auth = useLocalAuthStore()
  auth.loaded = true
  auth.passwordSet = false
  return mount(ConfigTransferControl)
}

function exportButton(wrapper: VueWrapper) {
  return wrapper.findAll('button').find((button) => button.text() === 'DOWNLOAD CONFIGURATION')!
}

async function chooseFile(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.get('#sdr-manager-local-config-file')
  Object.defineProperty(input.element, 'files', {
    value: [new File([text], 'backup.json')],
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}

describe('ConfigTransferControl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ password_set: false }))
    vi.mocked(api.listDevices).mockRejectedValue(new Error('offline'))
    createObjectUrl = vi.fn(() => 'blob:config')
    revokeObjectUrl = vi.fn()
    Object.assign(URL, { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl })
    anchorClicks = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchorClicks.push({ href: this.href, download: this.download })
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('export', () => {
    it('saves the exported configuration as a pretty-printed JSON file', async () => {
      vi.mocked(api.getConfig).mockResolvedValue({ version: 1, devices: [] })
      const wrapper = mountControl()
      await exportButton(wrapper).trigger('click')
      await flushPromises()
      expect(anchorClicks).toEqual([
        { href: 'blob:config', download: 'sdr-manager-local-config.json' },
      ])
      const blob = createObjectUrl.mock.calls[0]![0] as Blob
      expect(blob.type).toBe('application/json')
      expect(await blob.text()).toBe(`${JSON.stringify({ version: 1, devices: [] }, null, 2)}\n`)
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:config')
    })

    it('disables the button while the file is being fetched', async () => {
      let finish: (value: LocalConfigFile) => void = () => undefined
      vi.mocked(api.getConfig).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const wrapper = mountControl()
      await exportButton(wrapper).trigger('click')
      expect(exportButton(wrapper).attributes('disabled')).toBeDefined()
      finish({})
      await flushPromises()
      expect(exportButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('shows an alert, saves nothing and re-enables the button when the export fails', async () => {
      vi.mocked(api.getConfig).mockRejectedValue(
        new SdrManagerApiError(401, 'unauthorized', 'Sign in first.'),
      )
      const wrapper = mountControl()
      await exportButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe('Sign in first.')
      expect(anchorClicks).toEqual([])
      expect(exportButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('falls back to a plain sentence for an error that is not from the API', async () => {
      vi.mocked(api.getConfig).mockRejectedValue(new TypeError('network'))
      const wrapper = mountControl()
      await exportButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe(
        'Could not read this machine’s configuration.',
      )
    })
  })

  describe('import', () => {
    it('imports the chosen file, reports the result, announces it and refreshes dependants', async () => {
      vi.mocked(api.importConfig).mockResolvedValue(IMPORT_RESULT)
      const wrapper = mountControl()
      await chooseFile(wrapper, JSON.stringify({ devices: [{}, {}] }))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(api.importConfig).toHaveBeenCalledWith({
        config: { devices: [{}, {}] },
        apply_devices: true,
        apply_hotspot: false,
      })
      expect(wrapper.findComponent(ConfigImportReport).props('result')).toEqual(IMPORT_RESULT)
      expect(useLocalSdrStore().announcement).toBe('Configuration imported: 2 applied.')
      expect(api.listDevices).toHaveBeenCalled()
      expect(api.getAuthState).toHaveBeenCalled()
    })

    it('clears the import form once the import has gone through', async () => {
      vi.mocked(api.importConfig).mockResolvedValue(IMPORT_RESULT)
      const wrapper = mountControl()
      await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
      expect(wrapper.find('.config-import-summary').exists()).toBe(true)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('.config-import-summary').exists()).toBe(false)
    })

    it('shows the API’s reason in an alert, keeps the file chosen and shows no report', async () => {
      vi.mocked(api.importConfig).mockRejectedValue(
        new SdrManagerApiError(422, 'unsupported_config_version', 'Too new.'),
      )
      const wrapper = mountControl()
      await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe(
        'This file was written by a newer SDR Manager and cannot be read by this one.',
      )
      expect(wrapper.findComponent(ConfigImportReport).exists()).toBe(false)
      expect(wrapper.find('.config-import-summary').exists()).toBe(true)
      expect(useLocalSdrStore().announcement).toBe('')
    })

    it('uses a plain fallback sentence for a non-API failure', async () => {
      vi.mocked(api.importConfig).mockRejectedValue(new TypeError('network'))
      const wrapper = mountControl()
      await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe('The configuration could not be imported.')
    })

    it('drops the previous report and error when another import starts', async () => {
      vi.mocked(api.importConfig).mockResolvedValueOnce(IMPORT_RESULT)
      const wrapper = mountControl()
      await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.findComponent(ConfigImportReport).exists()).toBe(true)

      let finish: (result: LocalConfigImportResult) => void = () => undefined
      vi.mocked(api.importConfig).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
      await wrapper.get('form').trigger('submit')
      expect(wrapper.findComponent(ConfigImportReport).exists()).toBe(false)
      expect(wrapper.findComponent(ConfigImportForm).props('busy')).toBe(true)
      expect(exportButton(wrapper).attributes('disabled')).toBeDefined()
      finish(IMPORT_RESULT)
      await flushPromises()
      expect(wrapper.findComponent(ConfigImportForm).props('busy')).toBe(false)
    })
  })

  it('shows the pointer instead of the card while this browser is signed out', () => {
    const auth = useLocalAuthStore()
    auth.loaded = true
    auth.passwordSet = true
    auth.authenticated = false
    const wrapper = mount(ConfigTransferControl)
    expect(wrapper.find('.config-transfer').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sign in under DEVICES above')
  })

  it('has no accessibility violations, including with an error and a report showing', async () => {
    vi.mocked(api.importConfig).mockResolvedValue({
      ...IMPORT_RESULT,
      devices: [{ identity_kind: 'serial', identity_key: 'A', outcome: 'failed', detail: 'busy' }],
    })
    vi.mocked(api.getConfig).mockRejectedValue(new TypeError('network'))
    const wrapper = mountControl()
    await expectNoAxeViolations(wrapper)
    await exportButton(wrapper).trigger('click')
    await flushPromises()
    await chooseFile(wrapper, JSON.stringify({ devices: [{}] }))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
