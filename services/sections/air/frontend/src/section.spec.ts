import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sidebarRegistry', () => ({ registerSidebarFilterSubTabs }))
// AirView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which AirView.spec.ts already covers).
vi.mock('./AirView.vue', () => ({ default: { name: 'AirView' } }))
const registerNotificationTarget = vi.hoisted(() => vi.fn())
const registerNotificationSubscriptionSource = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/notificationRegistry', () => ({
  registerNotificationTarget,
  registerNotificationSubscriptionSource,
}))
const registerSettingsHydrator = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/settingsHydration', () => ({ registerSettingsHydrator }))
const registerBackgroundService = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/backgroundServices', () => ({ registerBackgroundService }))
const startAirAlerts = vi.hoisted(() => vi.fn())
vi.mock('./composables/useAirAlertsService', () => ({
  useAirAlertsService: () => ({ start: startAirAlerts, stop: vi.fn() }),
}))

// `register()` runs once per file, as the module's side effects used to: each
// case asserts on the same single registration.
let registered = false
async function registerOnce(): Promise<void> {
  if (registered) return
  registered = true
  const { default: register } = await import('./section')
  register()
}

describe('components/air/section', () => {
  it('registers the AIR section with its id, label, navOrder, and routed view', async () => {
    const { default: AirView } = await import('./AirView.vue')
    await registerOnce()

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'air',
      label: 'AIR',
      navOrder: 10,
      enabledByDefault: true,
      route: { path: '/air/', component: AirView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { airSidebarFilter } = await import('./airSidebarFilter')
    await registerOnce()

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('air', airSidebarFilter)
  })

  it('registers the aircraft alert click target', async () => {
    const { aircraftNotificationTarget } = await import('./aircraftNotificationTarget')
    await registerOnce()

    expect(registerNotificationTarget).toHaveBeenCalledExactlyOnceWith(aircraftNotificationTarget)
  })

  it('registers the air alerts service, which starts the aircraft/overhead alerts', async () => {
    await registerOnce()

    expect(registerBackgroundService).toHaveBeenCalledOnce()
    const service = registerBackgroundService.mock.calls[0]![0]
    expect(service.id).toBe('air-alerts')
    expect(startAirAlerts).not.toHaveBeenCalled()
    service.start()
    expect(startAirAlerts).toHaveBeenCalledOnce()
  })

  it('registers its Settings section and items', async () => {
    await registerOnce()
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('air')
    expect(getSettingItems().some((item) => item.section === 'air')).toBe(true)
  })

  it('lists its landing/departure bells and overhead alerts in Settings › Alerts', async () => {
    const { aircraftBellSubscriptions, overheadAlertSubscriptions } =
      await import('./airNotificationSubscriptions')
    await registerOnce()

    expect(registerNotificationSubscriptionSource.mock.calls).toEqual([
      [aircraftBellSubscriptions],
      [overheadAlertSubscriptions],
    ])
  })

  it('hydrates its stores from the boot settings', async () => {
    const { hydrateAirFromSettings } = await import('./airSettingsHydration')
    await registerOnce()

    expect(registerSettingsHydrator).toHaveBeenCalledExactlyOnceWith('air', hydrateAirFromSettings)
  })
})
