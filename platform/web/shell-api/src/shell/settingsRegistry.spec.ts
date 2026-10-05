import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import type { SettingItem } from '../types/settings'
import {
  getSettingItems,
  getSettingsSections,
  registerSettingItems,
  registerSettingsSection,
  resetSettingsRegistryForTests,
} from './settingsRegistry'

const Control = defineComponent({ template: '<div />' })

function item(section: string, id: string): SettingItem {
  return {
    section,
    sectionLabel: section.toUpperCase(),
    id,
    label: id,
    desc: '',
    control: { component: Control },
  }
}

beforeEach(() => {
  resetSettingsRegistryForTests()
})

describe('settings sections', () => {
  it('lists sections in nav order, whatever order they registered in', () => {
    registerSettingsSection({ key: 'sea', label: 'SEA', order: 30, domain: true })
    registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })
    registerSettingsSection({ key: 'air', label: 'AIR', order: 10, domain: true })

    expect(getSettingsSections().map((section) => section.key)).toEqual(['app', 'air', 'sea'])
  })

  it('refuses a second section with the same key', () => {
    registerSettingsSection({ key: 'air', label: 'AIR', order: 10, domain: true })
    expect(() =>
      registerSettingsSection({ key: 'air', label: 'AIR 2', order: 11, domain: true }),
    ).toThrow('Settings section "air" is already registered')
  })
})

describe('setting items', () => {
  it('groups items by section in nav order, keeping each section’s registration order', () => {
    registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })
    registerSettingsSection({ key: 'air', label: 'AIR', order: 10, domain: true })
    registerSettingItems([item('air', 'air-1'), item('app', 'app-1')])
    registerSettingItems([item('air', 'air-2'), item('app', 'app-2')])

    expect(getSettingItems().map((entry) => entry.id)).toEqual(['app-1', 'app-2', 'air-1', 'air-2'])
  })

  it('lists items of a section that has no nav entry last', () => {
    registerSettingsSection({ key: 'air', label: 'AIR', order: 10, domain: true })
    registerSettingItems([item('orphan', 'orphan-1'), item('air', 'air-1')])

    expect(getSettingItems().map((entry) => entry.id)).toEqual(['air-1', 'orphan-1'])
  })

  it('refuses a second item with the same id', () => {
    registerSettingItems([item('air', 'air-1')])
    expect(() => registerSettingItems([item('sea', 'air-1')])).toThrow(
      'Setting "air-1" is already registered',
    )
  })
})
