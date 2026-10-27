/**
 * Client-side checks for the THIS MACHINE forms, mirroring the SDR Manager
 * API's own validation so an operator hears about a bad value before the
 * round trip. The API still decides: each check returns the sentence to show,
 * or null when the value is acceptable.
 */
import type { LocalHotspotBand, LocalPortConstraints } from '../api/types'

/** The API's `DEVICE_NAME_PATTERN` (`schemas/device.py`). */
const DEVICE_NAME_PATTERN = /^[A-Za-z0-9 _.\-()/]+$/
export const DEVICE_NAME_MAX_LENGTH = 64
export const ANTENNA_MAX_LENGTH = 120
export const NOTES_MAX_LENGTH = 2000

/** The API's `SERIAL_PATTERN` (`schemas/serial.py`). */
const SERIAL_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export function validateDeviceName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter a name.'
  if (trimmed.length > DEVICE_NAME_MAX_LENGTH)
    return `Use ${DEVICE_NAME_MAX_LENGTH} characters or fewer.`
  if (!DEVICE_NAME_PATTERN.test(trimmed))
    return 'Use letters, numbers, spaces and _ . - ( ) / only.'
  return null
}

/**
 * Check an output port against the API's rules. Each device takes two ports,
 * the IQ port P and its control port P + 2, so both must be free.
 *
 * @param ownPorts the ports this device already holds, which it may keep
 */
export function validateOutputPort(
  port: number | null,
  constraints: LocalPortConstraints | null,
  ownPorts: readonly number[] = [],
): string | null {
  if (port === null) return 'Enter an output port.'
  if (!Number.isInteger(port)) return 'The port must be a whole number.'
  // Before `GET /devices` answers there are no rules to check against; the API still checks.
  if (constraints === null) return null
  const controlPort = port + 2
  if (port < constraints.port_min || port > constraints.port_max) {
    return `Use a port from ${constraints.port_min} to ${constraints.port_max}.`
  }
  const [internalStart, internalEnd] = constraints.internal_range
  const isInternal = (candidate: number): boolean =>
    candidate >= internalStart && candidate < internalEnd
  if (isInternal(port) || isInternal(controlPort)) {
    return `Ports ${internalStart}-${internalEnd - 1} are kept for SDR Manager's own use.`
  }
  if (constraints.reserved.includes(port) || constraints.reserved.includes(controlPort)) {
    return 'That port is reserved on this machine.'
  }
  const takenByOthers = constraints.in_use.filter((usedPort) => !ownPorts.includes(usedPort))
  if (takenByOthers.includes(port) || takenByOthers.includes(controlPort)) {
    return `Port ${port} or its control port ${controlPort} is already assigned to another device.`
  }
  return null
}

export function validateSerial(serial: string): string | null {
  if (serial.length === 0) return 'Enter a serial.'
  if (!SERIAL_PATTERN.test(serial)) return 'Use 1-32 letters, numbers, hyphens or underscores.'
  return null
}

/** 802.11 caps a network name at 32 bytes, not characters. */
export const SSID_MAX_BYTES = 32
// eslint-disable-next-line no-control-regex -- the point is to refuse control characters.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f-\x9f]/
const PASSPHRASE_PATTERN = /^[\x20-\x7e]{8,63}$/
const RAW_KEY_PATTERN = /^[0-9a-fA-F]{64}$/

export function validateSsid(ssid: string): string | null {
  if (CONTROL_CHARACTERS.test(ssid)) return 'The network name must not contain control characters.'
  if (ssid !== ssid.trim()) return 'The network name must not start or end with a space.'
  const byteLength = new TextEncoder().encode(ssid).length
  if (byteLength < 1) return 'Enter a network name.'
  if (byteLength > SSID_MAX_BYTES) {
    return `Use ${SSID_MAX_BYTES} bytes or fewer (this is ${byteLength}). Accented letters and emoji take more than one byte each.`
  }
  return null
}

export function validatePassphrase(passphrase: string): string | null {
  if (PASSPHRASE_PATTERN.test(passphrase) || RAW_KEY_PATTERN.test(passphrase)) return null
  return 'Use 8 to 63 ordinary keyboard characters, or a 64-character hexadecimal key.'
}

export const CHANNELS_2GHZ: readonly number[] = Array.from(
  { length: 14 },
  (_unused, index) => index + 1,
)
export const CHANNELS_5GHZ: readonly number[] = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149,
  153, 157, 161, 165,
]

/** The channels a band offers, after Automatic (channel 0). */
export function channelsForBand(band: LocalHotspotBand): readonly number[] {
  return band === 'bg' ? CHANNELS_2GHZ : CHANNELS_5GHZ
}

const GATEWAY_MIN_PREFIX = 16
const GATEWAY_MAX_PREFIX = 30
const IPV4_CIDR_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/

function isPrivateIpv4(first: number, second: number): boolean {
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

/** The hotspot's own address and network size, e.g. `10.42.0.1/24`. Blank means the default. */
export function validateGatewayCidr(gatewayCidr: string): string | null {
  const match = IPV4_CIDR_PATTERN.exec(gatewayCidr.trim())
  if (!match) return 'Write the address like 10.42.0.1/24.'
  const octets = match.slice(1, 5).map(Number)
  const prefixLength = Number(match[5])
  if (octets.some((octet) => octet > 255)) return 'Each part of the address must be 0 to 255.'
  if (prefixLength < GATEWAY_MIN_PREFIX || prefixLength > GATEWAY_MAX_PREFIX) {
    return `The network size must be /${GATEWAY_MIN_PREFIX} to /${GATEWAY_MAX_PREFIX}.`
  }
  const [first = 0, second = 0, third = 0, fourth = 0] = octets
  if (!isPrivateIpv4(first, second)) {
    return 'Use a private address (10.x, 172.16-31.x or 192.168.x).'
  }
  // `>>> 0` keeps the arithmetic unsigned, so a 10.x address doesn't go negative.
  const address = ((first << 24) | (second << 16) | (third << 8) | fourth) >>> 0
  const hostMask = 2 ** (32 - prefixLength) - 1
  const hostBits = address & hostMask
  if (hostBits === 0) return 'That is the network address itself. Use a host address.'
  if (hostBits === hostMask) return 'That is the broadcast address. Use a host address.'
  return null
}
