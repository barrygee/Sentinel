import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sidebarRegistry', () => ({ registerSidebarFilterSubTabs }))
// AirView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which AirView.spec.ts already covers).
vi.mock('./AirView.vue', () => ({ default: { name: 'AirView' } }))
const registerNotificationTarget = vi.hoisted(() => vi.fn())
vi.mock('@/shell/notificationRegistry', () => ({ registerNotificationTarget }))
const registerBackgroundService = vi.hoisted(() => vi.fn())
vi.mock('@/shell/backgroundServices', () => ({ registerBackgroundService }))
const startAirAlerts = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useAirAlertsService', () => ({
  useAirAlertsService: () => ({ start: startAirAlerts, stop: vi.fn() }),
}))

describe('components/air/section', () => {
  it('registers the AIR section with its id, label, navOrder, and routed view', async () => {
    const { default: AirView } = await import('./AirView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'air',
      label: 'AIR',
      navOrder: 10,
      route: { path: '/air/', component: AirView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { airSidebarFilter } = await import('./airSidebarFilter')
    await import('./section')

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('air', airSidebarFilter)
  })

  it('registers the aircraft alert click target', async () => {
    const { aircraftNotificationTarget } = await import('./aircraftNotificationTarget')
    await import('./section')

    expect(registerNotificationTarget).toHaveBeenCalledExactlyOnceWith(aircraftNotificationTarget)
  })

  it('registers the air alerts service, which starts the aircraft/overhead alerts', async () => {
    await import('./section')

    expect(registerBackgroundService).toHaveBeenCalledOnce()
    const service = registerBackgroundService.mock.calls[0]![0]
    expect(service.id).toBe('air-alerts')
    expect(startAirAlerts).not.toHaveBeenCalled()
    service.start()
    expect(startAirAlerts).toHaveBeenCalledOnce()
  })

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } = await import('@/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('air')
    expect(getSettingItems().some((item) => item.section === 'air')).toBe(true)
  })
})
