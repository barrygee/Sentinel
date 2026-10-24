/**
 * Operator-facing sentences for the SDR Manager API's rejection codes, so the
 * THIS MACHINE screens never show a raw code. A code with no special wording
 * falls back to the API's own message, which is written for the operator too.
 */
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'

/** How to read this machine's sdr-manager-local log, for errors whose detail is only there. */
const LOG_HINT =
  'Its output is in the SDR Manager log: run `docker compose logs sdr-manager-local`.'

const DEVICE_MESSAGES: Record<string, string> = {
  incomplete_configuration:
    'Configuring a device for the first time needs both a name and an output port.',
  port_conflict: 'That output port is already assigned to another device.',
  port_reserved_http: 'That output port is reserved and cannot be assigned to a device.',
  port_reserved_internal: 'That output port is reserved and cannot be assigned to a device.',
  port_reserved_operator: 'That output port is reserved and cannot be assigned to a device.',
  port_in_use: 'That output port is already in use on this machine.',
  port_out_of_range: 'That output port is outside the allowed range.',
  name_conflict: 'That name is already used by another device.',
  device_unidentified:
    'This device could not be told apart from another one. Replug it and try again.',
  unknown_device: 'This device is no longer known to SDR Manager.',
  device_present: 'This device was plugged back in, so it can no longer be forgotten.',
}

const SERIAL_FLASH_MESSAGES: Record<string, string> = {
  device_busy: 'This device became busy before the write could start. Disable it and try again.',
  serial_in_use: 'That serial is already used by another device. Choose a different one.',
  device_unidentified:
    'This device could not be told apart from another one. Replug it and try again.',
  rtl_eeprom_unavailable: 'The rtl_eeprom tool is not available on this machine.',
  flash_failed: 'The write failed partway through. Check the device is still connected.',
  invalid_serial: 'That serial was refused. Use 1-32 letters, numbers, hyphens or underscores.',
}

const HOTSPOT_MESSAGES: Record<string, string> = {
  hotspot_control_disabled:
    'Hotspot control is switched off on this machine. Turn it on above first.',
  auth_token_required:
    'Set a console password before starting a hotspot, or anyone who joins the network can change your SDR settings.',
  hotspot_unavailable: 'This machine cannot manage a Wi-Fi hotspot: NetworkManager did not answer.',
  passphrase_required: 'Enter a password for the hotspot.',
  hotspot_not_configured: 'Set the network name and password first.',
  uplink_loss_unconfirmed:
    "That interface carries this machine's own network connection. Confirm before continuing.",
  no_wireless_interface: 'This machine has no wireless interface that can host a network.',
  interface_not_found: 'That wireless interface is no longer present.',
  interface_ap_unsupported: 'That wireless interface cannot host a network.',
  hotspot_busy: 'Another hotspot change is still running. Wait a moment and try again.',
  no_pending_confirmation:
    'There is no hotspot change waiting to be confirmed. It may already have rolled back.',
  hotspot_command_timeout: `The network command did not finish in time. ${LOG_HINT}`,
  hotspot_command_failed: `The network command failed. ${LOG_HINT}`,
}

const CONFIG_MESSAGES: Record<string, string> = {
  unsupported_config_version:
    'This file was written by a newer SDR Manager and cannot be read by this one.',
}

function messageFrom(messages: Record<string, string>, error: unknown, fallback: string): string {
  if (!(error instanceof SdrManagerApiError)) return fallback
  if (error.status === 0) return 'Could not reach SDR Manager. Check the connection and try again.'
  return messages[error.code] ?? error.message
}

/** For a refused device edit or forget. */
export function deviceErrorMessage(error: unknown): string {
  return messageFrom(DEVICE_MESSAGES, error, 'The device could not be updated.')
}

/** For a refused serial flash. */
export function serialFlashErrorMessage(error: unknown): string {
  return messageFrom(SERIAL_FLASH_MESSAGES, error, 'The serial could not be written.')
}

/** For a serial flash that started but failed: its `notice` carries the failure code. */
export function serialFlashFailureMessage(failureCode: string): string {
  return SERIAL_FLASH_MESSAGES[failureCode] ?? 'The serial could not be written.'
}

/** For a refused hotspot action. */
export function hotspotErrorMessage(error: unknown, fallback: string): string {
  return messageFrom(HOTSPOT_MESSAGES, error, fallback)
}

/** The tail of a failed network command's output, when the API sent one. */
export function hotspotCommandOutput(error: unknown): string | null {
  if (!(error instanceof SdrManagerApiError)) return null
  const output = error.context.stderr_tail
  return typeof output === 'string' && output !== '' ? output : null
}

/** For a refused configuration export or import. */
export function configErrorMessage(error: unknown, fallback: string): string {
  return messageFrom(CONFIG_MESSAGES, error, fallback)
}

/** For a refused sign-in or password change: the API's own message, else `fallback`. */
export function authErrorMessage(error: unknown, fallback: string): string {
  return messageFrom({}, error, fallback)
}
