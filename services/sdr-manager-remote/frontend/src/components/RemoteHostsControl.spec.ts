import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostsControl from './RemoteHostsControl.vue'
import RemoteHostForm from './RemoteHostForm.vue'
import { onHostsChanged } from '../hostsChanged'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'

vi.mock('../api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sdrManagerRemoteApi')>()
  return {
    ...actual,
    listHosts: vi.fn(),
    deleteHost: vi.fn(),
  }
})

import { listHosts, deleteHost } from '../api/sdrManagerRemoteApi'

const mockListHosts = vi.mocked(listHosts)
const mockDeleteHost = vi.mocked(deleteHost)

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

  it('reloads and announces the hosts changed when the form emits save', async () => {
    const changed = vi.fn()
    const stopListening = onHostsChanged(changed)
    mockListHosts.mockResolvedValue([REACHABLE_HOST])
    const wrapper = mount(RemoteHostsControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
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
