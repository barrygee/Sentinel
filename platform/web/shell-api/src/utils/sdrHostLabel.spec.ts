import { describe, expect, it } from 'vitest'
import { sdrHostLabel, THIS_MACHINE_LABEL } from './sdrHostLabel'

describe('sdrHostLabel', () => {
  it('names this Sentinel’s own SDR Manager as this machine, ignoring any old label', () => {
    expect(
      sdrHostLabel(
        { name: 'Mac mini', address: 'host.docker.internal', is_local: true, machine_name: 'X' },
        'Home (This machine)',
      ),
    ).toBe('Home (This machine)')
  })

  it('is "This machine" for this Sentinel’s own SDR Manager when no label is passed, never Docker’s address', () => {
    expect(sdrHostLabel({ name: null, address: 'host.docker.internal', is_local: true })).toBe(
      THIS_MACHINE_LABEL,
    )
    expect(THIS_MACHINE_LABEL).toBe('This machine')
  })

  it('is the label this operator gave another host, over the name its own operator gave it', () => {
    expect(
      sdrHostLabel(
        { name: 'RPi', address: '192.168.5.67', is_local: false, machine_name: 'Shed' },
        'Home (This machine)',
      ),
    ).toBe('RPi')
  })

  it.each([null, ''])(
    'falls back to the name the host’s own operator gave it (label %j)',
    (name) => {
      expect(
        sdrHostLabel({ name, address: '192.168.5.67', is_local: false, machine_name: 'Shed' }),
      ).toBe('Shed')
    },
  )

  it.each([undefined, null, ''])(
    'is the address of another host with neither label nor published name (%j)',
    (machineName) => {
      expect(
        sdrHostLabel({
          name: null,
          address: '192.168.5.67',
          is_local: false,
          machine_name: machineName,
        }),
      ).toBe('192.168.5.67')
    },
  )
})
