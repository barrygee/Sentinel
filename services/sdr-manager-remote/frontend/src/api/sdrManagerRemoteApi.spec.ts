import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listHosts,
  listHostSites,
  createHost,
  updateHost,
  deleteHost,
  testHost,
  getHostDevices,
  getHostDeviceRecords,
  getHostInfo,
  patchHostDevice,
  deleteHostDevice,
  flashHostDeviceSerial,
  SdrManagerApiError,
  type SdrManagerHostCreateInput,
  type SdrManagerHealthProbeResult,
} from './sdrManagerRemoteApi'
import type {
  SdrManagerHost,
  SdrManagerDeviceSnapshot,
  SdrManagerHostInfo,
  SdrManagerDeviceRecordsPayload,
  SdrManagerDeviceRecord,
} from '@sentinel/shell-api/types/sdrManager'
import type { RadioSite } from '@sentinel/shell-api/shell/radioSitesCapability'

function mockFetch(impl: (url: string, opts?: RequestInit) => unknown): void {
  global.fetch = vi.fn((url: string | URL | Request, opts?: RequestInit) =>
    Promise.resolve(impl(String(url), opts)),
  ) as unknown as typeof fetch
}

const sampleHost: SdrManagerHost = {
  id: 1,
  name: 'Pi Roof',
  address: '192.168.1.60',
  port: 8000,
  enabled: true,
  auth_token_set: false,
  is_local: false,
  created_at: 1000,
  last_seen_at: null,
  last_error: null,
  reachable: true,
  api_version: '1.0',
}

const sampleCreateInput: SdrManagerHostCreateInput = {
  name: 'Pi Roof',
  address: '192.168.1.60',
  port: 8000,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('listHosts', () => {
  it('returns the parsed hosts on success', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve([sampleHost]) }))
    await expect(listHosts()).resolves.toEqual([sampleHost])
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts', undefined)
  })
})

const sampleSite: RadioSite = {
  id: 1,
  name: 'Pi Roof',
  address: '192.168.1.60',
  port: 8000,
  reachable: true,
  latitude: 51.5,
  longitude: -0.1,
  updated_at: 2000,
}

describe('listHostSites', () => {
  it('returns the parsed sites on success', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve([sampleSite]) }))
    await expect(listHostSites()).resolves.toEqual([sampleSite])
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/locations', undefined)
  })

  it('returns an empty list when no host reports a position', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve([]) }))
    await expect(listHostSites()).resolves.toEqual([])
  })

  it('throws the parsed rejection when the backend refuses', async () => {
    mockFetch(() => ({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ detail: { code: 'unavailable', message: 'Poller is down.' } }),
    }))
    await expect(listHostSites()).rejects.toMatchObject({
      name: 'SdrManagerApiError',
      status: 503,
      code: 'unavailable',
      message: 'Poller is down.',
    })
  })
})

describe('createHost', () => {
  it('POSTs the body and returns the created host', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(sampleHost) }))
    await expect(createHost(sampleCreateInput)).resolves.toEqual(sampleHost)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleCreateInput),
    })
  })
})

describe('updateHost', () => {
  it('PUTs the patch to the id endpoint and returns the updated host', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(sampleHost) }))
    await expect(updateHost(1, { enabled: false })).resolves.toEqual(sampleHost)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
  })
})

describe('deleteHost', () => {
  it('issues a DELETE against the id endpoint', async () => {
    mockFetch(() => ({ ok: true, status: 204 }))
    await deleteHost(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/1', {
      method: 'DELETE',
    })
  })
})

describe('testHost', () => {
  it('POSTs to the test endpoint and returns the probe result even when unreachable', async () => {
    const unreachable: SdrManagerHealthProbeResult = { reachable: false, detail: 'timed out' }
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(unreachable) }))
    await expect(testHost(1)).resolves.toEqual(unreachable)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/1/test', {
      method: 'POST',
    })
  })
})

describe('getHostDevices', () => {
  it('returns the cached device snapshot', async () => {
    const snapshot: SdrManagerDeviceSnapshot = {
      reachable: true,
      last_error: null,
      last_polled_at: 100,
      last_success_at: 100,
      api_version: '1.0',
      status: null,
    }
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(snapshot) }))
    await expect(getHostDevices(1)).resolves.toEqual(snapshot)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/1/devices', undefined)
  })
})

describe('getHostInfo', () => {
  it("returns the host record merged with Sentry's live self-report", async () => {
    const info = {
      id: 1,
      name: 'Gateshead',
      address: '192.168.5.67',
      port: 8000,
      enabled: true,
      auth_token_set: true,
      is_local: false,
      created_at: 1,
      last_seen_at: 2,
      last_error: null,
      reachable: true,
      api_version: '1',
      detail: 'ok',
      last_polled_at: 3,
      last_success_at: 3,
      health: { status: 'ok' },
      source: {
        name: 'sentry',
        version: '0.1.0',
        host: '192.168.5.67',
        http_port: 8000,
        location: { latitude: 54.95, longitude: -1.53, updated_at: 4 },
      },
      location: { latitude: 54.95, longitude: -1.53, updated_at: 4 },
      control_port_offset: 2,
    } satisfies SdrManagerHostInfo
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(info) }))
    await expect(getHostInfo(1)).resolves.toEqual(info)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr-manager/remote/hosts/1/info', undefined)
  })
})

