import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetShownSettingsSourceModes,
  showSettingsSourceMode,
  shownSettingsSourceMode,
} from '@sentinel/shell-api/settings/settingsSourceModes'

describe('settingsSourceModes', () => {
  beforeEach(() => {
    localStorage.clear()
    forgetShownSettingsSourceModes()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the app-wide mode for a section with no mode of its own', () => {
    expect(shownSettingsSourceMode('air', 'offgrid')).toBe('offgrid')
    expect(shownSettingsSourceMode('air', 'online')).toBe('online')
  })

  it("uses a section's saved mode over the app-wide one", () => {
    localStorage.setItem('sentinel_air_sourceOverride', 'offgrid')
    expect(shownSettingsSourceMode('air', 'online')).toBe('offgrid')
  })

  it('ignores a saved value that is not a mode, such as the retired auto', () => {
    localStorage.setItem('sentinel_air_sourceOverride', 'auto')
    expect(shownSettingsSourceMode('air', 'online')).toBe('online')
  })

  it("uses the mode a section's control shows over its saved one, per section", () => {
    localStorage.setItem('sentinel_air_sourceOverride', 'online')
    showSettingsSourceMode('air', 'offgrid')
    expect(shownSettingsSourceMode('air', 'online')).toBe('offgrid')
    expect(shownSettingsSourceMode('sea', 'online')).toBe('online')
  })

  it('forgets every recorded mode', () => {
    showSettingsSourceMode('air', 'offgrid')
    showSettingsSourceMode('sea', 'offgrid')
    forgetShownSettingsSourceModes()
    expect(shownSettingsSourceMode('air', 'online')).toBe('online')
    expect(shownSettingsSourceMode('sea', 'online')).toBe('online')
  })

  it('falls back to the app-wide mode when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(shownSettingsSourceMode('air', 'offgrid')).toBe('offgrid')
  })
})
