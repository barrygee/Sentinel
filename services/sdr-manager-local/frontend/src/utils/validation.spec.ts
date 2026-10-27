import { describe, expect, it } from 'vitest'
import { makeConstraints } from '../testing/factories'
import {
  channelsForBand,
  CHANNELS_2GHZ,
  CHANNELS_5GHZ,
  DEVICE_NAME_MAX_LENGTH,
  SSID_MAX_BYTES,
  validateDeviceName,
  validateGatewayCidr,
  validateOutputPort,
  validatePassphrase,
  validateSerial,
  validateSsid,
} from './validation'

describe('validateDeviceName', () => {
  it('accepts every allowed character class', () => {
    expect(validateDeviceName('Roof_1.a-b (north)/2')).toBeNull()
  })

  it('refuses an empty or whitespace-only name', () => {
    expect(validateDeviceName('')).toBe('Enter a name.')
    expect(validateDeviceName('   ')).toBe('Enter a name.')
  })

  it('accepts exactly the maximum length and refuses one more', () => {
    expect(validateDeviceName('a'.repeat(DEVICE_NAME_MAX_LENGTH))).toBeNull()
    expect(validateDeviceName('a'.repeat(DEVICE_NAME_MAX_LENGTH + 1))).toBe(
      `Use ${DEVICE_NAME_MAX_LENGTH} characters or fewer.`,
    )
  })

  it('measures the trimmed name', () => {
    expect(validateDeviceName(`  ${'a'.repeat(DEVICE_NAME_MAX_LENGTH)}  `)).toBeNull()
  })

  it('refuses disallowed characters', () => {
    expect(validateDeviceName('Roof!')).toBe('Use letters, numbers, spaces and _ . - ( ) / only.')
    expect(validateDeviceName('Rööf')).not.toBeNull()
  })
})

describe('validateOutputPort', () => {
  const constraints = makeConstraints({ in_use: [3000, 3002, 4000, 4002], reserved: [8080] })

  it('asks for a port when empty', () => {
    expect(validateOutputPort(null, constraints)).toBe('Enter an output port.')
  })

  it('refuses a non-integer', () => {
    expect(validateOutputPort(1234.5, constraints)).toBe('The port must be a whole number.')
  })

  it('defers to the API when the rules are not loaded yet', () => {
    expect(validateOutputPort(1, null)).toBeNull()
  })

  it('refuses ports below and above the range, accepts the edges', () => {
    const message = 'Use a port from 1024 to 65000.'
    expect(validateOutputPort(1023, constraints)).toBe(message)
    expect(validateOutputPort(65001, constraints)).toBe(message)
    expect(validateOutputPort(1024, constraints)).toBeNull()
    expect(validateOutputPort(65000, constraints)).toBeNull()
  })

  it('refuses a port inside the internal range', () => {
    expect(validateOutputPort(5050, constraints)).toBe(
      "Ports 5000-5099 are kept for SDR Manager's own use.",
    )
  })

  it('refuses a port whose control port lands in the internal range', () => {
    expect(validateOutputPort(4999, constraints)).toContain('kept for SDR Manager')
    expect(validateOutputPort(4998, constraints)).toContain('kept for SDR Manager')
  })

  it('treats the internal range end as exclusive', () => {
    expect(validateOutputPort(5100, constraints)).toBeNull()
  })

  it('refuses a reserved port and a port whose control port is reserved', () => {
    expect(validateOutputPort(8080, constraints)).toBe('That port is reserved on this machine.')
    expect(validateOutputPort(8078, constraints)).toBe('That port is reserved on this machine.')
  })

  it('refuses a port already held by another device, by IQ or control port', () => {
    expect(validateOutputPort(3000, constraints)).toBe(
      'Port 3000 or its control port 3002 is already assigned to another device.',
    )
    // 2998 + 2 = 3000 collides.
    expect(validateOutputPort(2998, constraints)).toContain('already assigned')
    expect(validateOutputPort(3002, constraints)).toContain('already assigned')
  })

  it('lets a device keep the ports it already holds', () => {
    expect(validateOutputPort(3000, constraints, [3000, 3002])).toBeNull()
  })

  it('accepts a free port', () => {
    expect(validateOutputPort(2000, constraints)).toBeNull()
  })
})

describe('validateSerial', () => {
  it('refuses empty', () => {
    expect(validateSerial('')).toBe('Enter a serial.')
  })

  it('accepts 1 to 32 allowed characters', () => {
    expect(validateSerial('a')).toBeNull()
    expect(validateSerial('A_b-9'.padEnd(32, 'x'))).toBeNull()
  })

  it('refuses 33 characters and disallowed characters', () => {
    const message = 'Use 1-32 letters, numbers, hyphens or underscores.'
    expect(validateSerial('x'.repeat(33))).toBe(message)
    expect(validateSerial('has space')).toBe(message)
  })
})

