import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from './sdrManagerLocalApi'

const requestJson = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/services/sdrManagerRequest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentinel/shell-api/services/sdrManagerRequest')>()),
  requestJson,
}))

const BASE = '/api/sdr-manager/local'

/** The method and parsed body of the request the last call made. */
function lastRequest(): { url: string; method: string | undefined; body: unknown } {
  const [url, init] = requestJson.mock.calls.at(-1) as [string, RequestInit | undefined]
  return {
    url,
    method: init?.method,
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }
}

describe('sdrManagerLocalApi', () => {
  beforeEach(() => {
    requestJson.mockReset()
    requestJson.mockResolvedValue({})
    api.onUnauthorized(null)
  })

  it('exposes the gateway prefix and the event stream under it', () => {
    expect(api.SDR_MANAGER_LOCAL_API).toBe(BASE)
    expect(api.EVENTS_URL).toBe(`${BASE}/events`)
  })

  describe('console password', () => {
    it('reads the auth state with a plain GET', async () => {
      requestJson.mockResolvedValue({ password_set: true })

      await expect(api.getAuthState()).resolves.toEqual({ password_set: true })

      expect(requestJson).toHaveBeenCalledWith(`${BASE}/auth/state`, undefined)
    })

    it('signs in by POSTing the password', async () => {
      await api.signIn('hunter22')

      expect(lastRequest()).toEqual({
        url: `${BASE}/auth/login`,
        method: 'POST',
        body: { password: 'hunter22' },
      })
    })

    it('signs out with a bodiless POST', async () => {
      await api.signOut()

      expect(lastRequest()).toEqual({
        url: `${BASE}/auth/logout`,
        method: 'POST',
        body: undefined,
      })
    })

    it('omits current_password when setting the first password', async () => {
      await api.setConsolePassword('new-password', null)

      expect(lastRequest().body).toEqual({ new_password: 'new-password' })
      expect(lastRequest().body).not.toHaveProperty('current_password')
    })

    it('sends current_password when changing the password', async () => {
      await api.setConsolePassword('new-password', 'old-password')

      expect(lastRequest()).toEqual({
        url: `${BASE}/auth/password`,
        method: 'POST',
        body: { new_password: 'new-password', current_password: 'old-password' },
      })
    })
  })

  describe('devices', () => {
    it('reads status and the device list', async () => {
      await api.getStatus()
      expect(lastRequest().url).toBe(`${BASE}/status`)

      await api.listDevices()
      expect(lastRequest().url).toBe(`${BASE}/devices`)
    })

    it('PATCHes a device with its id URL-encoded', async () => {
      await api.patchDevice('usb/1 2', { name: 'Roof' })

      expect(lastRequest()).toEqual({
        url: `${BASE}/devices/usb%2F1%202`,
        method: 'PATCH',
        body: { name: 'Roof' },
      })
    })

    it('forgets a device with a DELETE on its encoded id', async () => {
      await api.forgetDevice('a/b')

      expect(lastRequest()).toEqual({
        url: `${BASE}/devices/a%2Fb`,
        method: 'DELETE',
        body: undefined,
      })
    })

    it('flashes a serial with the confirm flag set', async () => {
      await api.flashSerial('a/b', 'ABC-1')

      expect(lastRequest()).toEqual({
        url: `${BASE}/devices/a%2Fb/serial`,
        method: 'POST',
        body: { serial: 'ABC-1', confirm: true },
      })
    })
  })

  describe('hotspot', () => {
    it('reads the hotspot and its clients', async () => {
      await api.getHotspot()
      expect(lastRequest().url).toBe(`${BASE}/hotspot`)

      await api.listHotspotClients()
      expect(lastRequest().url).toBe(`${BASE}/hotspot/clients`)
    })

    it('unwraps the interfaces array from its envelope', async () => {
      requestJson.mockResolvedValue({ interfaces: [{ name: 'wlan0' }] })

      await expect(api.listHotspotInterfaces()).resolves.toEqual([{ name: 'wlan0' }])
      expect(lastRequest().url).toBe(`${BASE}/hotspot/interfaces`)
    })

    it('saves the hotspot with PUT', async () => {
      const body = {
        ssid: 'Sentinel',
        security: 'wpa2' as const,
        hidden: false,
        enabled: true,
        interface: null,
        band: 'bg' as const,
        channel: 0,
        gateway_cidr: null,
        confirm_uplink_loss: false,
      }

      await api.saveHotspot(body)

      expect(lastRequest()).toEqual({ url: `${BASE}/hotspot`, method: 'PUT', body })
    })

    it.each([
      ['startHotspot', api.startHotspot, '/hotspot/enable'],
      ['stopHotspot', api.stopHotspot, '/hotspot/disable'],
    ])('%s POSTs the uplink-loss confirmation', async (_name, action, path) => {
      await action(true)

      expect(lastRequest()).toEqual({
        url: `${BASE}${path}`,
        method: 'POST',
        body: { confirm_uplink_loss: true },
      })
    })

    it('confirms the hotspot with a bodiless POST', async () => {
      await api.confirmHotspot()

      expect(lastRequest()).toEqual({
        url: `${BASE}/hotspot/confirm`,
        method: 'POST',
        body: undefined,
      })
    })

    it('deletes the hotspot', async () => {
      await api.deleteHotspot()

      expect(lastRequest()).toEqual({ url: `${BASE}/hotspot`, method: 'DELETE', body: undefined })
    })

    it('releases a lease by its URL-encoded MAC address', async () => {
      await api.releaseHotspotLease('aa:bb:cc:dd:ee:ff')

      expect(lastRequest()).toEqual({
        url: `${BASE}/hotspot/clients/aa%3Abb%3Acc%3Add%3Aee%3Aff`,
        method: 'DELETE',
        body: undefined,
      })
    })

    it('switches hotspot control with PUT', async () => {
      await api.setHotspotControl(false)

      expect(lastRequest()).toEqual({
        url: `${BASE}/hotspot/control`,
        method: 'PUT',
        body: { enabled: false },
      })
    })
  })

  describe('configuration file', () => {
    it('reads the configuration', async () => {
      await api.getConfig()

      expect(lastRequest().url).toBe(`${BASE}/config`)
    })

    it('imports a configuration with POST', async () => {
      const body = { config: { version: 1 }, apply_devices: true, apply_hotspot: false }

      await api.importConfig(body)

      expect(lastRequest()).toEqual({ url: `${BASE}/config`, method: 'POST', body })
    })
  })

  describe('unauthorized handler', () => {
    it('calls the handler on a 401 and still throws the error', async () => {
      const handler = vi.fn()
      api.onUnauthorized(handler)
      const rejection = new SdrManagerApiError(401, 'unauthorized', 'Sign in')
      requestJson.mockRejectedValue(rejection)

      await expect(api.getStatus()).rejects.toBe(rejection)

      expect(handler).toHaveBeenCalledOnce()
    })

    it('does not call the handler for other statuses', async () => {
      const handler = vi.fn()
      api.onUnauthorized(handler)
      requestJson.mockRejectedValue(new SdrManagerApiError(409, 'port_conflict', 'taken'))

      await expect(api.getStatus()).rejects.toThrow('taken')

      expect(handler).not.toHaveBeenCalled()
    })

    it('does not call the handler for a non-API error', async () => {
      const handler = vi.fn()
      api.onUnauthorized(handler)
      requestJson.mockRejectedValue(new Error('boom'))

      await expect(api.getStatus()).rejects.toThrow('boom')

      expect(handler).not.toHaveBeenCalled()
    })

    it('still throws a 401 when no handler is registered', async () => {
      requestJson.mockRejectedValue(new SdrManagerApiError(401, 'unauthorized', 'Sign in'))

      await expect(api.getStatus()).rejects.toThrow('Sign in')
    })
  })
})
