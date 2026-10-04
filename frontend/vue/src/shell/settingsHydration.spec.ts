import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerSettingsHydrator,
  resetSettingsHydratorsForTests,
  runSettingsHydrators,
} from './settingsHydration'

beforeEach(() => {
  resetSettingsHydratorsForTests()
})

describe('shell/settingsHydration', () => {
  it('runs every hydrator with the boot settings, in registration order', () => {
    const calls: string[] = []
    registerSettingsHydrator('air', (settings) => void calls.push(`air:${settings.air?.x}`))
    registerSettingsHydrator('land', (settings) => void calls.push(`land:${settings.land?.y}`))

    runSettingsHydrators({ air: { x: 1 }, land: { y: 2 } })

    expect(calls).toEqual(['air:1', 'land:2'])
  })

  it('does nothing when no section registered a hydrator', () => {
    expect(() => runSettingsHydrators({})).not.toThrow()
  })

  it('refuses a second hydrator from the same section', () => {
    registerSettingsHydrator('air', () => undefined)
    expect(() => registerSettingsHydrator('air', () => undefined)).toThrow(
      'Section "air" already registered a settings hydrator',
    )
  })
})
