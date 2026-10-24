import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostsControl from './RemoteHostsControl.vue'
import RemoteHostForm from './RemoteHostForm.vue'
import { onHostsChanged } from '../hostsChanged'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

// The not-enabled notice links to the docs through vue-router, which these
// mounts don't install; it is covered by its own spec.
vi.mock('./LocalNotEnabledNotice.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ name: 'LocalNotEnabledNotice', render: () => h('aside') }) }
})

vi.mock('../api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sdrManagerRemoteApi')>()
  return {
    ...actual,
    listHosts: vi.fn(),
    deleteHost: vi.fn(),
    updateHost: vi.fn(),
  }
})

import { listHosts, deleteHost, updateHost, SdrManagerApiError } from '../api/sdrManagerRemoteApi'

const mockListHosts = vi.mocked(listHosts)
const mockDeleteHost = vi.mocked(deleteHost)
const mockUpdateHost = vi.mocked(updateHost)

const REACHABLE_HOST: SdrManagerHost = {
  id: 5,
  name: 'Roof Pi',
  address: '192.168.1.50',
  port: 8000,
  enabled: true,
  auth_token_set: false,
  is_local: false,
  created_at: 0,
  last_seen_at: 100,
  last_error: null,
  reachable: true,
  api_version: '1.0.0',
}

const UNREACHABLE_HOST: SdrManagerHost = {
  ...REACHABLE_HOST,
  id: 9,
  name: null,
  reachable: false,
  last_error: 'Connection refused',
}

