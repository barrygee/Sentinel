import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppMode } from '@sentinel/shell-api/types/appMode'

/** THIS MACHINE's cards, in both modes. */
const THIS_MACHINE_IDS = [
  'sdr-manager-local-console-password',
  'sdr-manager-local-private-access',
  'sdr-manager-local-hotspot',
]

/** This machine's SDR Manager config, which sits under App Settings › CONFIGURATION. */
const CONFIGURATION_ID = 'sdr-manager-local-configuration'

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
    it('adds THIS MACHINE to App Settings, the full app being the default', async () => {
      const { registry } = await registered()

      // The SDR section is still registered, for the radios card's This machine rows.
      expect(registry.getSettingsSections()).toEqual([
        { key: 'sdr', label: 'SDR', order: 50, domain: true },
      ])
      for (const item of registry.getSettingItems()) {
        expect(item).toMatchObject({ section: 'app', sectionLabel: 'App Settings' })
      }
    })

    it('says the same when asked for the full app by name', async () => {
      const { registry } = await registered('full')

      expect(registry.getSettingsSections().map((section) => section.key)).toEqual(['sdr'])
    })

    it('adds its config under CONFIGURATION and THIS MACHINE: its SDRs are listed in the radios card, not a card of their own', async () => {
      const { registry } = await registered()

      expect(registry.getSettingItems().map((item) => [item.id, item.groupLabel])).toEqual([
        [CONFIGURATION_ID, 'CONFIGURATION'],
        ...THIS_MACHINE_IDS.map((id) => [id, 'THIS MACHINE']),
      ])
    })

    it("places its config after App Settings' own cards, before SECURITY, and THIS MACHINE last, whichever registers first", async () => {
      const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
      const { APP_SETTINGS_POSITIONS } =
        await import('@sentinel/shell-api/shell/appSettingsSection')
      const { registerSdrManagerLocalSettings } = await import('./settings')
      registerSdrManagerLocalSettings()
      // App Settings' own cards register later (the shell boots after this remote
      // in no fixed order): Export All at the default position, the Certificate
      // card (id 'https') at the SECURITY position.
      registry.registerSettingItems(
        [
          ['export-all', undefined],
          ['https', APP_SETTINGS_POSITIONS.security],
        ].map(([id, position]) => ({
          section: 'app',
          sectionLabel: 'App Settings',
          id: id as string,
          label: id as string,
          desc: '',
          control: { component: {} },
          ...(position === undefined ? {} : { position: position as number }),
        })),
      )

      expect(registry.getSettingItems().map((item) => item.id)).toEqual([
        'export-all',
        CONFIGURATION_ID,
        'https',
        ...THIS_MACHINE_IDS,
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
    it('lists its SDRs on that mode’s own page, Settings › SDR Manager, and THIS MACHINE in App Settings', async () => {
      const { registry } = await registered('sdr-manager-local-only')

      expect(registry.getSettingsSections()).toEqual([
        { key: 'sdr-manager', label: 'SDR Manager', order: 15, domain: false },
      ])
      const [devices, ...thisMachine] = registry.getSettingItems()
      expect(devices).toMatchObject({ section: 'sdr-manager', sectionLabel: 'SDR Manager' })
      for (const item of thisMachine) {
        expect(item).toMatchObject({ section: 'app', sectionLabel: 'App Settings' })
      }
    })

    it('lists its SDRs as the first card, under DEVICES, before its config and THIS MACHINE', async () => {
      const { registry } = await registered('sdr-manager-local-only')

      expect(registry.getSettingItems().map((item) => [item.id, item.groupLabel])).toEqual([
        ['sdr-manager-local-devices', 'DEVICES'],
        [CONFIGURATION_ID, 'CONFIGURATION'],
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

    it('leaves the SDRs card without a description', async () => {
      const { registry } = await registered('sdr-manager-local-only')
      const [devices] = registry.getSettingItems()

      expect(devices!.desc).toBe('')
    })
  })

  it('wires each card to its control component and layout', async () => {
    const { registry } = await registered()
    const [configuration, password, privateAccess, hotspot] = registry.getSettingItems()
    const { default: ConsolePasswordControl } =
      await import('./components/auth/ConsolePasswordControl.vue')
    const { default: PrivateAccessControl } =
      await import('./components/privateAccess/PrivateAccessControl.vue')
    const { default: ConfigTransferControl } =
      await import('./components/config/ConfigTransferControl.vue')
    const { default: HotspotControl } = await import('./components/hotspot/HotspotControl.vue')

    expect(password!.control).toMatchObject({ component: ConsolePasswordControl, layout: 'half' })
    expect(privateAccess!.control).toMatchObject({
      component: PrivateAccessControl,
      layout: 'half',
    })
    expect(configuration!.control).toMatchObject({
      component: ConfigTransferControl,
      layout: 'half',
    })
    expect(hotspot!.control).toMatchObject({ component: HotspotControl, layout: 'full' })
  })

  it('folds every card', async () => {
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
    const [configuration, password, privateAccess, hotspot] = registry.getSettingItems()
    const openWhen = password!.control.collapsible!.openWhen!

    // Not known yet: no reason to open it.
    expect(openWhen()).toBe(false)
    auth.loaded = true
    auth.passwordSet = false
    expect(openWhen()).toBe(true)
    auth.passwordSet = true
    expect(openWhen()).toBe(false)
    // The others wait to be opened.
    expect(privateAccess!.control.collapsible!.openWhen).toBeUndefined()
    expect(configuration!.control.collapsible!.openWhen).toBeUndefined()
    expect(hotspot!.control.collapsible!.openWhen).toBeUndefined()
  })

  it('links to no guide: the cards explain themselves', async () => {
    const { registry } = await registered()

    expect(registry.getSettingItems().every((item) => item.docPath === undefined)).toBe(true)
  })
})
