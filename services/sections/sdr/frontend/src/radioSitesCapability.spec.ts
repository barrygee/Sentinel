import { describe, it, expect, vi, afterEach } from 'vitest'
import * as sentryApi from './services/sentryApi'
import { createSdrRadioSitesCapability } from './radioSitesCapability'

/**
 * The sdr section's `radioSites` capability: the Sentry fleet read through the
 * Sentry admin API, for core's site markers and Air's ADS-B receiver picker.
 * (These cases used to live in AdsbSdrSourceControl's spec, when Air read the
 * Sentry API itself.)
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
): sentryApi.SentryDeviceSnapshot {
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
    const listSpy = vi.spyOn(sentryApi, 'listSentrySites').mockResolvedValue([site])

    await expect(createSdrRadioSitesCapability().listSites()).resolves.toEqual([site])
    expect(listSpy).toHaveBeenCalledOnce()
  })
})

describe('sdr radioSites capability — devices', () => {
  it("lists every enabled host's devices, labelled by host name", async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith(
        { device_id: 'serial:AAA', name: 'ADSB' },
        { device_id: 'usb:1-1.2', name: 'Spare', enabled: false, visibility: 'private' },
      ),
    )

    await expect(createSdrRadioSitesCapability().listDevices()).resolves.toEqual({
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
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ enabled: false })])
    const devicesSpy = vi.spyOn(sentryApi, 'getSentryHostDevices')

    const fleet = await createSdrRadioSitesCapability().listDevices()

    expect(devicesSpy).not.toHaveBeenCalled()
    expect(fleet).toEqual({ hostCount: 1, hosts: [] })
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

    const fleet = await createSdrRadioSitesCapability().listDevices()

    expect(fleet.hostCount).toBe(2)
    expect(fleet.hosts.map((entry) => entry.label)).toEqual(['Live Pi'])
  })

  it('degrades to an empty fleet when Sentinel itself cannot be reached', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockRejectedValue(new Error('offline'))

    await expect(createSdrRadioSitesCapability().listDevices()).resolves.toEqual({
      hostCount: 0,
      hosts: [],
    })
  })

  it('falls back to the address for an unnamed host and the id for an unnamed device', async () => {
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host({ name: null })])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue(
      snapshotWith({ device_id: 'serial:AAA', name: '' }),
    )

    const fleet = await createSdrRadioSitesCapability().listDevices()

    expect(fleet.hosts[0]!.label).toBe('192.168.5.67')
    expect(fleet.hosts[0]!.devices[0]!.name).toBe('serial:AAA')
  })

  it('treats a host with no status payload yet as publishing nothing', async () => {
    // The poller reports `status: null` for a host it has not reached yet.
    vi.spyOn(sentryApi, 'listSentryHosts').mockResolvedValue([host()])
    vi.spyOn(sentryApi, 'getSentryHostDevices').mockResolvedValue({
      ...snapshotWith(),
      status: null,
    })

    const fleet = await createSdrRadioSitesCapability().listDevices()

    expect(fleet.hosts).toEqual([{ id: 1, label: 'Attic Pi', devices: [] }])
  })
})
