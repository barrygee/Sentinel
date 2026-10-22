import { describe, it, expect, vi, afterEach } from 'vitest'
import * as hostsApi from './api/sdrManagerRemoteApi'
import type { SdrManagerDeviceSnapshot, SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { createRadioSitesCapability } from './radioSitesCapability'
import { announceHostsChanged } from './hostsChanged'

/**
 * sdr-manager-remote's `radioSites` capability: the SDR hosts read through the
 * hosts API, for core's site markers, Air's ADS-B receiver picker and the SDR
 * section's DEVICES list. (The listDevices cases used to live in
 * AdsbSdrSourceControl's spec, when Air read the Sentry API itself.)
 */

function host(overrides: Partial<SdrManagerHost> = {}): SdrManagerHost {
  return {
    id: 1,
    name: 'Attic Pi',
    address: '192.168.5.67',
    port: 8000,
    enabled: true,
    auth_token_set: true,
    is_local: false,
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
): SdrManagerDeviceSnapshot {
  return {
    reachable: true,
    last_error: null,
    last_polled_at: 0,
    last_success_at: 0,
    api_version: '1',
    status: {
      generated_at: 0,
      sdrs: devices.map((device) => ({
        enabled: true,
        visibility: 'public',
        ...device,
      })) as never[],
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sdr radioSites capability — sites', () => {
  it('lists the sites from the Sentry locations endpoint', async () => {
    const site = {
      id: 1,
      name: 'Roof Pi',
      address: '10.0.0.5',
      port: 8000,
      reachable: true,
      latitude: 51.5,
      longitude: -0.1,
      updated_at: null,
    }
    const listSpy = vi.spyOn(hostsApi, 'listHostSites').mockResolvedValue([site])

    await expect(createRadioSitesCapability().listSites()).resolves.toEqual([site])
    expect(listSpy).toHaveBeenCalledOnce()
  })
})

describe('sdr radioSites capability — devices', () => {
  it("lists every enabled host's devices, labelled by host name", async () => {
    vi.spyOn(hostsApi, 'listHosts').mockResolvedValue([host()])
    vi.spyOn(hostsApi, 'getHostDevices').mockResolvedValue(
      snapshotWith(
        { device_id: 'serial:AAA', name: 'ADSB' },
        { device_id: 'usb:1-1.2', name: 'Spare', enabled: false, visibility: 'private' },
      ),
    )

    await expect(createRadioSitesCapability().listDevices()).resolves.toEqual({
      hostCount: 1,
      hosts: [
        {
          id: 1,
          label: 'Attic Pi',
          devices: [
            { deviceId: 'serial:AAA', name: 'ADSB', enabled: true, public: true },
            { deviceId: 'usb:1-1.2', name: 'Spare', enabled: false, public: false },
          ],
        },
      ],
    })
  })

  it('skips hosts that are switched off, but still counts them', async () => {
    vi.spyOn(hostsApi, 'listHosts').mockResolvedValue([host({ enabled: false })])
    const devicesSpy = vi.spyOn(hostsApi, 'getHostDevices')

    const fleet = await createRadioSitesCapability().listDevices()

    expect(devicesSpy).not.toHaveBeenCalled()
    expect(fleet).toEqual({ hostCount: 1, hosts: [] })
  })

  it('survives an unreachable host rather than losing the whole list', async () => {
    vi.spyOn(hostsApi, 'listHosts').mockResolvedValue([
      host({ id: 1, name: 'Dead Pi' }),
      host({ id: 2, name: 'Live Pi' }),
    ])
    vi.spyOn(hostsApi, 'getHostDevices').mockImplementation(async (hostId: number) => {
      if (hostId === 1) throw new Error('unreachable')
      return snapshotWith({ device_id: 'serial:BBB', name: 'ADSB' })
    })

    const fleet = await createRadioSitesCapability().listDevices()

    expect(fleet.hostCount).toBe(2)
    expect(fleet.hosts.map((entry) => entry.label)).toEqual(['Live Pi'])
  })

  it('degrades to an empty fleet when Sentinel itself cannot be reached', async () => {
    vi.spyOn(hostsApi, 'listHosts').mockRejectedValue(new Error('offline'))

    await expect(createRadioSitesCapability().listDevices()).resolves.toEqual({
      hostCount: 0,
      hosts: [],
    })
  })

  it('falls back to the address for an unnamed host and the id for an unnamed device', async () => {
    vi.spyOn(hostsApi, 'listHosts').mockResolvedValue([host({ name: null })])
    vi.spyOn(hostsApi, 'getHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:AAA', name: '' }),
    )

    const fleet = await createRadioSitesCapability().listDevices()

    expect(fleet.hosts[0]!.label).toBe('192.168.5.67')
    expect(fleet.hosts[0]!.devices[0]!.name).toBe('serial:AAA')
  })

  it('treats a host with no status payload yet as publishing nothing', async () => {
    // The poller reports `status: null` for a host it has not reached yet.
    vi.spyOn(hostsApi, 'listHosts').mockResolvedValue([host()])
    vi.spyOn(hostsApi, 'getHostDevices').mockResolvedValue({
      ...snapshotWith(),
      status: null,
    })

    const fleet = await createRadioSitesCapability().listDevices()

    expect(fleet.hosts).toEqual([{ id: 1, label: 'Attic Pi', devices: [] }])
  })

  describe('host and device calls the SDR section makes', () => {
    it('lists every host, disabled ones and this machine included, as the API returns them', async () => {
      const hosts = [host({ id: 1, is_local: true }), host({ id: 2, enabled: false })]
      const listSpy = vi.spyOn(hostsApi, 'listHosts').mockResolvedValue(hosts)

      await expect(createRadioSitesCapability().listHosts()).resolves.toBe(hosts)
      expect(listSpy).toHaveBeenCalledOnce()
    })

    it("reads one host's cached device snapshot", async () => {
      const snapshot = snapshotWith()
      const spy = vi.spyOn(hostsApi, 'getHostDevices').mockResolvedValue(snapshot)

      await expect(createRadioSitesCapability().getHostDevices(4)).resolves.toBe(snapshot)
      expect(spy).toHaveBeenCalledWith(4)
    })

    it("reads one host's persisted device records", async () => {
      const payload = {
        devices: [],
        port_suggestion: 1235,
        constraints: {
          min_port: 1024,
          max_port: 65535,
          control_port_offset: 1,
          reserved_ports: [],
        },
      }
      const spy = vi.spyOn(hostsApi, 'getHostDeviceRecords').mockResolvedValue(payload)

      await expect(createRadioSitesCapability().getHostDeviceRecords(4)).resolves.toBe(payload)
      expect(spy).toHaveBeenCalledWith(4)
    })

    it('patches a device and resolves with what the host stored', async () => {
      const stored = { device_id: 'serial:A', name: 'Roof' } as Awaited<
        ReturnType<typeof hostsApi.patchHostDevice>
      >
      const spy = vi.spyOn(hostsApi, 'patchHostDevice').mockResolvedValue(stored)

      await expect(
        createRadioSitesCapability().patchHostDevice(4, 'serial:A', { name: 'Roof' }),
      ).resolves.toBe(stored)
      expect(spy).toHaveBeenCalledWith(4, 'serial:A', { name: 'Roof' })
    })

    it("passes a host's rejection through unchanged, code and message intact", async () => {
      const rejection = new hostsApi.SdrManagerApiError(409, 'port_conflict', 'Port 1234 is taken.')
      vi.spyOn(hostsApi, 'patchHostDevice').mockRejectedValue(rejection)

      await expect(
        createRadioSitesCapability().patchHostDevice(4, 'serial:A', { output_port: 1234 }),
      ).rejects.toBe(rejection)
    })

    it('flashes a serial and resolves with nothing, whatever the host answered', async () => {
      const spy = vi
        .spyOn(hostsApi, 'flashHostDeviceSerial')
        .mockResolvedValue({ status: 'flashing' })

      await expect(
        createRadioSitesCapability().flashHostDeviceSerial(4, 'serial:A', 'AIS-01'),
      ).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledWith(4, 'serial:A', 'AIS-01')
    })

    it('rejects a failed flash rather than reporting success', async () => {
      vi.spyOn(hostsApi, 'flashHostDeviceSerial').mockRejectedValue(new Error('unplugged'))

      await expect(
        createRadioSitesCapability().flashHostDeviceSerial(4, 'serial:A', 'AIS-01'),
      ).rejects.toThrow('unplugged')
    })

    it('tells a subscriber about host changes until it unsubscribes', () => {
      const listener = vi.fn()
      const stop = createRadioSitesCapability().onHostsChanged(listener)

      announceHostsChanged()
      expect(listener).toHaveBeenCalledOnce()

      stop()
      announceHostsChanged()
      expect(listener).toHaveBeenCalledOnce()
    })
  })
})
