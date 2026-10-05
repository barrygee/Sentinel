import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AdsbSdrSourceControl from './AdsbSdrSourceControl.vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import * as adsbSourceApi from '@/services/adsbSourceApi'
import { provideFakeRadioSites } from '@sentinel/shell-api/testing/fakeRadio'
import type {
  RadioSiteDevice,
  RadioSiteDevices,
} from '@sentinel/shell-api/shell/radioSitesCapability'

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

// The Sentry fleet comes from the radio platform's `radioSites` capability
// (Air never touches the Sentry admin API) — a fake here. How the fleet is
// built from the Sentry hosts is the sdr provider's own spec.
let radioSites: ReturnType<typeof provideFakeRadioSites>

function device(overrides: Partial<RadioSiteDevice> & { deviceId: string }): RadioSiteDevice {
  return { name: overrides.deviceId, enabled: true, public: true, ...overrides }
}

/** One enabled host (id 1, "Attic Pi" unless given) publishing these devices. */
function fleet(...devices: RadioSiteDevice[]): RadioSiteDevices {
  return { hostCount: 1, hosts: [{ id: 1, label: 'Attic Pi', devices }] }
}

/** Serve this fleet from the fake radio platform. */
function serveFleet(devices: RadioSiteDevices) {
  radioSites.listDevices.mockResolvedValue(devices)
}

let setSourceSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  radioSites = provideFakeRadioSites()
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
  radioSites.withdraw()
  vi.restoreAllMocks()
})

describe('AdsbSdrSourceControl', () => {
  it('lists every device from every enabled host', async () => {
    serveFleet(
      fleet(
        device({ deviceId: 'serial:97710286', name: 'ADSB' }),
        device({ deviceId: 'usb:1-1.2', name: 'RTL-SDR-V4' }),
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
    serveFleet({
      hostCount: 2,
      hosts: [
        { id: 1, label: 'Attic Pi', devices: [device({ deviceId: 'serial:AAA', name: 'ADSB' })] },
        { id: 2, label: 'Shed Pi', devices: [device({ deviceId: 'serial:AAA', name: 'ADSB' })] },
      ],
    })

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    const options = wrapper.findAll('[role="option"]').map((option) => option.text())
    expect(options).toContain('Attic Pi — ADSB')
    expect(options).toContain('Shed Pi — ADSB')
  })

  it('offers nothing when no section provides the radio platform', async () => {
    radioSites.withdraw()

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()

    expect(wrapper.text()).toContain('Add a Sentry host')
  })

  describe('what is offered as a source', () => {
    it('omits a private device', async () => {
      // Private is the operator saying, on the Sentry side, that this dongle is
      // not for sharing. Offering it here would let AIR claim and tune hardware
      // they have withdrawn.
      serveFleet(
        fleet(
          device({ deviceId: 'serial:PUB', name: 'Public', public: true }),
          device({ deviceId: 'serial:PRIV', name: 'Private', public: false }),
        ),
      )

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      const options = wrapper.findAll('[role="option"]').map((o) => o.text())
      expect(options.some((o) => o.includes('Public'))).toBe(true)
      expect(options.some((o) => o.includes('Private'))).toBe(false)
    })

    it('omits a disabled device', async () => {
      serveFleet(
        fleet(
          device({ deviceId: 'serial:ON', name: 'Running', enabled: true }),
          device({ deviceId: 'serial:OFF', name: 'Stopped', enabled: false }),
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
      serveFleet(fleet(device({ deviceId: 'serial:GONE', name: 'Withdrawn', public: false })))

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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
      const devicesSpy = radioSites.listDevices

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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
      const devicesSpy = radioSites.listDevices

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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
      const devicesSpy = radioSites.listDevices

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()
      expect(wrapper.findAll('[role="option"]').map((o) => o.text())).toContain('Attic Pi — ADSB')

      devicesSpy.mockResolvedValue(
        fleet(device({ deviceId: 'serial:AAA', name: 'ADSB', public: false })),
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
    serveFleet({
      hostCount: 1,
      hosts: [
        {
          id: 7,
          label: 'Attic Pi',
          devices: [device({ deviceId: 'serial:97710286', name: 'ADSB' })],
        },
      ],
    })

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
    serveFleet({
      hostCount: 1,
      hosts: [
        {
          id: 7,
          label: 'Attic Pi',
          devices: [device({ deviceId: 'serial:97710286', name: 'ADSB' })],
        },
      ],
    })

    const wrapper = mount(AdsbSdrSourceControl)
    await flushPromises()
    await wrapper.find('[data-value="7:serial:97710286"]').trigger('mousedown')
    await applyStaged(wrapper)

    expect(setSourceSpy).toHaveBeenCalledWith(7, 'serial:97710286')
  })

  it('makes apply fail when the device cannot be saved, so the panel says ERROR', async () => {
    setSourceSpy.mockResolvedValue(null)
    serveFleet({
      hostCount: 1,
      hosts: [
        {
          id: 7,
          label: 'Attic Pi',
          devices: [device({ deviceId: 'serial:97710286', name: 'ADSB' })],
        },
      ],
    })

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
    serveFleet(fleet(device({ deviceId: 'serial:97710286', name: 'ADSB' })))

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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
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
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))
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
      serveFleet({ hostCount: 0, hosts: [] })

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).toContain('Add a Sentry host')
    })

    it('points at device visibility when hosts publish nothing', async () => {
      // A Sentry only exports devices its operator enabled, so an empty list is
      // far more often a toggle than a missing dongle.
      serveFleet(fleet())

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).toContain('publish no SDRs')
    })

    it('says nothing extra once devices are available', async () => {
      serveFleet(fleet(device({ deviceId: 'serial:AAA', name: 'ADSB' })))

      const wrapper = mount(AdsbSdrSourceControl)
      await flushPromises()

      expect(wrapper.text()).not.toContain('Add a Sentry host')
      expect(wrapper.text()).not.toContain('publish no SDRs')
    })
  })
})
