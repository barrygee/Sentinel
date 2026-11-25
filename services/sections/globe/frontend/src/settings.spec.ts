import { describe, it, expect, beforeEach } from 'vitest'
import { APP_SETTINGS_POSITIONS } from '@sentinel/shell-api/shell/appSettingsSection'
import {
  getSettingItems,
  resetSettingsRegistryForTests,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { registerGlobeSettings } from './settings'
import GlobeEnabledControl from './settings/GlobeEnabledControl.vue'

describe('registerGlobeSettings', () => {
  beforeEach(() => {
    resetSettingsRegistryForTests()
  })

  it('adds exactly one item: the 3D Globe switch', () => {
    registerGlobeSettings()

    expect(getSettingItems().map((item) => item.id)).toEqual(['globe-enabled'])
  })

  it('puts the switch in App Settings, in its own SECTIONS group after CONFIGURATION', () => {
    registerGlobeSettings()
    const [item] = getSettingItems()

    expect(item).toMatchObject({
      section: 'app',
      sectionLabel: 'App Settings',
      label: '3D Globe',
      groupLabel: 'SECTIONS',
      position: APP_SETTINGS_POSITIONS.optionalSections,
    })
    expect(APP_SETTINGS_POSITIONS.optionalSections).toBeGreaterThan(
      APP_SETTINGS_POSITIONS.configurationExtras,
    )
    expect(APP_SETTINGS_POSITIONS.optionalSections).toBeLessThan(APP_SETTINGS_POSITIONS.security)
  })

  it('offers it in the full app only, where sections exist', () => {
    registerGlobeSettings()

    expect(getSettingItems()[0]!.modes).toEqual(['full'])
  })

  it('edits it with the switch control, collecting its staged write', () => {
    registerGlobeSettings()

    expect(getSettingItems()[0]!.control).toEqual({
      component: GlobeEnabledControl,
      emits: ['stage'],
    })
  })

  it('links to the globe docs page and is findable by search', () => {
    registerGlobeSettings()
    const [item] = getSettingItems()

    expect(item!.docPath).toBe('use/globe')
    expect(item!.searchTerms).toContain('globe')
    expect(item!.desc).toMatch(/GLOBE section/)
  })

  it('refuses to register twice', () => {
    registerGlobeSettings()

    expect(() => registerGlobeSettings()).toThrow('Setting "globe-enabled" is already registered')
  })
})
