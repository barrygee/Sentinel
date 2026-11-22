import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
const registerSidebarSectionTab = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sidebarRegistry', () => ({
  registerSidebarFilterSubTabs,
  registerSidebarSectionTab,
}))
// SpaceView.vue's real module graph pulls in a full MapLibre globe — heavy,
// and irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which SpaceView.spec.ts already covers).
vi.mock('./SpaceView.vue', () => ({ default: { name: 'SpaceView' } }))
const registerNotificationTarget = vi.hoisted(() => vi.fn())
const registerNotificationDismissHook = vi.hoisted(() => vi.fn())
const registerNotificationSubscriptionSource = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/notificationRegistry', () => ({
  registerNotificationTarget,
  registerNotificationDismissHook,
  registerNotificationSubscriptionSource,
}))
const registerBackgroundService = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/backgroundServices', () => ({ registerBackgroundService }))
const startSpaceAlerts = vi.hoisted(() => vi.fn())
vi.mock('./composables/useSpaceAlertsService', () => ({
  useSpaceAlertsService: () => ({ start: startSpaceAlerts, stop: vi.fn() }),
}))

// `register()` runs once per file, as the module's side effects used to: each
// case asserts on the same single registration.
let registered = false
async function registerOnce(): Promise<void> {
  if (registered) return
  registered = true
  const { default: register } = await import('./section')
  // register() refuses to run unless it is on the shell's (here: the active) Pinia.
  const pinia = createPinia()
  setActivePinia(pinia)
  register({ pinia })
}

describe('components/space/section', () => {
  it('registers the SPACE section with its id, label, navOrder, and routed view', async () => {
    const { default: SpaceView } = await import('./SpaceView.vue')
    await registerOnce()

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'space',
      label: 'SPACE',
      navOrder: 20,
      enabledByDefault: true,
      route: { path: '/space/', component: SpaceView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { spaceSidebarFilter } = await import('./spaceSidebarFilter')
    await registerOnce()

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith(
      'space',
      spaceSidebarFilter,
    )
  })

  it('registers the PASSES rail tab, shown on Space only', async () => {
    const { default: SpacePassesTabIcon } = await import('./SpacePassesTabIcon.vue')
    await registerOnce()

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
    await registerOnce()

    expect(registerNotificationTarget).toHaveBeenCalledExactlyOnceWith(satelliteNotificationTarget)
    expect(registerNotificationDismissHook).toHaveBeenCalledExactlyOnceWith(
      'autotune',
      cancelAutoTuneOnDismiss,
    )
  })

  it('registers the space alerts service, which starts the satellite pass alerts', async () => {
    await registerOnce()

    expect(registerBackgroundService).toHaveBeenCalledOnce()
    const service = registerBackgroundService.mock.calls[0]![0]
    expect(service.id).toBe('space-alerts')
    expect(startSpaceAlerts).not.toHaveBeenCalled()
    service.start()
    expect(startSpaceAlerts).toHaveBeenCalledOnce()
  })

  it('registers its Settings section and items', async () => {
    await registerOnce()
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('space')
    expect(getSettingItems().some((item) => item.section === 'space')).toBe(true)
  })

  it('lists its pass bells in Settings › Alerts', async () => {
    const { satellitePassSubscriptions } = await import('./satelliteNotificationSubscriptions')
    await registerOnce()

    expect(registerNotificationSubscriptionSource).toHaveBeenCalledExactlyOnceWith(
      satellitePassSubscriptions,
    )
  })
})
