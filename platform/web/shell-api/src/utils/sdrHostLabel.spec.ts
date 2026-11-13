import { describe, expect, it } from 'vitest'
import { sdrHostLabel, THIS_MACHINE_LABEL } from './sdrHostLabel'

describe('sdrHostLabel', () => {
  it('is the label the operator gave, for this machine or another', () => {
    expect(
      sdrHostLabel({ name: 'Mac mini', address: 'host.docker.internal', is_local: true }),
    ).toBe('Mac mini')
    expect(sdrHostLabel({ name: 'RPi', address: '192.168.5.67', is_local: false })).toBe('RPi')
  })

  it('is "This machine" for this Sentinel’s own unlabelled SDR Manager, never Docker’s address', () => {
    expect(sdrHostLabel({ name: null, address: 'host.docker.internal', is_local: true })).toBe(
      THIS_MACHINE_LABEL,
    )
    expect(THIS_MACHINE_LABEL).toBe('This machine')
  })

  it.each([null, ''])('is the address of another unlabelled host (name %j)', (name) => {
    expect(sdrHostLabel({ name, address: '192.168.5.67', is_local: false })).toBe('192.168.5.67')
  })
})
