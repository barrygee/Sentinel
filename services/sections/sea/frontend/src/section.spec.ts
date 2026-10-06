import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sidebarRegistry', () => ({ registerSidebarFilterSubTabs }))
// SeaView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which SeaView.spec.ts already covers).
vi.mock('./SeaView.vue', () => ({ default: { name: 'SeaView' } }))

// `register()` runs once per file, as the module's side effects used to: each
// case asserts on the same single registration.
let registered = false
async function registerOnce(): Promise<void> {
  if (registered) return
  registered = true
  const { default: register } = await import('./section')
  register()
}

describe('components/sea/section', () => {
  it('registers the SEA section with its id, label, navOrder, and routed view', async () => {
    const { default: SeaView } = await import('./SeaView.vue')
    await registerOnce()

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'sea',
      label: 'SEA',
      navOrder: 30,
      enabledByDefault: false,
      route: { path: '/sea/', component: SeaView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { seaSidebarFilter } = await import('./seaSidebarFilter')
    await registerOnce()

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('sea', seaSidebarFilter)
  })

  it('registers its Settings section and items', async () => {
    await registerOnce()
    const { getSettingItems, getSettingsSections } =
      await import('@sentinel/shell-api/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('sea')
    expect(getSettingItems().some((item) => item.section === 'sea')).toBe(true)
  })
})
