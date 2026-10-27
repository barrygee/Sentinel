/**
 * Test doubles shared by the THIS MACHINE specs: builders for the API's wire
 * shapes and a scriptable `EventSource`.
 */
import type {
  LocalAuthState,
  LocalDeviceStatus,
  LocalHotspotState,
  LocalPortConstraints,
} from '../api/types'

/** A configured, present, idle device; override any field. */
export function makeDevice(overrides: Partial<LocalDeviceStatus> = {}): LocalDeviceStatus {
  return {
    device_id: 'device-1',
    name: 'Roof',
    present: true,
    state: 'configured',
    state_reason: null,
    enabled: false,
    visibility: 'public',
    notes: '',
    antenna: '',
    needs_identification: false,
    output: { iq_port: 1234, control_port: 1236, host: '0.0.0.0' },
    usb: {
      manufacturer: 'Realtek',
      product: 'RTL2838',
      serial: '00000001',
      topology_path: '1-1',
    },
    usb_last_known: null,
    record_id: 1,
    state_since: 0,
    tuner: null,
    last_seen_at: null,
    ...overrides,
  }
}

/** Port rules like the API's defaults. */
export function makeConstraints(
  overrides: Partial<LocalPortConstraints> = {},
): LocalPortConstraints {
  return {
    port_min: 1024,
    port_max: 65000,
    reserved: [8080],
    internal_range: [5000, 5100],
    in_use: [],
    ...overrides,
  }
}

export function makeAuthState(overrides: Partial<LocalAuthState> = {}): LocalAuthState {
  return {
    password_set: true,
    authenticated: true,
    updated_at: 1000,
    minimum_password_length: 10,
    ...overrides,
  }
}

export function makeHotspotState(overrides: Partial<LocalHotspotState> = {}): LocalHotspotState {
  return {
    available: true,
    control_enabled: true,
    auth_token_configured: true,
    configured: true,
    enabled: false,
    active: false,
    interface: 'wlan0',
    ssid: 'Sentinel',
    hidden: false,
    security: 'wpa2',
    band: 'bg',
    channel: 0,
    gateway_address: null,
    gateway_cidr: null,
    passphrase_set: true,
    uplink_interface_is_hotspot_interface: false,
    pending_confirmation: false,
    confirm_deadline_ms: null,
    last_error: null,
    warnings: [],
    generated_at: 0,
    ...overrides,
  }
}

type Listener = (event: Event) => void

/** A scriptable `EventSource`: tests emit named events and drop the connection by hand. */
export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly url: string
  readyState = FakeEventSource.OPEN
  closed = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  /** The most recently opened source. */
  static get latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1)
    if (!latest) throw new Error('no EventSource was opened')
    return latest
  }

  static reset(): void {
    FakeEventSource.instances = []
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  close(): void {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }

  /** Deliver a named event; `payload` is JSON-encoded unless it is already a string. */
  emit(name: string, payload: unknown): void {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
    for (const listener of this.listeners.get(name) ?? []) {
      listener(new MessageEvent(name, { data }))
    }
  }

  /** The browser's `error` event, with the connection left in `readyState`. */
  fail(readyState: number): void {
    this.readyState = readyState
    for (const listener of this.listeners.get('error') ?? []) listener(new Event('error'))
  }
}
