import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import type { SettingItem } from '../types/settings'
import { SDR_SETTINGS_POSITIONS, SDR_SETTINGS_SECTION } from './sdrSettingsSection'
import {
  getSettingItems,
  getSettingsSections,
  registerSettingItems,
  registerSettingsSection,
  resetSettingsRegistryForTests,
} from './settingsRegistry'

const Control = defineComponent({ template: '<div />' })

function sdrItem(id: string, position: number): SettingItem {
  return {
    section: SDR_SETTINGS_SECTION.key,
    sectionLabel: SDR_SETTINGS_SECTION.label,
    id,
    label: id,
    desc: '',
    position,
    control: { component: Control },
  }
}

beforeEach(() => {
  resetSettingsRegistryForTests()
})

describe('SDR_SETTINGS_SECTION', () => {
  it('names the SDR domain entry of the Settings nav', () => {
    expect(SDR_SETTINGS_SECTION).toEqual({ key: 'sdr', label: 'SDR', order: 50, domain: true })
  })

  it('may be registered by the SDR section and sdr-manager-local, leaving a single nav entry', () => {
    registerSettingsSection(SDR_SETTINGS_SECTION)
    expect(() => registerSettingsSection(SDR_SETTINGS_SECTION)).not.toThrow()
    expect(getSettingsSections().filter((section) => section.key === 'sdr')).toHaveLength(1)
  })
})

describe('SDR_SETTINGS_POSITIONS', () => {
  it('puts the devices first, then this machine, then the options and frequency data', () => {
    const { devices, thisMachine, options, frequencyData } = SDR_SETTINGS_POSITIONS
    expect(devices).toBeLessThan(thisMachine)
    expect(thisMachine).toBeLessThan(options)
    expect(options).toBeLessThan(frequencyData)
  })

  it('keeps this machine below the devices even when sdr-manager-local registers first', () => {
    registerSettingsSection(SDR_SETTINGS_SECTION)
    registerSettingItems([sdrItem('this-machine', SDR_SETTINGS_POSITIONS.thisMachine)])
    registerSettingItems([
      sdrItem('radios', SDR_SETTINGS_POSITIONS.devices),
      sdrItem('options', SDR_SETTINGS_POSITIONS.options),
      sdrItem('frequencies', SDR_SETTINGS_POSITIONS.frequencyData),
    ])

    expect(getSettingItems().map((entry) => entry.id)).toEqual([
      'radios',
      'this-machine',
      'options',
      'frequencies',
    ])
  })
})
