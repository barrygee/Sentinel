import { describe, expect, it } from 'vitest'
import { MACHINE_NAME_MAX_LENGTH, THIS_MACHINE_LABEL, thisMachineLabel } from './thisMachineLabel'

describe('thisMachineLabel', () => {
  it('puts the operator’s name in front of "(This machine)"', () => {
    expect(thisMachineLabel('Home base')).toBe('Home base (This machine)')
  })

  it('trims the name before using it', () => {
    expect(thisMachineLabel('  Roof  ')).toBe('Roof (This machine)')
  })

  it.each([null, undefined, '', '   '])('is just "This machine" while unnamed (%j)', (name) => {
    expect(thisMachineLabel(name)).toBe(THIS_MACHINE_LABEL)
    expect(THIS_MACHINE_LABEL).toBe('This machine')
  })

  it('caps names at the length both SDR Manager services cut to', () => {
    expect(MACHINE_NAME_MAX_LENGTH).toBe(64)
  })
})
