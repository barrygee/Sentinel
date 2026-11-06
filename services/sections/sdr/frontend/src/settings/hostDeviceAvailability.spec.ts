import { describe, expect, it } from 'vitest'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import { hostDeviceAddBlockedReason, hostDeviceNotRadioReason } from './hostDeviceAvailability'

const OUTPUT = { iq_port: 1234, control_port: 1236, host: '10.0.0.1' }

function device(overrides: Partial<SdrManagerDeviceStatus> = {}): SdrManagerDeviceStatus {
  return {
    enabled: true,
    visibility: 'public',
    output: OUTPUT,
    ...overrides,
  } as SdrManagerDeviceStatus
}

describe('hostDeviceAddBlockedReason', () => {
  it('allows a public, enabled device with a port', () => {
    expect(hostDeviceAddBlockedReason(device())).toBe('')
  })

  it('blocks a private device on a host that refuses this Sentinel', () => {
    expect(hostDeviceAddBlockedReason(device({ visibility: 'private' }))).toContain('private')
  })

  it('allows a private device on a host that lets this Sentinel use it', () => {
    expect(hostDeviceAddBlockedReason(device({ visibility: 'private' }), true)).toBe('')
  })

  it('still blocks a disabled device whatever the host allows', () => {
    expect(hostDeviceAddBlockedReason(device({ enabled: false }), true)).toContain('disabled')
  })

  it('still blocks a device with no port whatever the host allows', () => {
    expect(hostDeviceAddBlockedReason(device({ output: null }), true)).toContain('output port')
  })
})

describe('hostDeviceNotRadioReason', () => {
  it('says PRIVATE on a host that refuses this Sentinel', () => {
    expect(hostDeviceNotRadioReason(device({ visibility: 'private' }))).toBe('PRIVATE')
  })

  it('is only waiting for the next poll on a host that allows it', () => {
    expect(hostDeviceNotRadioReason(device({ visibility: 'private' }), true)).toBe('ADDING…')
  })

  it('says NOT SET UP for a device with no port', () => {
    expect(hostDeviceNotRadioReason(device({ output: null }), true)).toBe('NOT SET UP')
  })

  it('is only waiting for the next poll for a public device', () => {
    expect(hostDeviceNotRadioReason(device())).toBe('ADDING…')
  })
})
