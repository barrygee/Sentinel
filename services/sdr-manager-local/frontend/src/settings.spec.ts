import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('registerSdrManagerLocalSettings', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function registered() {
    const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
    const { registerSdrManagerLocalSettings } = await import('./settings')
    registerSdrManagerLocalSettings()
    return { registry }
  }

  it('adds the shared SDR Manager section', async () => {
    const { registry } = await registered()

    expect(registry.getSettingsSections()).toEqual([
      { key: 'sdr-manager', label: 'SDR Manager', order: 15, domain: false },
    ])
  })

  it('adds the four THIS MACHINE items in order, each in the SDR Manager section', async () => {
    const { registry } = await registered()
    const items = registry.getSettingItems()

    expect(items.map((item) => item.id)).toEqual([
      'sdr-manager-local-devices',
      'sdr-manager-local-console-password',
      'sdr-manager-local-configuration',
      'sdr-manager-local-hotspot',
    ])
    for (const item of items) {
      expect(item).toMatchObject({
        section: 'sdr-manager',
        sectionLabel: 'SDR Manager',
        groupLabel: 'THIS MACHINE',
      })
    }
  })

  it('wires each item to its control component and layout', async () => {
    const { registry } = await registered()
    const [devices, password, configuration, hotspot] = registry.getSettingItems()
    const { default: LocalDevicesControl } =
      await import('./components/devices/LocalDevicesControl.vue')
    const { default: ConsolePasswordControl } =
      await import('./components/auth/ConsolePasswordControl.vue')
    const { default: ConfigTransferControl } =
      await import('./components/config/ConfigTransferControl.vue')
    const { default: HotspotControl } = await import('./components/hotspot/HotspotControl.vue')

    expect(devices!.control).toMatchObject({
      component: LocalDevicesControl,
      emits: ['stage'],
      layout: 'full',
    })
    expect(password!.control).toMatchObject({ component: ConsolePasswordControl, layout: 'half' })
    expect(configuration!.control).toMatchObject({
      component: ConfigTransferControl,
      layout: 'half',
    })
    expect(hotspot!.control).toMatchObject({ component: HotspotControl, layout: 'full' })
  })

  it('folds every card but Devices, the one this page is for', async () => {
    const { registry } = await registered()

    expect(
      registry.getSettingItems().map((item) => [item.id, item.control.collapsible !== undefined]),
    ).toEqual([
      ['sdr-manager-local-devices', false],
      ['sdr-manager-local-console-password', true],
      ['sdr-manager-local-configuration', true],
      ['sdr-manager-local-hotspot', true],
    ])
  })

  it('opens Console Password only while this machine has no password', async () => {
    const { registry } = await registered()
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useLocalAuthStore } = await import('./stores/localAuthStore')
    const auth = useLocalAuthStore()
    const [, password, configuration, hotspot] = registry.getSettingItems()
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

  it('links each item to its part of the SDR Manager guide', async () => {
    const { registry } = await registered()

    expect(registry.getSettingItems().map((item) => [item.id, item.docPath])).toEqual([
      ['sdr-manager-local-devices', 'use/sdr-manager#set-up-a-dongle'],
      ['sdr-manager-local-console-password', 'use/sdr-manager#the-other-cards'],
      ['sdr-manager-local-configuration', 'use/sdr-manager#the-other-cards'],
      ['sdr-manager-local-hotspot', 'use/sdr-manager#the-other-cards'],
    ])
  })

  it('accepts an identical section already registered by sdr-manager-remote', async () => {
    const registry = await import('@sentinel/shell-api/shell/settingsRegistry')
    const { SDR_MANAGER_SETTINGS_SECTION } =
      await import('@sentinel/shell-api/shell/sdrManagerSettingsSection')
    const { registerSdrManagerLocalSettings } = await import('./settings')
    registry.registerSettingsSection({ ...SDR_MANAGER_SETTINGS_SECTION })

    expect(() => registerSdrManagerLocalSettings()).not.toThrow()
    expect(registry.getSettingsSections()).toHaveLength(1)
  })
})