describe('RemoteHostsControl', () => {
  beforeEach(() => {
    // The form's MORE disclosure reads appStore.isOnline to decide
    // whether the site map can load, so these mounts need an active Pinia.
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an empty message when no SDR hosts are registered', async () => {
    mockListHosts.mockResolvedValue([])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    expect(wrapper.find('.sdr-devices-empty').text()).toContain('No SDR hosts registered')
  })

  it('lists a registered host, falling back to its address when unlabelled', async () => {
    mockListHosts.mockResolvedValue([UNREACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    expect(wrapper.find('.sdr-device-info').text()).toContain('192.168.1.50')
  })

  it("renders an unreachable host's last_error rather than showing nothing", async () => {
    mockListHosts.mockResolvedValue([UNREACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    expect(wrapper.find('.remote-host-error').text()).toBe('— Connection refused')
    expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
  })

  it('shows no last_error line for a reachable host', async () => {
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    expect(wrapper.find('.remote-host-error').exists()).toBe(false)
    expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(true)
  })

  it('opens and closes the edit form for a host', async () => {
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
  })

  it('opens and toggles closed a blank form via ADD SDR HOST', async () => {
    mockListHosts.mockResolvedValue([])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
  })

  it('closes the blank ADD SDR HOST form when it emits cancel', async () => {
    mockListHosts.mockResolvedValue([])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    mockListHosts.mockClear()
    wrapper.findComponent(RemoteHostForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    expect(mockListHosts).not.toHaveBeenCalled()
  })

  it('reloads, announces and closes the form when the new-host form emits save', async () => {
    const changed = vi.fn()
    const stopListening = onHostsChanged(changed)
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    mockListHosts.mockClear()
    wrapper.findComponent(RemoteHostForm).vm.$emit('save')
    await flushPromises()
    expect(mockListHosts).toHaveBeenCalled()
    expect(changed).toHaveBeenCalled()
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    stopListening()
  })

  it('closes the form without reloading when it emits cancel', async () => {
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    mockListHosts.mockClear()
    wrapper.findComponent(RemoteHostForm).vm.$emit('cancel')
    await flushPromises()
    expect(mockListHosts).not.toHaveBeenCalled()
    expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
  })

  it('confirms then deletes a host and broadcasts the change', async () => {
    const changed = vi.fn()
    const stopListening = onHostsChanged(changed)
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    mockDeleteHost.mockResolvedValue(undefined)
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    expect(mockDeleteHost).toHaveBeenCalledWith(5)
    expect(changed).toHaveBeenCalled()
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
    stopListening()
  })

  it('cancels a pending delete with NO', async () => {
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    const noButton = wrapper.findAll('.sdr-device-confirm-btn').at(-1)!
    await noButton.trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
    expect(mockDeleteHost).not.toHaveBeenCalled()
  })

  it('leaves the confirm row up so the operator can retry when delete fails', async () => {
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    mockDeleteHost.mockRejectedValue(new Error('offline'))
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
  })

  it('keeps the previous host list when a background poll reload fails', async () => {
    vi.useFakeTimers()
    mockListHosts.mockResolvedValueOnce([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await vi.runOnlyPendingTimersAsync()
    expect(wrapper.find('.sdr-device-info').text()).toContain('192.168.1.50')
    mockListHosts.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(5000)
    // The failed poll is swallowed and the previously loaded host stays shown.
    expect(wrapper.find('.sdr-device-info').text()).toContain('192.168.1.50')
  })

  it('re-lists hosts on the 5s reachability poll', async () => {
    vi.useFakeTimers()
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    mount(RemoteHostsControl)
    await vi.runOnlyPendingTimersAsync()
    mockListHosts.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockListHosts).toHaveBeenCalledTimes(1)
  })

  it('skips an overlapping poll tick while a previous refresh is still in flight', async () => {
    vi.useFakeTimers()
    let resolveFirst: (() => void) | null = null
    mockListHosts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve([REACHABLE_HOST])
        }),
    )
    mount(RemoteHostsControl)
    await vi.runOnlyPendingTimersAsync()
    expect(mockListHosts).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    // The first sweep never resolved, so the guard must have skipped this tick.
    expect(mockListHosts).toHaveBeenCalledTimes(1)
    resolveFirst!()
    await flushPromises()
  })

  it('clears the poll interval on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
  })

  describe('opening a host from a map marker', () => {
    it('expands the requested host once the list holding it has loaded', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      settingsStore.openSdrManagerHost(REACHABLE_HOST.id)
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).props('host')).toMatchObject({
        id: REACHABLE_HOST.id,
      })
    })

    it('acts on a request that arrives after it is already mounted', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      settingsStore.openSdrManagerHost(REACHABLE_HOST.id)
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    })

    it('clears the request once acted on, so the row can be closed again', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      settingsStore.openSdrManagerHost(REACHABLE_HOST.id)
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(settingsStore.focusSdrManagerHostId).toBeNull()
      // With the request cleared, the edit toggle closes the row rather than
      // the watch immediately re-opening it.
      await wrapper.find('button[title="Edit"]').trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    })

    it('scrolls the requested host into view', async () => {
      const scrollSpy = vi.fn()
      // jsdom has no layout, so scrollIntoView is not implemented on elements.
      Element.prototype.scrollIntoView = scrollSpy
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      useSettingsStore().openSdrManagerHost(REACHABLE_HOST.id)
      mount(RemoteHostsControl)
      await flushPromises()
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' })
    })

    it('waits rather than acting on a host the list does not hold', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      settingsStore.openSdrManagerHost(4242) // deleted host, or a stale marker
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      // The request is kept, not discarded: the host may still arrive on a
      // later poll (this one just has not loaded it yet).
      expect(settingsStore.focusSdrManagerHostId).toBe(4242)
    })

    it('cancels a pending delete confirmation when a host is opened from a marker', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      await wrapper.find('button[title="Delete"]').trigger('click')
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
      settingsStore.openSdrManagerHost(REACHABLE_HOST.id)
      await flushPromises()
      expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
    })
  })

  describe('the not-enabled notice for this machine', () => {
    const LOCAL_ROW: SdrManagerHost = { ...REACHABLE_HOST, id: 1, is_local: true, name: null }

    function noticeShown(wrapper: ReturnType<typeof mount>): boolean {
      return wrapper.findComponent({ name: 'LocalNotEnabledNotice' }).exists()
    }

    it('waits for the first list before saying anything', async () => {
      mockListHosts.mockReturnValue(new Promise(() => {}))
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(false)
    })

    it('stays hidden when the first list fails, since nothing is known', async () => {
      mockListHosts.mockRejectedValue(new Error('offline'))
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(false)
    })

    it('shows when the list holds no this-machine row', async () => {
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(true)
    })

    it('shows when the list is empty', async () => {
      mockListHosts.mockResolvedValue([])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(true)
    })

    it('shows when this-machine row is linked but disabled', async () => {
      mockListHosts.mockResolvedValue([{ ...LOCAL_ROW, enabled: false }])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(true)
    })

    it('is hidden when this-machine row is enabled', async () => {
      mockListHosts.mockResolvedValue([LOCAL_ROW])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(false)
    })

    it('is not satisfied by an enabled remote row that is not this machine', async () => {
      mockListHosts.mockResolvedValue([{ ...REACHABLE_HOST, enabled: true, is_local: false }])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(noticeShown(wrapper)).toBe(true)
    })
  })

  describe('staging edits for APPLY CHANGES', () => {
    const OTHER_HOST: SdrManagerHost = { ...REACHABLE_HOST, id: 6, name: 'Attic Pi' }

    async function mountWithHosts(hosts: SdrManagerHost[]) {
      mockListHosts.mockResolvedValue(hosts)
      mockUpdateHost.mockResolvedValue(REACHABLE_HOST)
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      return wrapper
    }

    async function editLabel(
      wrapper: ReturnType<typeof mount>,
      hostName: string,
      label: string,
    ): Promise<void> {
      await wrapper.find(`button[aria-label="Edit ${hostName}"]`).trigger('click')
      await wrapper.find('input[aria-label="SDR host label"]').setValue(label)
    }

    type Apply = () => Promise<void>
    function stagedApply(wrapper: ReturnType<typeof mount>): Apply {
      const emissions = wrapper.emitted('stage')!
      return emissions[emissions.length - 1]![0] as Apply
    }

    it('emits nothing and shows no badge until a host is edited', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(wrapper.emitted('stage')).toBeUndefined()
      expect(wrapper.find('.remote-host-staged').exists()).toBe(false)
    })

    it('stages the edit instead of saving it, and marks the row EDITED', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      expect(wrapper.emitted('stage')).toHaveLength(1)
      expect(mockUpdateHost).not.toHaveBeenCalled()
      expect(wrapper.find('.remote-host-staged').text()).toBe('EDITED — APPLY TO SAVE')
    })

    it('marks only the edited host', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST, OTHER_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      expect(wrapper.findAll('.remote-host-staged')).toHaveLength(1)
      expect(wrapper.findAll('.sdr-device-info')[0]!.find('.remote-host-staged').exists()).toBe(
        true,
      )
    })

    it('drops the badge when the edit is reverted to what is saved', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await wrapper.find('input[aria-label="SDR host label"]').setValue('Roof Pi')
      expect(wrapper.find('.remote-host-staged').exists()).toBe(false)
    })

    it('reopens the form on the staged edit after it was closed', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(
        (wrapper.find('input[aria-label="SDR host label"]').element as HTMLInputElement).value,
      ).toBe('Shed')
    })

    it('saves the staged edit on apply, then closes the form, reloads and announces', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      mockListHosts.mockClear()
      await stagedApply(wrapper)()
      await flushPromises()
      expect(mockUpdateHost).toHaveBeenCalledTimes(1)
      expect(mockUpdateHost).toHaveBeenCalledWith(5, {
        name: 'Shed',
        address: '192.168.1.50',
        port: 8000,
      })
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-staged').exists()).toBe(false)
      expect(mockListHosts).toHaveBeenCalledTimes(1)
      expect(changed).toHaveBeenCalledTimes(1)
      stopListening()
    })

    it('saves every edited host on one apply', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST, OTHER_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await editLabel(wrapper, 'Attic Pi', 'Loft')
      await stagedApply(wrapper)()
      expect(mockUpdateHost.mock.calls.map(([hostId]) => hostId)).toEqual([5, 6])
    })

    it("sends only the label for this machine's row", async () => {
      const localRow: SdrManagerHost = { ...REACHABLE_HOST, id: 1, is_local: true, name: null }
      const wrapper = await mountWithHosts([localRow])
      await editLabel(wrapper, 'This machine', 'Shack')
      await stagedApply(wrapper)()
      expect(mockUpdateHost).toHaveBeenCalledWith(1, { name: 'Shack' })
    })

    it('on a refusal shows the reason on that host, reopens it, rethrows, and still reloads and announces', async () => {
      const changed = vi.fn()
      const stopListening = onHostsChanged(changed)
      const wrapper = await mountWithHosts([REACHABLE_HOST, OTHER_HOST])
      mockUpdateHost.mockRejectedValue(
        new SdrManagerApiError(409, 'port_conflict', 'Port 8000 is already in use.'),
      )
      await editLabel(wrapper, 'Attic Pi', 'Loft')
      await wrapper.find('button[aria-label="Edit Attic Pi"]').trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      mockListHosts.mockClear()
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      const form = wrapper.findComponent(RemoteHostForm)
      expect(form.props('host')).toMatchObject({ id: 6 })
      expect(form.props('applyError')).toBe('Port 8000 is already in use.')
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Port 8000 is already in use.')
      // The refused edit stays staged so the operator can fix it and apply again.
      expect(wrapper.find('.remote-host-staged').exists()).toBe(true)
      expect(mockListHosts).toHaveBeenCalledTimes(1)
      expect(changed).toHaveBeenCalledTimes(1)
      stopListening()
    })

    it('reopens the first refused host when several are refused', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST, OTHER_HOST])
      mockUpdateHost.mockRejectedValue(new SdrManagerApiError(409, 'x', 'Refused.'))
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await editLabel(wrapper, 'Attic Pi', 'Loft')
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).props('host')).toMatchObject({ id: 5 })
    })

    it('uses the generic message for a failure that is not a host rejection', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      mockUpdateHost.mockRejectedValue(new TypeError('boom'))
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Save failed.')
    })

    it('clears the refusal once a later apply succeeds', async () => {
      mockUpdateHost.mockRejectedValueOnce(new SdrManagerApiError(409, 'x', 'Refused.'))
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(true)
      mockUpdateHost.mockResolvedValue(REACHABLE_HOST)
      await stagedApply(wrapper)()
      await flushPromises()
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    })

    it('skips an edit whose host was deleted in the meantime', async () => {
      vi.useFakeTimers()
      mockListHosts.mockResolvedValue([REACHABLE_HOST, OTHER_HOST])
      const wrapper = mount(RemoteHostsControl)
      await vi.advanceTimersByTimeAsync(0)
      await editLabel(wrapper, 'Attic Pi', 'Loft')
      // The reachability poll drops the deleted host from the list.
      mockListHosts.mockResolvedValue([REACHABLE_HOST])
      await vi.advanceTimersByTimeAsync(5000)
      expect(wrapper.find('button[aria-label="Edit Attic Pi"]').exists()).toBe(false)
      await expect(stagedApply(wrapper)()).resolves.toBeUndefined()
      expect(mockUpdateHost).not.toHaveBeenCalled()
    })

    it('discards the draft and its refusal when the form is cancelled', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      mockUpdateHost.mockRejectedValue(new SdrManagerApiError(409, 'x', 'Refused.'))
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      const cancel = wrapper
        .findAll('.sdr-devices-btn')
        .find((button) => button.text() === 'CANCEL')!
      await cancel.trigger('click')
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-staged').exists()).toBe(false)
      // Reopened, the form shows the saved values with no old refusal.
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(
        (wrapper.find('input[aria-label="SDR host label"]').element as HTMLInputElement).value,
      ).toBe('Roof Pi')
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
      // Applying now has nothing left to save.
      mockUpdateHost.mockClear()
      await stagedApply(wrapper)()
      expect(mockUpdateHost).not.toHaveBeenCalled()
    })

    it('drops drafts, closes the form and forgets refusals when the panel opens again', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      mockUpdateHost.mockRejectedValue(new SdrManagerApiError(409, 'x', 'Refused.'))
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await expect(stagedApply(wrapper)()).rejects.toThrow()
      await flushPromises()
      const settingsStore = useSettingsStore()
      settingsStore.open = true
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
      expect(wrapper.find('.remote-host-staged').exists()).toBe(false)
      await wrapper.find('button[aria-label="Edit Roof Pi"]').trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
    })

    it('opens no form when the panel reopened mid-apply and cleared the refusal', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST, OTHER_HOST])
      let finishSecondSave: (host: SdrManagerHost) => void = () => {}
      mockUpdateHost
        .mockRejectedValueOnce(new SdrManagerApiError(409, 'x', 'Refused.'))
        .mockImplementationOnce(
          () => new Promise<SdrManagerHost>((resolve) => (finishSecondSave = resolve)),
        )
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      await editLabel(wrapper, 'Attic Pi', 'Loft')
      const applying = stagedApply(wrapper)()
      await flushPromises()
      // Roof Pi was refused; Attic Pi is still saving when the panel reopens.
      useSettingsStore().open = true
      await flushPromises()
      finishSecondSave(OTHER_HOST)
      await expect(applying).rejects.toThrow()
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(false)
    })

    it('leaves the form alone when the panel closes', async () => {
      const wrapper = await mountWithHosts([REACHABLE_HOST])
      const settingsStore = useSettingsStore()
      settingsStore.open = true
      await flushPromises()
      await editLabel(wrapper, 'Roof Pi', 'Shed')
      settingsStore.open = false
      await flushPromises()
      expect(wrapper.findComponent(RemoteHostForm).exists()).toBe(true)
      expect(wrapper.find('.remote-host-staged').exists()).toBe(true)
    })
  })

  it('has no accessibility violations', async () => {
    mockListHosts.mockResolvedValue([UNREACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  describe("this machine's row (is_local)", () => {
    const LOCAL_HOST: SdrManagerHost = {
      ...REACHABLE_HOST,
      id: 1,
      name: null,
      address: 'host.docker.internal',
      is_local: true,
    }

    it('lists this machine first as "This machine", without its address', async () => {
      // The API lists rows in insertion order; this machine is often linked later.
      mockListHosts.mockResolvedValue([REACHABLE_HOST, LOCAL_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      const rows = wrapper.findAll('.sdr-device-info').map((row) => row.text())
      expect(rows[0]).toContain('This machine')
      expect(rows[0]).not.toContain('host.docker.internal')
      expect(rows[1]).toContain('Roof Pi')
      expect(rows[1]).toContain('192.168.1.50:8000')
    })

    it("uses the operator's label for this machine when one is set", async () => {
      mockListHosts.mockResolvedValue([{ ...LOCAL_HOST, name: 'Shack' }])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.find('.sdr-device-info').text()).toContain('Shack')
      expect(wrapper.find('.sdr-device-info').text()).not.toContain('This machine')
      expect(wrapper.find('button[aria-label="Edit Shack"]').exists()).toBe(true)
    })

    it('offers edit but no delete on this machine, while other hosts keep both', async () => {
      mockListHosts.mockResolvedValue([LOCAL_HOST, REACHABLE_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.find('button[aria-label="Edit This machine"]').exists()).toBe(true)
      expect(wrapper.find('button[aria-label="Delete This machine"]').exists()).toBe(false)
      expect(wrapper.find('button[aria-label="Delete Roof Pi"]').exists()).toBe(true)
      expect(wrapper.findAll('.sdr-device-btn--danger')).toHaveLength(1)
    })

    it('says this machine is not running once its link is disabled', async () => {
      mockListHosts.mockResolvedValue([{ ...LOCAL_HOST, enabled: false }])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.find('.remote-host-local-off').text()).toBe('— not running')
    })

    it('says nothing about running while this machine is linked', async () => {
      mockListHosts.mockResolvedValue([LOCAL_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.find('.remote-host-local-off').exists()).toBe(false)
    })

    it('names an unlabelled remote host by its address', async () => {
      mockListHosts.mockResolvedValue([UNREACHABLE_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(wrapper.find('button[aria-label="Edit 192.168.1.50"]').exists()).toBe(true)
    })

    it('has no accessibility violations with this machine listed', async () => {
      mockListHosts.mockResolvedValue([LOCAL_HOST, REACHABLE_HOST])
      const wrapper = mount(RemoteHostsControl)
      await flushPromises()
      expect(
        await axe(wrapper.html(), {
          rules: { region: { enabled: false } },
        }),
      ).toHaveNoViolations()
    })
  })
})
