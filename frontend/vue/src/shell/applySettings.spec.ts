import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The section-owned parts are driven through their registries: which sections
// are on, and each section's hydrator. Spies here; the registries are tested
// in shell-api.
const registries = vi.hoisted(() => ({
  getEnabledSectionIds: vi.fn((_data: unknown) => ['air', 'sdr']),
  runSettingsHydrators: vi.fn(),
}))
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({
  getEnabledSectionIds: registries.getEnabledSectionIds,
}))
vi.mock('@sentinel/shell-api/shell/settingsHydration', () => ({
  runSettingsHydrators: registries.runSettingsHydrators,
}))

import { applySettingsPayload, refreshSettingsFromBackend } from './applySettings'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { APP_MODE_STORAGE_KEY } from '@sentinel/shell-api/utils/sourceMode'

const PAYLOAD = {
  app: {
    connectivityMode: 'offgrid',
    mapTheme: 'light',
    notificationSound: true,
    mapLayers: { roads: false },
  },
  sdr: { bandPlan: [{ name: 'Air' }] },
}

function stubFetch(response: { ok: boolean; json?: () => Promise<unknown> } | Error): void {
  vi.stubGlobal(
    'fetch',
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response),
  )
}

describe('shell/applySettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    registries.getEnabledSectionIds.mockClear()
    registries.getEnabledSectionIds.mockImplementation(() => ['air', 'sdr'])
    registries.runSettingsHydrators.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('applySettingsPayload', () => {
    it('applies every core setting and runs the section hydrators with the payload', () => {
      applySettingsPayload(PAYLOAD)

      expect(useSettingsStore().allSettings).toEqual(PAYLOAD)
      expect(registries.getEnabledSectionIds).toHaveBeenCalledWith(PAYLOAD)
      expect(useAppStore().enabledDomains).toEqual(['air', 'sdr'])
      expect(useAppStore().connectivityMode).toBe('offgrid')
      expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('offgrid')
      expect(useThemeStore().mapTheme).toBe('light')
      expect(useAppStore().notificationSound).toBe(true)
      expect(useBasemapStore().layers.roads).toBe(false)
      expect(registries.runSettingsHydrators).toHaveBeenCalledWith(PAYLOAD)
    })

    it('keeps the enabled sections when none are reported (an empty registry)', () => {
      registries.getEnabledSectionIds.mockImplementation(() => [])
      const before = [...useAppStore().enabledDomains]
      applySettingsPayload(PAYLOAD)
      expect(useAppStore().enabledDomains).toEqual(before)
    })

    it('leaves the connectivity mode alone when the payload has no valid one', () => {
      useAppStore().setConnectivityMode('offgrid')
      applySettingsPayload({ app: { connectivityMode: 'auto' } })
      expect(useAppStore().connectivityMode).toBe('offgrid')
      expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBeNull()
    })

    it('still applies the mode when localStorage refuses the write', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      applySettingsPayload({ app: { connectivityMode: 'offgrid' } })
      expect(useAppStore().connectivityMode).toBe('offgrid')
    })

    it('turns the notification sound off when the payload does not say it is on', () => {
      useAppStore().setNotificationSound(true)
      applySettingsPayload({ app: {} })
      expect(useAppStore().notificationSound).toBe(false)
    })

    it('copes with a payload that has no app namespace at all', () => {
      expect(() => applySettingsPayload({})).not.toThrow()
      expect(registries.runSettingsHydrators).toHaveBeenCalledWith({})
    })
  })

  describe('refreshSettingsFromBackend', () => {
    it('re-reads the settings, applies them, then tells everything to re-read its own', async () => {
      stubFetch({ ok: true, json: async () => PAYLOAD })
      const order: string[] = []
      registries.runSettingsHydrators.mockImplementation(() => order.push('applied'))
      const announced = vi.fn(() => order.push('announced'))
      document.addEventListener('sentinel:config-uploaded', announced)

      await expect(refreshSettingsFromBackend()).resolves.toBe(true)

      expect(fetch).toHaveBeenCalledWith('/api/settings')
      expect(useAppStore().connectivityMode).toBe('offgrid')
      expect(order).toEqual(['applied', 'announced'])
      document.removeEventListener('sentinel:config-uploaded', announced)
    })

    it.each([
      ['answers with an error', { ok: false }],
      ['is unreachable', new Error('offline')],
    ])('changes nothing and announces nothing when the backend %s', async (_case, response) => {
      stubFetch(response)
      const announced = vi.fn()
      document.addEventListener('sentinel:config-uploaded', announced)

      await expect(refreshSettingsFromBackend()).resolves.toBe(false)

      expect(registries.runSettingsHydrators).not.toHaveBeenCalled()
      expect(announced).not.toHaveBeenCalled()
      document.removeEventListener('sentinel:config-uploaded', announced)
    })

    it('changes nothing when the reply is not JSON', async () => {
      stubFetch({ ok: true, json: () => Promise.reject(new SyntaxError('bad json')) })
      await expect(refreshSettingsFromBackend()).resolves.toBe(false)
      expect(registries.runSettingsHydrators).not.toHaveBeenCalled()
    })
  })
})
