import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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

describe('components/land/section', () => {
  it('registers the LAND section with its id, label, navOrder, and routed view', async () => {
    const { default: LandView } = await import('./LandView.vue')
    await registerOnce()

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
    await registerOnce()

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('land', landSidebarFilter)
  })

  it('registers its Settings section and items', async () => {
    await registerOnce()
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('land')
    expect(getSettingItems().some((item) => item.section === 'land')).toBe(true)
  })

  it('hydrates its stores from the boot settings', async () => {
    const { hydrateLandFromSettings } = await import('./landSettingsHydration')
    await registerOnce()

    expect(registerSettingsHydrator).toHaveBeenCalledExactlyOnceWith(
      'land',
      hydrateLandFromSettings,
    )
  })
})
