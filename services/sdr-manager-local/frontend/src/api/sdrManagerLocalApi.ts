/**
 * Typed client for `/api/sdr-manager/local` — this machine's sdr-manager-local,
 * reached through the gateway (ADR 0007). One function per route of the SDR
 * Manager API the THIS MACHINE screens use.
 *
 * Every call throws `SdrManagerApiError` on a non-2xx response, carrying the
 * API's own `{code, message}`, which the screens show the operator verbatim
 * or translate (`utils/errorMessages.ts`).
 *
 * Signing in is a cookie (`sdr_manager_session`, `HttpOnly`) the browser
 * attaches itself, so no call carries a credential. A 401 means the session
 * is gone; `onUnauthorized` lets the auth state hear about it without this
 * module importing it.
 */
import {
  jsonInit,
  requestJson,
  SdrManagerApiError,
} from '@sentinel/shell-api/services/sdrManagerRequest'
import type {
  LocalAuthState,
  LocalConfigFile,
  LocalConfigImportRequest,
  LocalConfigImportResult,
  LocalDevicePatch,
  LocalDevicesListResponse,
  LocalHotspotClientsResponse,
  LocalHotspotConfigRequest,
  LocalHotspotControlResponse,
  LocalHotspotState,
  LocalSerialFlashAccepted,
  LocalStatusResponse,
  LocalWirelessInterface,
} from './types'
import type { SdrManagerDeviceRecord } from '@sentinel/shell-api/types/sdrManager'

/** Where the gateway routes sdr-manager-local's SDR Manager API. */
export const SDR_MANAGER_LOCAL_API = '/api/sdr-manager/local'

let unauthorizedHandler: (() => void) | null = null

/** Register what happens when any request comes back 401 (the session expired or was revoked). */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

async function request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  try {
    return await requestJson<TResponse>(`${SDR_MANAGER_LOCAL_API}${path}`, init)
  } catch (error) {
    if (error instanceof SdrManagerApiError && error.status === 401) unauthorizedHandler?.()
    throw error
  }
}

// ── Console password ─────────────────────────────────────────────────────────

export function getAuthState(): Promise<LocalAuthState> {
  return request<LocalAuthState>('/auth/state')
}

export function signIn(password: string): Promise<void> {
  return request<void>('/auth/login', jsonInit('POST', { password }))
}

export function signOut(): Promise<void> {
  return request<void>('/auth/logout', jsonInit('POST'))
}

/** Set the first password (`currentPassword` null) or change it. Signs out every other browser. */
export function setConsolePassword(
  newPassword: string,
  currentPassword: string | null,
): Promise<void> {
  return request<void>(
    '/auth/password',
    jsonInit('POST', {
      new_password: newPassword,
      // Omitted, not null, when there is no password yet.
      ...(currentPassword === null ? {} : { current_password: currentPassword }),
    }),
  )
}

// ── Devices ──────────────────────────────────────────────────────────────────

export function getStatus(): Promise<LocalStatusResponse> {
  return request<LocalStatusResponse>('/status')
}

export function listDevices(): Promise<LocalDevicesListResponse> {
  return request<LocalDevicesListResponse>('/devices')
}

export function patchDevice(
  deviceId: string,
  patch: LocalDevicePatch,
): Promise<SdrManagerDeviceRecord> {
  return request<SdrManagerDeviceRecord>(
    `/devices/${encodeURIComponent(deviceId)}`,
    jsonInit('PATCH', patch),
  )
}

/** Forget an absent device's saved configuration. Refused (409) while it is plugged in. */
export function forgetDevice(deviceId: string): Promise<void> {
  return request<void>(`/devices/${encodeURIComponent(deviceId)}`, jsonInit('DELETE'))
}

/** Write a new serial to the dongle's EEPROM. The outcome arrives later as a `notice` event. */
export function flashSerial(deviceId: string, serial: string): Promise<LocalSerialFlashAccepted> {
  return request<LocalSerialFlashAccepted>(
    `/devices/${encodeURIComponent(deviceId)}/serial`,
    jsonInit('POST', { serial, confirm: true }),
  )
}

// ── Hotspot ──────────────────────────────────────────────────────────────────

export function getHotspot(): Promise<LocalHotspotState> {
  return request<LocalHotspotState>('/hotspot')
}

export async function listHotspotInterfaces(): Promise<LocalWirelessInterface[]> {
  const body = await request<{ interfaces: LocalWirelessInterface[] }>('/hotspot/interfaces')
  return body.interfaces
}

export function listHotspotClients(): Promise<LocalHotspotClientsResponse> {
  return request<LocalHotspotClientsResponse>('/hotspot/clients')
}

/** Save the hotspot. Omit `passphrase` to keep the stored one. */
export function saveHotspot(body: LocalHotspotConfigRequest): Promise<LocalHotspotState> {
  return request<LocalHotspotState>('/hotspot', jsonInit('PUT', body))
}

export function startHotspot(confirmUplinkLoss: boolean): Promise<LocalHotspotState> {
  return request<LocalHotspotState>(
    '/hotspot/enable',
    jsonInit('POST', { confirm_uplink_loss: confirmUplinkLoss }),
  )
}

export function stopHotspot(confirmUplinkLoss: boolean): Promise<LocalHotspotState> {
  return request<LocalHotspotState>(
    '/hotspot/disable',
    jsonInit('POST', { confirm_uplink_loss: confirmUplinkLoss }),
  )
}

/** Keep a hotspot change that is up on trial; without it the change rolls back at the deadline. */
export function confirmHotspot(): Promise<LocalHotspotState> {
  return request<LocalHotspotState>('/hotspot/confirm', jsonInit('POST'))
}

export function deleteHotspot(): Promise<void> {
  return request<void>('/hotspot', jsonInit('DELETE'))
}

/** Ask the hotspot's DHCP server to forget one client's lease (by MAC alone). */
export function releaseHotspotLease(macAddress: string): Promise<void> {
  return request<void>(`/hotspot/clients/${encodeURIComponent(macAddress)}`, jsonInit('DELETE'))
}

/** Let (or stop) this API reconfiguring the host's Wi-Fi. */
export function setHotspotControl(enabled: boolean): Promise<LocalHotspotControlResponse> {
  return request<LocalHotspotControlResponse>('/hotspot/control', jsonInit('PUT', { enabled }))
}

// ── Configuration file ───────────────────────────────────────────────────────

/**
 * This machine's configuration file. The screens save it themselves rather
 * than linking at `/config/download`: a link opened signed out would land the
 * operator on a bare 401 page.
 */
export function getConfig(): Promise<LocalConfigFile> {
  return request<LocalConfigFile>('/config')
}

/** Apply a configuration file, narrowed to devices and/or the hotspot. */
export function importConfig(body: LocalConfigImportRequest): Promise<LocalConfigImportResult> {
  return request<LocalConfigImportResult>('/config', jsonInit('POST', body))
}

/** The realtime stream: `snapshot`, `device_changed`, `device_removed`, `health`, `notice`. */
export const EVENTS_URL = `${SDR_MANAGER_LOCAL_API}/events`
