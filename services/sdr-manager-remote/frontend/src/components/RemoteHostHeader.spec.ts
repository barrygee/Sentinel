import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostHeader from './RemoteHostHeader.vue'
import RemoteHostForm from './RemoteHostForm.vue'
import { onHostsChanged } from '../hostsChanged'

vi.mock('../api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sdrManagerRemoteApi')>()
  return { ...actual, deleteHost: vi.fn(), updateHost: vi.fn() }
})

import { deleteHost, updateHost, SdrManagerApiError } from '../api/sdrManagerRemoteApi'

const mockDeleteHost = vi.mocked(deleteHost)
const mockUpdateHost = vi.mocked(updateHost)

const ROOF_PI: SdrManagerHost = {
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

const THIS_MACHINE: SdrManagerHost = { ...ROOF_PI, id: 1, name: null, is_local: true }

interface HeaderProps {
  host?: SdrManagerHost
  expanded?: boolean
  sdrCount?: number | null
  controlsId?: string
}

function mountHeader(props: HeaderProps = {}): VueWrapper {
  return mount(RemoteHostHeader, {
    props: {
      host: ROOF_PI,
      expanded: true,
      sdrCount: 1,
      controlsId: 'sdr-host-5-sdrs',
      ...props,
    },
    attachTo: document.body,
  })
}

type Apply = () => Promise<void>
function lastStagedApply(wrapper: VueWrapper): Apply {
  const emissions = wrapper.emitted('stage')!
  return emissions[emissions.length - 1]![0] as Apply
}

async function editLabel(wrapper: VueWrapper, hostLabel: string, label: string): Promise<void> {
  await wrapper.find(`button[aria-label="Edit ${hostLabel}"]`).trigger('click')
  await wrapper.find('input[aria-label="SDR host label"]').setValue(label)
}

/**
 * `RemoteHostHeader` — one SDR host's accordion title in Settings › SDR: the
 * toggle that opens and folds its SDRs, edit (staged for APPLY CHANGES) and
 * remove (at once), and opening itself when a map marker asks for its host.
 */
describe('RemoteHostHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateHost.mockResolvedValue(ROOF_PI)
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('the title', () => {
    it("shows the host's name as typed, its address and SDR count", () => {
      const wrapper = mountHeader()
      expect(wrapper.find('.remote-host-header-name').text()).toBe('Roof Pi')
      const meta = wrapper.findAll('.remote-host-header-address').map((span) => span.text())
      expect(meta).toEqual(['192.168.1.50:8000', '1 SDR'])
    })

    it('names an unlabelled host by its address', () => {
      const wrapper = mountHeader({ host: { ...ROOF_PI, name: null } })
      expect(wrapper.find('.remote-host-header-name').text()).toBe('192.168.1.50')
    })

    it('calls an unlabelled this-machine row "This machine", with no address', () => {
      const wrapper = mountHeader({ host: THIS_MACHINE })
      expect(wrapper.find('.remote-host-header-name').text()).toBe('This machine')
      expect(wrapper.text()).not.toContain('192.168.1.50')
    })

    it("uses the operator's label for this machine when one is set", () => {
      const wrapper = mountHeader({ host: { ...THIS_MACHINE, name: 'Shack' } })
      expect(wrapper.find('.remote-host-header-name').text()).toBe('Shack')
    })

    it('says this machine is not running when its row is disabled', () => {
      const wrapper = mountHeader({ host: { ...THIS_MACHINE, enabled: false } })
      expect(wrapper.text()).toContain('not running')
    })

    it.each([
      [0, '0 SDRs'],
      [1, '1 SDR'],
      [3, '3 SDRs'],
    ])('counts %i SDR(s) as "%s"', (sdrCount, expected) => {
      const wrapper = mountHeader({ sdrCount })
      expect(wrapper.findAll('.remote-host-header-address').at(-1)!.text()).toBe(expected)
    })

    it('shows no count until the host has answered', () => {
      const wrapper = mountHeader({ sdrCount: null })
      expect(wrapper.text()).not.toMatch(/SDRs?\b/)
    })

    it('shows the last error below the title, and none for a healthy host', () => {
      expect(mountHeader().find('.remote-host-header-error').exists()).toBe(false)
      const failing = mountHeader({
        host: { ...ROOF_PI, reachable: false, last_error: 'Connection refused' },
      })
      expect(failing.find('.remote-host-header-error').text()).toBe('Connection refused')
    })
  })

  describe('the accordion toggle', () => {
    it("controls the host's SDR list and says whether it is open", async () => {
      const wrapper = mountHeader({ expanded: true })
      const toggle = wrapper.find('.remote-host-header-toggle')
      expect(toggle.attributes('aria-controls')).toBe('sdr-host-5-sdrs')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(wrapper.find('.remote-host-header-chevron--open').exists()).toBe(true)
      await wrapper.setProps({ expanded: false })
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('.remote-host-header-chevron--open').exists()).toBe(false)
    })

    it('asks to open or fold the SDRs when clicked, leaving the edit form alone', async () => {
      const wrapper = mountHeader()
      await wrapper.find('.remote-host-header-toggle').trigger('click')
      expect(wrapper.emitted('toggle')).toHaveLength(1)
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    })
  })

  describe('edit and remove', () => {
    it('opens and closes the edit form, saying so on the edit button', async () => {
      const wrapper = mountHeader()
      const edit = wrapper.find('button[aria-label="Edit Roof Pi"]')
      expect(edit.attributes('aria-expanded')).toBe('false')
      await edit.trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).props('host')).toEqual(ROOF_PI)
      expect(edit.attributes('aria-expanded')).toBe('true')
      await edit.trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    })

    it('offers no remove for this machine, which is linked rather than added', () => {
      const wrapper = mountHeader({ host: THIS_MACHINE })
      expect(wrapper.find('.sdr-device-btn--danger').exists()).toBe(false)
      expect(wrapper.find('button[aria-label="Edit This machine"]').exists()).toBe(true)
      // Its place is kept, so the pencil lines up with other hosts' pencils.
      expect(wrapper.find('.remote-host-header-button-slot').exists()).toBe(true)
      expect(mountHeader().find('.remote-host-header-button-slot').exists()).toBe(false)
    })

    it('asks before removing, closing the form and dimming the title meanwhile', async () => {
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      await wrapper.find('button[aria-label="Remove Roof Pi"]').trigger('click')
      expect(wrapper.find('.sdr-device-confirm').text()).toContain('REMOVE?')
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-header-toggle--dim').exists()).toBe(true)
      expect(wrapper.find('button[aria-label="Edit Roof Pi"]').exists()).toBe(false)
    })

    it('removes the host on YES and announces the change', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      mockDeleteHost.mockResolvedValue(undefined)
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Remove Roof Pi"]').trigger('click')
      await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
      await flushPromises()
      expect(mockDeleteHost).toHaveBeenCalledWith(5)
      expect(changed).toHaveBeenCalledOnce()
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      stopListening()
    })

    it('keeps the confirm row up, announcing nothing, when removing fails', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      mockDeleteHost.mockRejectedValue(new Error('offline'))
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Remove Roof Pi"]').trigger('click')
      await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
      await flushPromises()
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
      expect(changed).not.toHaveBeenCalled()
      stopListening()
    })

    it('cancels the removal on NO', async () => {
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Remove Roof Pi"]').trigger('click')
      await wrapper.findAll('.sdr-device-confirm-btn').at(-1)!.trigger('click')
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      expect(mockDeleteHost).not.toHaveBeenCalled()
    })
  })

  describe('staging an edit for APPLY CHANGES', () => {
    it('stages the edit instead of saving it, and marks the host EDITED', async () => {
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      expect(wrapper.emitted('stage')).toHaveLength(1)
      expect(mockUpdateHost).not.toHaveBeenCalled()
      expect(wrapper.find('.remote-host-header-staged').text()).toBe('EDITED — APPLY TO SAVE')
    })

    it('drops the mark when the edit is put back to what is saved', async () => {
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await wrapper.find('input[aria-label="SDR host label"]').setValue('Roof Pi')
      expect(wrapper.find('.remote-host-header-staged').exists()).toBe(false)
    })

    it('drops the staged edit and closes the form on cancel', async () => {
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      wrapper.findComponent(RemoteHostForm).vm.$emit('cancel')
      await nextTick()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-header-staged').exists()).toBe(false)
      await lastStagedApply(wrapper)()
      expect(mockUpdateHost).not.toHaveBeenCalled()
    })

    it('saves on apply, then closes the form and announces the change', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await lastStagedApply(wrapper)()
      await nextTick()
      expect(mockUpdateHost).toHaveBeenCalledWith(5, {
        name: 'Shed',
        address: '192.168.1.50',
        port: 8000,
      })
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-header-staged').exists()).toBe(false)
      expect(changed).toHaveBeenCalledOnce()
      stopListening()
    })

    it('on a refusal reopens the form with the reason, keeps the edit staged, rethrows and still announces', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      mockUpdateHost.mockRejectedValue(
        new SdrManagerApiError(409, 'port_conflict', 'Port 8000 is already in use.'),
      )
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      await expect(lastStagedApply(wrapper)()).rejects.toThrow()
      await nextTick()
      const form = wrapper.findComponent(RemoteHostForm)
      expect(form.props('applyError')).toBe('Port 8000 is already in use.')
      expect(form.props('stagedDraft')).toMatchObject({ name: 'Shed' })
      expect(wrapper.find('.remote-host-header-staged').exists()).toBe(true)
      expect(changed).toHaveBeenCalledOnce()
      stopListening()
    })

    it('clears the refusal when the form is cancelled', async () => {
      mockUpdateHost.mockRejectedValue(new SdrManagerApiError(409, 'x', 'Refused.'))
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(lastStagedApply(wrapper)()).rejects.toThrow()
      await nextTick()
      wrapper.findComponent(RemoteHostForm).vm.$emit('cancel')
      await nextTick()
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).props('applyError')).toBeNull()
    })
  })

  describe('reopening the settings panel', () => {
    it('closes an open form and forgets an old refusal', async () => {
      mockUpdateHost.mockRejectedValue(new SdrManagerApiError(409, 'x', 'Refused.'))
      const settingsStore = useSettingsStore()
      const wrapper = mountHeader()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(lastStagedApply(wrapper)()).rejects.toThrow()
      settingsStore.openPanel('sdr')
      await nextTick()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).props('applyError')).toBeNull()
    })

    it('still opens the form when a map marker is what opened the panel', async () => {
      Element.prototype.scrollIntoView = vi.fn()
      const settingsStore = useSettingsStore()
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      settingsStore.openSdrManagerHost(5)
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    })

    it('does nothing when the panel closes', async () => {
      const settingsStore = useSettingsStore()
      settingsStore.openPanel('sdr')
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      settingsStore.closePanel()
      await nextTick()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    })
  })

  describe('opening a host from a map marker', () => {
    beforeEach(() => {
      // jsdom has no layout, so scrollIntoView is not implemented on elements.
      Element.prototype.scrollIntoView = vi.fn()
    })

    it('opens its form, clears the request and scrolls into view when mounted after the request', async () => {
      const settingsStore = useSettingsStore()
      settingsStore.openSdrManagerHost(5)
      const wrapper = mountHeader()
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
      expect(settingsStore.focusSdrManagerHostId).toBeNull()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    })

    it('acts on a request that arrives once mounted, cancelling a pending removal', async () => {
      const settingsStore = useSettingsStore()
      const wrapper = mountHeader()
      await wrapper.find('button[aria-label="Remove Roof Pi"]').trigger('click')
      settingsStore.openSdrManagerHost(5)
      await flushPromises()
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    })

    it("leaves another host's request for that host", async () => {
      const settingsStore = useSettingsStore()
      settingsStore.openSdrManagerHost(9)
      const wrapper = mountHeader()
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(settingsStore.focusSdrManagerHostId).toBe(9)
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })

  it('has no accessibility violations, folded or open with an error and its form', async () => {
    const wrapper = mountHeader({
      expanded: false,
      host: { ...ROOF_PI, reachable: false, last_error: 'Connection refused' },
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
