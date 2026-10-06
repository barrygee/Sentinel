import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { provideFakeRadio } from '@sentinel/shell-api/testing/fakeRadio'
import { landSidebarFilter } from './landSidebarFilter'
import { useLandStore } from './stores/land'
import LandFilterSubTabIcon from './LandFilterSubTabIcon.vue'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ put: vi.fn(), getNamespace: vi.fn() }))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

describe('landSidebarFilter', () => {
  let withdrawRadio: (() => void) | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.put).mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    withdrawRadio?.()
    withdrawRadio = null
  })

  it('disables APRS, saying why, when no radio platform is present', () => {
    expect(landSidebarFilter.tabs()).toEqual([
      { id: 'aprs', label: 'APRS STATIONS — NO SDR SET', disabled: true },
      { id: 'repeaters', label: 'REPEATERS' },
    ])
    expect(landSidebarFilter.icon).toBe(LandFilterSubTabIcon)
  })

  it('disables APRS while the radio platform has no APRS radio', () => {
    withdrawRadio = provideFakeRadio().withdraw
    expect(landSidebarFilter.tabs()[0]).toEqual({
      id: 'aprs',
      label: 'APRS STATIONS — NO SDR SET',
      disabled: true,
    })
  })

  it('enables APRS once a radio decodes it', () => {
    withdrawRadio = provideFakeRadio({ activeDecoders: { aprs: 2 } }).withdraw
    expect(landSidebarFilter.tabs()[0]).toEqual({
      id: 'aprs',
      label: 'APRS STATIONS',
      disabled: false,
    })
  })

  it('shows exactly the picked layer and saves it as the default at once', () => {
    landSidebarFilter.select('aprs')
    expect(useLandStore().activeLayer).toBe('aprs')
    expect(landSidebarFilter.isActive('aprs')).toBe(true)
    expect(landSidebarFilter.isActive('repeaters')).toBe(false)
    expect(settingsApi.put).toHaveBeenLastCalledWith('land', 'defaultLayers', ['aprs'])

    landSidebarFilter.select('repeaters')
    expect(landSidebarFilter.isActive('repeaters')).toBe(true)
    expect(settingsApi.put).toHaveBeenLastCalledWith('land', 'defaultLayers', ['repeaters'])
  })
})
