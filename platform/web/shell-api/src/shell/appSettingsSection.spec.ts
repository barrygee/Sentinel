import { describe, expect, it } from 'vitest'
import { APP_SETTINGS_CONFIGURATION_GROUP, APP_SETTINGS_POSITIONS } from './appSettingsSection'

describe('App Settings positions', () => {
  it('keeps core’s own groups at the default position', () => {
    expect(APP_SETTINGS_POSITIONS.ownGroups).toBe(0)
  })

  it('orders the page: own groups, extra configuration cards, SECURITY, then THIS MACHINE', () => {
    const { ownGroups, configurationExtras, security, thisMachine } = APP_SETTINGS_POSITIONS
    expect(ownGroups).toBeLessThan(configurationExtras)
    expect(configurationExtras).toBeLessThan(security)
    expect(security).toBeLessThan(thisMachine)
  })

  it('names the heading core’s Application Config and Export All sit under', () => {
    expect(APP_SETTINGS_CONFIGURATION_GROUP).toBe('CONFIGURATION')
  })
})
