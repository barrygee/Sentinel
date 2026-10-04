import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
const registerSidebarSectionTab = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sidebarRegistry', () => ({
  registerSidebarFilterSubTabs,
  registerSidebarSectionTab,
}))
// SpaceView.vue's real module graph pulls in a full MapLibre globe — heavy,
// and irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which SpaceView.spec.ts already covers).
vi.mock('./SpaceView.vue', () => ({ default: { name: 'SpaceView' } }))
const registerNotificationTarget = vi.hoisted(() => vi.fn())
const registerNotificationDismissHook = vi.hoisted(() => vi.fn())
vi.mock('@/shell/notificationRegistry', () => ({
  registerNotificationTarget,
  registerNotificationDismissHook,
}))
const registerBackgroundService = vi.hoisted(() => vi.fn())
vi.mock('@/shell/backgroundServices', () => ({ registerBackgroundService }))
const startSpaceAlerts = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSpaceAlertsService', () => ({
  useSpaceAlertsService: () => ({ start: startSpaceAlerts, stop: vi.fn() }),
}))

describe('components/space/section', () => {
  it('registers the SPACE section with its id, label, navOrder, and routed view', async () => {
    const { default: SpaceView } = await import('./SpaceView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'space',
      label: 'SPACE',
      navOrder: 20,
      route: { path: '/space/', component: SpaceView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { spaceSidebarFilter } = await import('./spaceSidebarFilter')
    await import('./section')

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith(
      'space',
      spaceSidebarFilter,
    )
  })

  it('registers the PASSES rail tab, shown on Space only', async () => {
    const { default: SpacePassesTabIcon } = await import('./SpacePassesTabIcon.vue')
    await import('./section')

    expect(registerSidebarSectionTab).toHaveBeenCalledExactlyOnceWith({
      id: 'passes',
      label: 'PASSES',
      sectionId: 'space',
      icon: SpacePassesTabIcon,
    })
  })

  it('registers the satellite alert click target and cancels auto-tune when its card is closed', async () => {
    const { satelliteNotificationTarget, cancelAutoTuneOnDismiss } =
      await import('./satelliteNotificationTarget')
    await import('./section')

    expect(registerNotificationTarget).toHaveBeenCalledExactlyOnceWith(satelliteNotificationTarget)
    expect(registerNotificationDismissHook).toHaveBeenCalledExactlyOnceWith(
      'autotune',
      cancelAutoTuneOnDismiss,
    )
  })

  it('registers the space alerts service, which starts the satellite pass alerts', async () => {
    await import('./section')

    expect(registerBackgroundService).toHaveBeenCalledOnce()
    const service = registerBackgroundService.mock.calls[0]![0]
    expect(service.id).toBe('space-alerts')
    expect(startSpaceAlerts).not.toHaveBeenCalled()
    service.start()
    expect(startSpaceAlerts).toHaveBeenCalledOnce()
  })

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } = await import('@/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('space')
    expect(getSettingItems().some((item) => item.section === 'space')).toBe(true)
  })
})