describe('validateSsid', () => {
  it('accepts an ordinary name', () => {
    expect(validateSsid('Sentinel')).toBeNull()
  })

  it('refuses control characters', () => {
    expect(validateSsid('bad\u0007name')).toBe(
      'The network name must not contain control characters.',
    )
    expect(validateSsid('bad\u007fname')).toContain('control characters')
  })

  it('refuses leading or trailing spaces', () => {
    expect(validateSsid(' Sentinel')).toContain('start or end with a space')
    expect(validateSsid('Sentinel ')).toContain('start or end with a space')
  })

  it('refuses an empty name', () => {
    expect(validateSsid('')).toBe('Enter a network name.')
  })

  it('counts bytes, not characters', () => {
    expect(validateSsid('a'.repeat(SSID_MAX_BYTES))).toBeNull()
    expect(validateSsid('a'.repeat(SSID_MAX_BYTES + 1))).toContain('32 bytes or fewer (this is 33)')
    // 17 two-byte letters = 34 bytes but only 17 characters.
    expect(validateSsid('é'.repeat(17))).toContain('(this is 34)')
    expect(validateSsid('é'.repeat(16))).toBeNull()
  })
})

describe('validatePassphrase', () => {
  it('accepts 8 to 63 printable ASCII characters', () => {
    expect(validatePassphrase('12345678')).toBeNull()
    expect(validatePassphrase('x'.repeat(63))).toBeNull()
  })

  it('accepts a 64-character hexadecimal key', () => {
    expect(validatePassphrase('aF'.repeat(32))).toBeNull()
  })

  it('refuses too short, too long and non-hex 64-character values', () => {
    const message = 'Use 8 to 63 ordinary keyboard characters, or a 64-character hexadecimal key.'
    expect(validatePassphrase('1234567')).toBe(message)
    expect(validatePassphrase('x'.repeat(64))).toBe(message)
  })

  it('refuses non-ASCII characters', () => {
    expect(validatePassphrase('passwörd1')).not.toBeNull()
  })
})

describe('channels', () => {
  it('offers channels 1-14 for the 2.4 GHz band and the 5 GHz list otherwise', () => {
    expect(channelsForBand('bg')).toBe(CHANNELS_2GHZ)
    expect(CHANNELS_2GHZ).toHaveLength(14)
    expect(CHANNELS_2GHZ[0]).toBe(1)
    expect(CHANNELS_2GHZ[13]).toBe(14)
    expect(channelsForBand('a')).toBe(CHANNELS_5GHZ)
    expect(CHANNELS_5GHZ).toContain(36)
  })
})

describe('validateGatewayCidr', () => {
  it('accepts private host addresses in each private block', () => {
    expect(validateGatewayCidr('10.42.0.1/24')).toBeNull()
    expect(validateGatewayCidr('172.16.0.1/24')).toBeNull()
    expect(validateGatewayCidr('172.31.0.1/24')).toBeNull()
    expect(validateGatewayCidr(' 192.168.4.1/24 ')).toBeNull()
  })

  it('refuses malformed text', () => {
    const message = 'Write the address like 10.42.0.1/24.'
    expect(validateGatewayCidr('')).toBe(message)
    expect(validateGatewayCidr('10.42.0.1')).toBe(message)
    expect(validateGatewayCidr('10.42.0/24')).toBe(message)
  })

  it('refuses octets above 255', () => {
    expect(validateGatewayCidr('10.300.0.1/24')).toBe('Each part of the address must be 0 to 255.')
  })

  it('bounds the prefix length at /16 and /30', () => {
    expect(validateGatewayCidr('10.0.0.1/15')).toBe('The network size must be /16 to /30.')
    expect(validateGatewayCidr('10.0.0.1/31')).toBe('The network size must be /16 to /30.')
    expect(validateGatewayCidr('10.0.0.1/16')).toBeNull()
    expect(validateGatewayCidr('10.0.0.1/30')).toBeNull()
  })

  it('refuses public and just-outside-private addresses', () => {
    const message = 'Use a private address (10.x, 172.16-31.x or 192.168.x).'
    expect(validateGatewayCidr('8.8.8.8/24')).toBe(message)
    expect(validateGatewayCidr('172.15.0.1/24')).toBe(message)
    expect(validateGatewayCidr('172.32.0.1/24')).toBe(message)
    expect(validateGatewayCidr('192.169.0.1/24')).toBe(message)
  })

  it('refuses the network address', () => {
    expect(validateGatewayCidr('10.42.0.0/24')).toBe(
      'That is the network address itself. Use a host address.',
    )
  })

  it('refuses the broadcast address', () => {
    expect(validateGatewayCidr('10.42.0.255/24')).toBe(
      'That is the broadcast address. Use a host address.',
    )
  })

  it('computes host bits across the whole prefix, not just the last octet', () => {
    expect(validateGatewayCidr('10.42.4.0/22')).toContain('network address')
    expect(validateGatewayCidr('10.42.7.255/22')).toContain('broadcast')
    expect(validateGatewayCidr('10.42.5.0/22')).toBeNull()
    expect(validateGatewayCidr('10.42.4.1/22')).toBeNull()
    expect(validateGatewayCidr('10.42.4.0/20')).toBeNull()
    expect(validateGatewayCidr('10.42.0.0/20')).toContain('network address')
    expect(validateGatewayCidr('10.42.15.255/20')).toContain('broadcast')
  })
})
