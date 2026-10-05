import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
const registerSettingsHydrator = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/settingsHydration', () => ({ registerSettingsHydrator }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sidebarRegistry', () => ({ registerSidebarFilterSubTabs }))
// LandView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which LandView.spec.ts already covers).
vi.mock('./LandView.vue', () => ({ default: { name: 'LandView' } }))

describe('components/land/section', () => {
  it('registers the LAND section with its id, label, navOrder, and routed view', async () => {
    const { default: LandView } = await import('./LandView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'land',
      label: 'LAND',
      navOrder: 40,
      enabledByDefault: false,
      route: { path: '/land/', component: LandView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { landSidebarFilter } = await import('./landSidebarFilter')
    await import('./section')

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('land', landSidebarFilter)
  })

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('land')
    expect(getSettingItems().some((item) => item.section === 'land')).toBe(true)
  })

  it('hydrates its stores from the boot settings', async () => {
    const { hydrateLandFromSettings } = await import('./landSettingsHydration')
    await import('./section')

    expect(registerSettingsHydrator).toHaveBeenCalledExactlyOnceWith(
      'land',
      hydrateLandFromSettings,
    )
  })
})
