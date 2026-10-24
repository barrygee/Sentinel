import { describe, it, expect, beforeEach } from 'vitest'
import { SDR_MANAGER_SETTINGS_SECTION } from './sdrManagerSettingsSection'
import {
  getSettingsSections,
  registerSettingsSection,
  resetSettingsRegistryForTests,
} from './settingsRegistry'

beforeEach(() => {
  resetSettingsRegistryForTests()
})

describe('SDR_MANAGER_SETTINGS_SECTION', () => {
  it('names the SDR Manager entry of the Settings nav, outside the domain sections', () => {
    expect(SDR_MANAGER_SETTINGS_SECTION).toEqual({
      key: 'sdr-manager',
      label: 'SDR Manager',
      order: 15,
      domain: false,
    })
  })

  it('may be registered by both remotes, leaving a single nav entry', () => {
    registerSettingsSection(SDR_MANAGER_SETTINGS_SECTION)
    expect(() => registerSettingsSection(SDR_MANAGER_SETTINGS_SECTION)).not.toThrow()
    expect(getSettingsSections().filter((section) => section.key === 'sdr-manager')).toHaveLength(1)
  })

  it('conflicts with a differing registration under the same key', () => {
    registerSettingsSection(SDR_MANAGER_SETTINGS_SECTION)
    expect(() =>
      registerSettingsSection({ ...SDR_MANAGER_SETTINGS_SECTION, label: 'Other' }),
    ).toThrow(/already registered/)
  })
})