describe('getHostDeviceRecords', () => {
  it('returns the persisted device records payload', async () => {
    const payload: SdrManagerDeviceRecordsPayload = {
      devices: [],
      port_suggestion: 1234,
      constraints: { min_port: 1024, max_port: 65535, control_port_offset: 1, reserved_ports: [] },
    }
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(payload) }))
    await expect(getHostDeviceRecords(1)).resolves.toEqual(payload)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sdr-manager/remote/hosts/1/devices/records',
      undefined,
    )
  })
})

describe('patchHostDevice', () => {
  it('PATCHes the device and URL-encodes the device id', async () => {
    const record: SdrManagerDeviceRecord = {
      device_id: 'usb:1/2',
      record_id: 5,
      name: 'RTL 1',
      description: '',
      notes: '',
      antenna: '',
      output_port: 1234,
      control_port: 1235,
      enabled: true,
      visibility: 'public',
      present: true,
      state: 'streaming',
      needs_identification: false,
      identity_kind: 'serial',
      identity_key: 'ABC',
      last_serial: 'ABC',
      last_topology_path: '',
    }
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(record) }))
    await expect(patchHostDevice(1, 'usb:1/2', { name: 'RTL 1' })).resolves.toEqual(record)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sdr-manager/remote/hosts/1/devices/usb%3A1%2F2',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'RTL 1' }),
      },
    )
  })
})

describe('deleteHostDevice', () => {
  it('issues a DELETE against the URL-encoded device id endpoint', async () => {
    mockFetch(() => ({ ok: true, status: 204 }))
    await deleteHostDevice(1, 'usb:1/2')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sdr-manager/remote/hosts/1/devices/usb%3A1%2F2',
      {
        method: 'DELETE',
      },
    )
  })
})

describe('flashHostDeviceSerial', () => {
  it('always sends confirm: true alongside the serial', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({}) }))
    await flashHostDeviceSerial(1, 'usb:1/2', 'NEW-SERIAL')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sdr-manager/remote/hosts/1/devices/usb%3A1%2F2/serial',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: 'NEW-SERIAL', confirm: true }),
      },
    )
  })
})

describe('requestJson success shapes', () => {
  it('resolves to undefined on a 204 response without parsing a body', async () => {
    const jsonSpy = vi.fn()
    mockFetch(() => ({ ok: true, status: 204, json: jsonSpy }))
    await expect(deleteHost(1)).resolves.toBeUndefined()
    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

describe('SdrManagerApiError envelope parsing', () => {
  it('throws a network_error when fetch itself rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch
    await expect(listHosts()).rejects.toMatchObject({
      name: 'SdrManagerApiError',
      status: 0,
      code: 'network_error',
    })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(() => ({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
      message: 'Request failed (HTTP 502).',
    })
  })

  it('falls back to a generic message when the body has no detail key', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve({ oops: true }) }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 500,
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })

  it('falls back to a generic message when the body is null', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve(null) }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 500,
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })

  it("parses Sentry's own {code, message} envelope and preserves extra context keys", async () => {
    mockFetch(() => ({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          detail: {
            code: 'port_conflict',
            message: 'Port 1234 is already in use.',
            conflicting_device_id: 'usb:1/1',
          },
        }),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 409,
      code: 'port_conflict',
      message: 'Port 1234 is already in use.',
      context: { conflicting_device_id: 'usb:1/1' },
    })
  })

  it('defaults code and message when the Sentry envelope omits them', async () => {
    mockFetch(() => ({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: { some_context: 'x' } }),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 400,
      code: 'unknown_error',
      message: 'Request failed (HTTP 400).',
      context: { some_context: 'x' },
    })
  })

  it('joins FastAPI list-shaped 422 entries with their field location', async () => {
    mockFetch(() => ({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          detail: [
            { loc: ['body', 'address'], msg: 'field required' },
            { loc: ['query', 'port'], msg: 'must be an integer' },
          ],
        }),
    }))
    const error = await listHosts().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SdrManagerApiError)
    const requestError = error as InstanceType<typeof SdrManagerApiError>
    expect(requestError.status).toBe(422)
    expect(requestError.code).toBe('validation_error')
    expect(requestError.message).toBe('address: field required; port: must be an integer')
    expect(requestError.context.errors).toEqual([
      { loc: ['body', 'address'], msg: 'field required' },
      { loc: ['query', 'port'], msg: 'must be an integer' },
    ])
  })

  it('describes a 422 entry with no location as the message alone', async () => {
    mockFetch(() => ({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: [{ msg: 'general failure' }] }),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      code: 'validation_error',
      message: 'general failure',
    })
  })

  it('falls back to the generic message when every 422 entry lacks a usable message', async () => {
    mockFetch(() => ({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: [{ msg: '   ' }, { loc: ['body'] }] }),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Request failed (HTTP 422).',
    })
  })

  it('parses a bare string detail as the message', async () => {
    mockFetch(() => ({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'Not authorized.' }),
    }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 403,
      code: 'unknown_error',
      message: 'Not authorized.',
    })
  })

  it('falls back to the generic message when detail is a shape none of the parsers handle', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve({ detail: 42 }) }))
    await expect(listHosts()).rejects.toMatchObject({
      status: 500,
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })
})
