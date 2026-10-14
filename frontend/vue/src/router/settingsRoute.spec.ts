import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_ROUTE_NAME,
  isSettingsRoute,
  settingsPath,
  settingsReturn,
  settingsSectionOf,
} from './settingsRoute'

describe('router/settingsRoute', () => {
  beforeEach(() => {
    settingsReturn.reset()
  })

  describe('helpers', () => {
    it('names the settings route and its default section', () => {
      expect(SETTINGS_ROUTE_NAME).toBe('settings')
      expect(DEFAULT_SETTINGS_SECTION).toBe('app')
    })

    it('recognises a settings route by name', () => {
      expect(isSettingsRoute({ name: 'settings' })).toBe(true)
      expect(isSettingsRoute({ name: undefined })).toBe(false)
      expect(isSettingsRoute({ name: 'air' })).toBe(false)
    })

    it('reads the section a settings route names, empty when none or repeated', () => {
      expect(settingsSectionOf({ params: { section: 'sdr' } })).toBe('sdr')
      expect(settingsSectionOf({ params: {} })).toBe('')
      expect(settingsSectionOf({ params: { section: ['a', 'b'] } })).toBe('')
    })

    it('builds a section URL', () => {
      expect(settingsPath('air')).toBe('/settings/air')
    })

    it('forgets where to return to on reset', () => {
      settingsReturn.path = '/air/'
      settingsReturn.reset()
      expect(settingsReturn.path).toBeNull()
    })
  })
})
