import type { Page } from '@playwright/test'

/** One RTL-SDR plugged into this machine, configured and streaming. */
export const LOCAL_SDR_DEVICE = {
  device_id: 'serial:00000001',
  record_id: 1,
  identity_kind: 'serial',
  identity_key: '00000001',
  needs_identification: false,
  name: 'Roof RTL-SDR',
  description: '',
  notes: '',
  antenna: 'Discone',
  state: 'streaming',
  state_since: 1_760_000_000_000,
  state_reason: null,
  present: true,
  enabled: true,
  visibility: 'public',
  usb: {
    topology_path: '1-1.2',
    manufacturer: 'Realtek',
    product: 'RTL2838UHIDIR',
    serial: '00000001',
  },
  usb_last_known: null,
  output: { host: '192.168.1.20', iq_port: 1234, control_port: 1236 },
  tuner: null,
  last_seen_at: 1_760_000_000_000,
}

/**
 * Stubs this machine's sdr-manager-local (`/api/sdr-manager/local/**`), the
 * API Settings › SDR's This machine list and THIS MACHINE group read: a console
 * password set and this browser signed in, one streaming dongle, a location,
 * and a machine that can't host a hotspot. Specs override single routes after
 * calling this (Playwright tries the newest route first).
 */
export async function installSdrManagerLocalMocks(page: Page): Promise<void> {
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/sdr-manager/local/**', (route) => {
    void route.fulfill({
      status: 404,
      ...json({ detail: { code: 'not_found', message: 'Not found.' } }),
    })
  })
  await page.route('**/api/sdr-manager/local/auth/state', (route) => {
    void route.fulfill(
      json({
        password_set: true,
        authenticated: true,
        updated_at: 1_760_000_000_000,
        minimum_password_length: 8,
      }),
    )
  })
  await page.route('**/api/sdr-manager/local/status', (route) => {
    void route.fulfill(
      json({
        generated_at: 1_760_000_000_000,
        location: { latitude: 51.5, longitude: -0.12 },
        sdrs: [LOCAL_SDR_DEVICE],
      }),
    )
  })
  await page.route('**/api/sdr-manager/local/devices', (route) => {
    void route.fulfill(
      json({
        devices: [],
        port_suggestion: 1240,
        constraints: {
          port_min: 1024,
          port_max: 65533,
          reserved: [8000],
          internal_range: [14000, 14100],
          in_use: [1234, 1236],
        },
      }),
    )
  })
  // An empty stream that asks the browser to wait ten minutes before reconnecting.
  await page.route('**/api/sdr-manager/local/events', (route) => {
    void route.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' })
  })
  await page.route('**/api/sdr-manager/local/hotspot', (route) => {
    void route.fulfill(
      json({
        available: false,
        control_enabled: false,
        auth_token_configured: true,
        configured: false,
        enabled: false,
        active: false,
        interface: null,
        ssid: null,
        hidden: true,
        security: 'wpa2',
        band: 'bg',
        channel: 0,
        gateway_address: null,
        gateway_cidr: null,
        passphrase_set: false,
        uplink_interface_is_hotspot_interface: false,
        pending_confirmation: false,
        confirm_deadline_ms: null,
        last_error: null,
        warnings: [],
        generated_at: 1_760_000_000_000,
      }),
    )
  })
  await page.route('**/api/sdr-manager/local/hotspot/interfaces', (route) => {
    void route.fulfill(json({ interfaces: [], generated_at: 1_760_000_000_000 }))
  })
  await page.route('**/api/sdr-manager/local/hotspot/clients', (route) => {
    void route.fulfill(json({ clients: null, generated_at: 1_760_000_000_000 }))
  })
}
