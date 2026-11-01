import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppMode } from '@sentinel/shell-api/types/appMode'

/** THIS MACHINE's cards, in both modes. */
const THIS_MACHINE_IDS = [
  'sdr-manager-local-console-password',
  'sdr-manager-local-configuration',
  'sdr-manager-local-hotspot',
]

describe('registerSdrManagerLocalSettings', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function registered(appMode?: AppMode) {
    const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
    const { registerSdrManagerLocalSettings } = await import('./settings')
    if (appMode === undefined) registerSdrManagerLocalSettings()
    else registerSdrManagerLocalSettings(appMode)
    return { registry }
  }

  describe('in the full app', () => {
    it('adds its cards to Settings › SDR, the full app being the default', async () => {
      const { registry } = await registered()

      expect(registry.getSettingsSections()).toEqual([
        { key: 'sdr', label: 'SDR', order: 50, domain: true },
      ])
      for (const item of registry.getSettingItems()) {
        expect(item).toMatchObject({ section: 'sdr', sectionLabel: 'SDR' })
      }
    })

    it('says the same when asked for the full app by name', async () => {
      const { registry } = await registered('full')

      expect(registry.getSettingsSections().map((section) => section.key)).toEqual(['sdr'])
    })

    it('adds THIS MACHINE only: its SDRs are listed in the radios card, not a card of their own', async () => {
      const { registry } = await registered()

      expect(registry.getSettingItems().map((item) => [item.id, item.groupLabel])).toEqual(
        THIS_MACHINE_IDS.map((id) => [id, 'THIS MACHINE']),
      )
    })

    it('places its cards below the radios and above the SDR options, whichever registers first', async () => {
      const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
      const { SDR_SETTINGS_POSITIONS } =
        await import('@sentinel/shell-api/shell/sdrSettingsSection')
      const { registerSdrManagerLocalSettings } = await import('./settings')
      registerSdrManagerLocalSettings()
      const sdrCard = (id: string, position: number) => ({
        section: 'sdr',
        sectionLabel: 'SDR',
        id,
        label: id,
        desc: '',
        position,
        control: { component: {} },
      })
      registry.registerSettingItems([
        sdrCard('sdr-devices', SDR_SETTINGS_POSITIONS.devices),
        sdrCard('sdr-options', SDR_SETTINGS_POSITIONS.options),
      ])

      expect(registry.getSettingItems().map((item) => item.id)).toEqual([
        'sdr-devices',
        ...THIS_MACHINE_IDS,
        'sdr-options',
      ])
    })

    it('accepts the identical SDR section the SDR section registered first', async () => {
      const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
      const { SDR_SETTINGS_SECTION } = await import('@sentinel/shell-api/shell/sdrSettingsSection')
      const { registerSdrManagerLocalSettings } = await import('./settings')
      registry.registerSettingsSection({ ...SDR_SETTINGS_SECTION })

      expect(() => registerSdrManagerLocalSettings()).not.toThrow()
      expect(registry.getSettingsSections()).toHaveLength(1)
    })
  })

  describe('in SDR Manager-only mode', () => {
    it('adds its cards to that mode’s own page, Settings › SDR Manager', async () => {
      const { registry } = await registered('sdr-manager-local-only')

      expect(registry.getSettingsSections()).toEqual([
        { key: 'sdr-manager', label: 'SDR Manager', order: 15, domain: false },
      ])
      for (const item of registry.getSettingItems()) {
        expect(item).toMatchObject({ section: 'sdr-manager', sectionLabel: 'SDR Manager' })
      }
    })

    it('lists its SDRs as the first card, under DEVICES, before THIS MACHINE', async () => {
      const { registry } = await registered('sdr-manager-local-only')

      expect(registry.getSettingItems().map((item) => [item.id, item.groupLabel])).toEqual([
        ['sdr-manager-local-devices', 'DEVICES'],
        ...THIS_MACHINE_IDS.map((id) => [id, 'THIS MACHINE']),
      ])
    })

    it('wires its SDRs card to the SDR list, staged for APPLY CHANGES', async () => {
      const { registry } = await registered('sdr-manager-local-only')
      const [devices] = registry.getSettingItems()
      const { default: LocalDevicesControl } =
        await import('./components/devices/LocalDevicesControl.vue')

      expect(devices!.label).toBe('SDRs on This Machine')
      expect(devices!.control).toEqual({
        component: LocalDevicesControl,
        emits: ['stage'],
        layout: 'full',
        naturalHeight: true,
      })
      expect(devices!.control.collapsible).toBeUndefined()
    })

    it('says what the SDRs card is for, there being no radios list above it', async () => {
      const { registry } = await registered('sdr-manager-local-only')
      const [devices] = registry.getSettingItems()

      expect(devices!.desc).toBe(
        'The SDRs plugged into this computer. Name each one, set its port and switch it on to share it.',
      )
    })
  })

  it('wires each THIS MACHINE card to its control component and layout', async () => {
    const { registry } = await registered()
    const [password, configuration, hotspot] = registry.getSettingItems()
    const { default: ConsolePasswordControl } =
      await import('./components/auth/ConsolePasswordControl.vue')
    const { default: ConfigTransferControl } =
      await import('./components/config/ConfigTransferControl.vue')
    const { default: HotspotControl } = await import('./components/hotspot/HotspotControl.vue')

    expect(password!.control).toMatchObject({ component: ConsolePasswordControl, layout: 'half' })
    expect(configuration!.control).toMatchObject({
      component: ConfigTransferControl,
      layout: 'half',
    })
    expect(hotspot!.control).toMatchObject({ component: HotspotControl, layout: 'full' })
  })

  it('folds every THIS MACHINE card', async () => {
    const { registry } = await registered()

    expect(registry.getSettingItems().every((item) => item.control.collapsible !== undefined)).toBe(
      true,
    )
  })

  it('opens Console Password only while this machine has no password', async () => {
    const { registry } = await registered()
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useLocalAuthStore } = await import('./stores/localAuthStore')
    const auth = useLocalAuthStore()
    const [password, configuration, hotspot] = registry.getSettingItems()
    const openWhen = password!.control.collapsible!.openWhen!

    // Not known yet: no reason to open it.
    expect(openWhen()).toBe(false)
    auth.loaded = true
    auth.passwordSet = false
    expect(openWhen()).toBe(true)
    auth.passwordSet = true
    expect(openWhen()).toBe(false)
    // The others wait to be opened.
    expect(configuration!.control.collapsible!.openWhen).toBeUndefined()
    expect(hotspot!.control.collapsible!.openWhen).toBeUndefined()
  })

  it('links to no guide: the cards explain themselves', async () => {
    const { registry } = await registered()

    expect(registry.getSettingItems().every((item) => item.docPath === undefined)).toBe(true)
  })
})
