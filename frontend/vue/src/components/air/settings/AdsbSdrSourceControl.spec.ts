import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AdsbSdrSourceControl from './AdsbSdrSourceControl.vue'
import { useSettingsStore } from '@/stores/settings'
import * as adsbSourceApi from '@/services/adsbSourceApi'
import * as sentryApi from '@/services/sentryApi'

/**
 * Tests for choosing which Sentry SDR receives ADS-B.
 *
 * Two things here have real consequences. The option **value** carries both the
 * host id and the device id, and the device id contains a colon of its own
 * (`serial:ABC`) — splitting it wrongly would silently save a different device,
 * or none. And an empty list has three quite different causes (no hosts, hosts
 * that publish nothing, hosts that are unreachable), which an operator has to
 * be able to tell apart before they can fix it.
 */

function host(overrides: Partial<sentryApi.SentryHost> = {}): sentryApi.SentryHost {
  return {
    id: 1,
    name: 'Attic Pi',
    address: '192.168.5.67',
    port: 8000,
    enabled: true,
    auth_token_set: true,
    created_at: 0,
    last_seen_at: null,
    last_error: null,
    reachable: true,
    api_version: '1',
    ...overrides,
  }
}

function snapshotWith(
  ...devices: { device_id: string; name: string; enabled?: boolean; visibility?: string }[]
) {
  // Offered by default — the filtering rules get their own tests below.
  const withDefaults = devices.map((d) => ({
    enabled: true,
    visibility: 'public',
    ...d,
  }))
  return {
    reachable: true,
    last_error: null,
    last_polled_at: 0,
    last_success_at: 0,
    api_version: '1',
    status: { generated_at: 0, sdrs: withDefaults as never[] },
  } as sentryApi.SentryDeviceSnapshot
}

let setSourceSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(adsbSourceApi, 'getAdsbSource').mockResolvedValue({
    configured: false,
    sentry_host_id: null,
    sentry_device_id: null,
  })
  setSourceSpy = vi.spyOn(adsbSourceApi, 'setAdsbSource').mockResolvedValue({
    configured: true,
    sentry_host_id: 1,
    sentry_device_id: 'serial:97710286',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdsbSdrSourceControl', () => {
  it('lists every device from every enabled host', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith(
        { device_id: 'serial:97710286', name: 'ADSB' },
        { device_id: 'usb:1-1.2', name: 'RTL-SDR-V4' },
      ),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    const options = wrapper.findAll('[role="option"]').map((option) => option.text())
    expect(options).toContain('Attic Pi — ADSB')
    expect(options).toContain('Attic Pi — RTL-SDR-V4')
  })

  it('names the host alongside the device', async () => {
    // Two Pis can each have a dongle called "ADSB"; picking the wrong one would
    // tune a receiver in another room.
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([
      host({ id: 1, name: 'Attic Pi' }),
      host({ id: 2, name: 'Shed Pi' }),
    ])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    const options = wrapper.findAll('[role="option"]').map((option) => option.text())
    expect(options).toContain('Attic Pi — ADSB')
    expect(options).toContain('Shed Pi — ADSB')
  })

  it('skips hosts that are switched off', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ enabled: false })])
    const devicesSpy = vi.spyOn(sentryApi, 'getSentryHostDevices')

    mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(devicesSpy).not.toHaveBeenCalled()
  })

  it('survives an unreachable host rather than losing the whole list', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([
      host({ id: 1, name: 'Dead Pi' }),
      host({ id: 2, name: 'Live Pi' }),
    ])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockImplementation(async (hostId: number) => {
      if (hostId === 1) throw new Error('unreachable')
      return snapshotWith({ device_id: 'serial:BBB', name: 'ADSB' })
    })

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.findAll('[role="option"]').map((o) => o.text())).toContain('Live Pi — ADSB')
  })

  it('degrades to an empty list when Sentinel itself cannot be reached', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockRejectedValue(new Error('offline'))

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.text()).toContain('Add a Sentry host')
  })

  it('falls back to ids when a host and device have no names', async () => {
    // Neither name is guaranteed: a Sentry device need not be named, and a host
    // row's name is optional. Without the fallbacks the list would offer
    // "undefined — undefined".
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ name: null })])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:AAA', name: '' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.findAll('[role="option"]').map((o) => o.text())).toContain(
      '192.168.5.67 — serial:AAA',
    )
  })

  it('tolerates a host that reports no status payload', async () => {
    // The poller reports `status: null` for a host it has not reached yet.
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue({
      reachable: false,
      last_error: null,
      last_polled_at: 0,
      last_success_at: null,
      api_version: null,
      status: null,
    } as sentryApi.SentryDeviceSnapshot)

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.text()).toContain('publish no SDRs')
  })

  describe('what is offered as a source', () => {
    it('omits a private device', async () => {
      // Private is the operator saying, on the Sentry side, that this dongle is
      // not for sharing. Offering it here would let AIR claim and tune hardware
      // they have withdrawn.
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith(
          { device_id: 'serial:PUB', name: 'Public', visibility: 'public' },
          { device_id: 'serial:PRIV', name: 'Private', visibility: 'private' },
        ),
      )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      const options = wrapper.findAll('[role="option"]').map((o) => o.text())
      expect(options.some((o) => o.includes('Public'))).toBe(true)
      expect(options.some((o) => o.includes('Private'))).toBe(false)
    })

    it('omits a disabled device', async () => {
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith(
          { device_id: 'serial:ON', name: 'Running', enabled: true },
          { device_id: 'serial:OFF', name: 'Stopped', enabled: false },
        ),
      )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      const options = wrapper.findAll('[role="option"]').map((o) => o.text())
      expect(options.some((o) => o.includes('Running'))).toBe(true)
      expect(options.some((o) => o.includes('Stopped'))).toBe(false)
    })

    it('keeps the selected device listed when it is withdrawn, and says so', async () => {
      // Dropping it would silently empty the control and leave no clue which
      // dongle AIR was pointed at.
      vi.spyOn(adsbSourceApi, 'getAdsbSource').mockResolvedValue({
        configured: true,
        sentry_host_id: 1,
        sentry_device_id: 'serial:GONE',
      })
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:GONE', name: 'Withdrawn', visibility: 'private' }),
      )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.findAll('[role="option"]').map((o) => o.text())).toContainEqual(
        expect.stringContaining('no longer published'),
      )
      expect(wrapper.text()).toContain('no longer public/enabled')
    })

    it('stops refreshing once unmounted', async () => {
      // A timer left running would keep polling for a control that is gone,
      // for the life of the page.
      vi.useFakeTimers()
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      const devicesSpy = vi
        .spyOn(sentryApi, 'getSentryHostDevices')
        .mockResolvedValue(snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }))

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      wrapper.unmount()
      devicesSpy.mockClear()

      await vi.advanceTimersByTimeAsync(20000)

      expect(devicesSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('starts no refresh timer when unmounted mid-load', async () => {
      // The initial load awaits two requests before scheduling the refresh; an
      // unmount inside that window runs the cleanup first, so without a guard
      // the timer it then creates would poll for the life of the page.
      vi.useFakeTimers()
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      const devicesSpy = vi
        .spyOn(sentryApi, 'getSentryHostDevices')
        .mockResolvedValue(snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }))

      const wrapper = mount(AdsbSdrSourceControl)
      wrapper.unmount()
      await flushPromises()
      devicesSpy.mockClear()

      await vi.advanceTimersByTimeAsync(20000)

      expect(devicesSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('reflects a device being withdrawn without a reload', async () => {
      // Visibility can change from Sentry's own console at any moment, and a
      // stale list offers a dongle that has since been taken away.
      vi.useFakeTimers()
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      const devicesSpy = vi
        .spyOn(sentryApi, 'getSentryHostDevices')
        .mockResolvedValue(
          snapshotWith({ device_id: 'serial:AAA', name: 'ADSB', visibility: 'public' }),
        )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      expect(wrapper.findAll('[role="option"]').map((o) => o.text())).toContain('Attic Pi — ADSB')

      devicesSpy.mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB', visibility: 'private' }),
      )
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()

      expect(wrapper.findAll('[role="option"]').map((o) => o.text())).not.toContain(
        'Attic Pi — ADSB',
      )
      vi.useRealTimers()
    })
  })

  /** Run the change the control last staged — what APPLY CHANGES does. */
  async function applyStaged(wrapper: ReturnType<typeof mount>): Promise<void> {
    const staged = wrapper.emitted('stage') as Array<[() => Promise<unknown>]>
    await staged[staged.length - 1]![0]()
  }

  it('stages a pick rather than saving it, so APPLY CHANGES has something to save', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ id: 7 })])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:97710286', name: 'ADSB' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()
    await wrapper.find('[data-value="7:serial:97710286"]').trigger('mousedown')
    await flushPromises()

    // Regression: it used to save on the spot, so Apply said "NO CHANGES".
    expect(wrapper.emitted('stage')).toHaveLength(1)
    expect(setSourceSpy).not.toHaveBeenCalled()
  })

  it('saves the host id and device id split correctly on apply', async () => {
    // `serial:97710286` contains a colon, so a naive split would save
    // "serial" as the device and drop the rest.
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ id: 7 })])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:97710286', name: 'ADSB' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()
    await wrapper.find('[data-value="7:serial:97710286"]').trigger('mousedown')
    await applyStaged(wrapper)

    expect(setSourceSpy).toHaveBeenCalledWith(7, 'serial:97710286')
  })

  it('makes apply fail when the device cannot be saved, so the panel says ERROR', async () => {
    setSourceSpy.mockResolvedValue(null)
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ id: 7 })])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:97710286', name: 'ADSB' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()
    await wrapper.find('[data-value="7:serial:97710286"]').trigger('mousedown')

    await expect(applyStaged(wrapper)).rejects.toThrow('Could not save the ADS-B source')
  })

  it('pre-selects the device already configured', async () => {
    vi.spyOn(adsbSourceApi, 'getAdsbSource').mockResolvedValue({
      configured: true,
      sentry_host_id: 1,
      sentry_device_id: 'serial:97710286',
    })
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:97710286', name: 'ADSB' }),
    )

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe(
      '1:serial:97710286',
    )
  })

  describe('set back to "Not set"', () => {
    beforeEach(() => {
      vi.spyOn(adsbSourceApi, 'getAdsbSource').mockResolvedValue({
        configured: true,
        sentry_host_id: 1,
        sentry_device_id: 'serial:AAA',
      })
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
      )
    })

    it('stages the clear, and clears the saved source on apply', async () => {
      const clearSourceSpy = vi.spyOn(adsbSourceApi, 'clearAdsbSource').mockResolvedValue({
        configured: false,
        sentry_host_id: null,
        sentry_device_id: null,
      })
      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      await wrapper.find('[data-value=""]').trigger('mousedown')
      await flushPromises()
      expect(clearSourceSpy).not.toHaveBeenCalled()

      await applyStaged(wrapper)

      // Regression: "Not set" used to be dropped on the floor, so the old
      // device came back on reload and Apply reported no changes.
      expect(clearSourceSpy).toHaveBeenCalledOnce()
      expect(setSourceSpy).not.toHaveBeenCalled()
    })

    it('makes apply fail when the clear does not land', async () => {
      vi.spyOn(adsbSourceApi, 'clearAdsbSource').mockResolvedValue(null)
      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      await wrapper.find('[data-value=""]').trigger('mousedown')

      await expect(applyStaged(wrapper)).rejects.toThrow('Could not clear the ADS-B source')
    })
  })

  describe('when the Settings panel reopens', () => {
    it('drops an unapplied pick by re-reading the saved choice', async () => {
      const getSourceSpy = vi.spyOn(adsbSourceApi, 'getAdsbSource').mockResolvedValue({
        configured: true,
        sentry_host_id: 1,
        sentry_device_id: 'serial:AAA',
      })
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
      )
      const settings = useSettingsStore()
      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      await wrapper.find('[data-value=""]').trigger('mousedown')
      expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)

      settings.openPanel()
      await nextTick()
      await flushPromises()

      expect(getSourceSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe(
        '1:serial:AAA',
      )
      // Re-reading is hydration, not a pick — nothing new is staged.
      expect(wrapper.emitted('stage')).toHaveLength(1)
    })

    it('shows "Not set" when the saved choice has since been cleared', async () => {
      const getSourceSpy = vi
        .spyOn(adsbSourceApi, 'getAdsbSource')
        .mockResolvedValueOnce({
          configured: true,
          sentry_host_id: 1,
          sentry_device_id: 'serial:AAA',
        })
        .mockResolvedValueOnce({ configured: false, sentry_host_id: null, sentry_device_id: null })
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
      )
      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      useSettingsStore().openPanel()
      await nextTick()
      await flushPromises()

      expect(getSourceSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)
    })

    it('keeps the current choice when the backend cannot be reached', async () => {
      vi.spyOn(adsbSourceApi, 'getAdsbSource')
        .mockResolvedValueOnce({
          configured: true,
          sentry_host_id: 1,
          sentry_device_id: 'serial:AAA',
        })
        .mockResolvedValueOnce(null)
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
      )
      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      useSettingsStore().openPanel()
      await nextTick()
      await flushPromises()

      expect(wrapper.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe(
        '1:serial:AAA',
      )
    })

    it('does nothing when the panel closes', async () => {
      const getSourceSpy = vi.spyOn(adsbSourceApi, 'getAdsbSource')
      const settings = useSettingsStore()
      settings.openPanel()
      mount(AdsbSdrSourceControl)
      await flushPromises()
      const callsAfterMount = getSourceSpy.mock.calls.length

      settings.closePanel()
      await nextTick()
      await flushPromises()

      expect(getSourceSpy.mock.calls.length).toBe(callsAfterMount)
    })
  })

  describe('when there is nothing to pick', () => {
    it('sends the operator to SDR settings when no hosts exist', async () => {
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([])

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).toContain('Add a Sentry host')
    })

    it('points at device visibility when hosts publish nothing', async () => {
      // A Sentry only exports devices its operator enabled, so an empty list is
      // far more often a toggle than a missing dongle.
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(snapshotWith())

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).toContain('publish no SDRs')
    })

    it('says nothing extra once devices are available', async () => {
      vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
      vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
        snapshotWith({ device_id: 'serial:AAA', name: 'ADSB' }),
      )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).not.toContain('Add a Sentry host')
      expect(wrapper.text()).not.toContain('publish no SDRs')
    })
  })
})
